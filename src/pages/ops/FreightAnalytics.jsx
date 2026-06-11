import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════
// Freight Analytics — cost vs charged ("freight recovery") by carrier,
// customer, and month.
//
// Data flows in via two CSV imports on this page:
//   1. ePIC FREIGHT CHARGED report  → freight_shipments  (orders side)
//   2. FedEx Billing Online DETAIL export → freight_invoices (cost side)
// Join key: FedEx "Original Customer Reference" carries our order number.
// ═══════════════════════════════════════════════════════════════════════

const fmt$ = (n) => {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  const s = abs >= 1000 ? `$${(abs/1000).toFixed(1)}k` : `$${abs.toFixed(0)}`
  return v < 0 ? `-${s}` : s
}
const fmt$Full = (n) => {
  const v = Number(n) || 0
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

// ── Carrier bucket from ShipVia code (extend as carriers are added) ────
function carrierFromShipVia(shipVia) {
  const s = (shipVia || '').toUpperCase()
  if (s.startsWith('FED')) return 'FedEx'
  if (s.startsWith('UPS')) return 'UPS'
  if (s.startsWith('USPS')) return 'USPS'
  return s || 'Other'
}

// ── Minimal CSV parser that handles quoted fields with commas ──────────
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = '' }
      if (c === '\r' && text[i + 1] === '\n') i++
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  // strip BOM from first header cell
  rows[0][0] = rows[0][0].replace(/^\uFEFF/, '')
  const header = rows[0].map(h => h.trim())
  return rows.slice(1).filter(r => r.length > 1 || (r[0] && r[0].trim()))
    .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

const cleanDate = (s) => {
  if (!s) return null
  const t = s.trim()
  if (!t || t === '0000-00-00') return null
  if (/^\d{8}$/.test(t)) return `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`  // 20260611
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const d = new Date(t)
  return isNaN(d) ? null : d.toISOString().slice(0, 10)
}
const num = (s) => { const v = parseFloat(String(s ?? '').replace(/[$,]/g, '')); return isNaN(v) ? 0 : v }

// ── Batched upsert (Supabase caps payload sizes) ───────────────────────
async function upsertBatched(table, rows, onConflict) {
  const BATCH = 500
  let count = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + BATCH), { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
    count += Math.min(BATCH, rows.length - i)
  }
  return count
}

// ── Paged fetch (Supabase returns max 1000 rows per select) ────────────
async function fetchAll(table, columns) {
  const PAGE = 1000
  let from = 0, all = []
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}

// ═══ Import mappers ═════════════════════════════════════════════════════

// ePIC FREIGHT CHARGED report → freight_shipments
function mapShipmentRows(records) {
  return records
    .filter(r => r.OrderNumber)
    .map(r => ({
      order_number:    String(r.OrderNumber).trim(),
      customer_name:   r.CustomerName || null,
      order_status:    r.OrderStatus || null,
      ship_via:        r.ShipVia || null,
      carrier:         carrierFromShipVia(r.ShipVia),
      date_shipped:    cleanDate(r.DateShipped),
      qty_shipped:     num(r.QtyShipped),
      n_shipments:     Math.round(num(r.NShipments)),
      freight_charged: num(r.FreightCharged),
      updated_at:      new Date().toISOString(),
    }))
}

// FedEx Billing Online DETAIL export → freight_invoices
function mapFedexInvoiceRows(records) {
  const agg = new Map()  // (invoice|tracking) → row, summing charges for dup lines
  for (const r of records) {
    const invoiceNumber = (r['Invoice Number'] || '').trim()
    const tracking = (r['Express or Ground Tracking ID'] || r['Tracking ID/Transaction ID'] || '').trim()
    if (!invoiceNumber || !tracking) continue
    const key = `${invoiceNumber}|${tracking}`
    const charge = num(r['Net Charge Amount'])
    if (agg.has(key)) { agg.get(key).net_charge += charge; continue }
    agg.set(key, {
      invoice_number:  invoiceNumber,
      tracking_id:     tracking,
      carrier:         'FedEx',
      invoice_date:    cleanDate(r['Invoice Date']),
      order_ref:       (r['Original Customer Reference'] || '').trim() || null,
      net_charge:      charge,
      service_type:    r['Service Type'] || r['Ground Service'] || null,
      shipment_date:   cleanDate(r['Shipment Date']),
      rated_weight:    num(r['Rated Weight Amount']) || null,
      pieces:          Math.round(num(r['Number of Pieces'])) || null,
      recipient_state: r['Recipient State'] || null,
      recipient_zip:   r['Recipient Zip Code'] || null,
    })
  }
  return [...agg.values()]
}

// ═══ Component ══════════════════════════════════════════════════════════

export default function FreightAnalytics() {
  const [shipments, setShipments] = useState([])
  const [invoices, setInvoices]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [importing, setImporting] = useState(null)   // 'shipments' | 'invoices'
  const [importMsg, setImportMsg] = useState(null)   // { ok, text }
  const [carrierFilter, setCarrierFilter] = useState('all')
  const [custSort, setCustSort]   = useState('margin') // 'margin' | 'cost' | 'charged'
  const shipFileRef = useRef(null)
  const invFileRef  = useRef(null)

  async function load() {
    setLoading(true)
    try {
      const [s, i] = await Promise.all([
        fetchAll('freight_shipments', 'order_number, customer_name, ship_via, carrier, date_shipped, qty_shipped, n_shipments, freight_charged'),
        fetchAll('freight_invoices',  'invoice_number, tracking_id, carrier, invoice_date, order_ref, net_charge, service_type, shipment_date'),
      ])
      setShipments(s); setInvoices(i)
    } catch (e) {
      setImportMsg({ ok: false, text: `Load failed: ${e.message}. Has freight_analytics_setup.sql been run?` })
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleImport(kind, file) {
    if (!file) return
    setImporting(kind); setImportMsg(null)
    try {
      const text = await file.text()
      const records = parseCSV(text)
      if (!records.length) throw new Error('No data rows found in file')
      if (kind === 'shipments') {
        if (!('OrderNumber' in records[0]) || !('FreightCharged' in records[0]))
          throw new Error('Expected the FREIGHT CHARGED report (OrderNumber, FreightCharged columns)')
        const rows = mapShipmentRows(records)
        const n = await upsertBatched('freight_shipments', rows, 'order_number')
        setImportMsg({ ok: true, text: `Imported ${n} shipment rows` })
      } else {
        if (!('Invoice Number' in records[0]))
          throw new Error('Expected the FedEx DETAIL invoice export (Invoice Number column). The summary export lacks the order reference — use detail format.')
        if (!('Original Customer Reference' in records[0]))
          throw new Error('No "Original Customer Reference" column — download the invoice in DETAIL format so charges can match orders.')
        const rows = mapFedexInvoiceRows(records)
        const n = await upsertBatched('freight_invoices', rows, 'invoice_number,tracking_id')
        setImportMsg({ ok: true, text: `Imported ${n} invoice lines` })
      }
      await load()
    } catch (e) {
      setImportMsg({ ok: false, text: e.message })
    }
    setImporting(null)
  }

  // ═══ Aggregation ═══
  const model = useMemo(() => {
    // cost per order from invoice lines
    const costByOrder = new Map()
    let unmatchedCost = 0, unmatchedLines = 0
    const orderNums = new Set(shipments.map(s => s.order_number))
    for (const l of invoices) {
      const ref = (l.order_ref || '').trim()
      if (ref && orderNums.has(ref)) {
        costByOrder.set(ref, (costByOrder.get(ref) || 0) + Number(l.net_charge || 0))
      } else {
        unmatchedCost += Number(l.net_charge || 0); unmatchedLines++
      }
    }

    const rows = shipments.map(s => ({
      ...s,
      qty_shipped: Number(s.qty_shipped || 0),
      n_shipments: Number(s.n_shipments || 0),
      freight_charged: Number(s.freight_charged || 0),
      cost: costByOrder.get(s.order_number) || 0,
    }))
    const carriers = [...new Set(rows.map(r => r.carrier).filter(Boolean))].sort()
    const inScope = carrierFilter === 'all' ? rows : rows.filter(r => r.carrier === carrierFilter)

    const matched = inScope.filter(r => r.cost > 0)
    const totals = {
      orders: inScope.length,
      units: inScope.reduce((a, r) => a + r.qty_shipped, 0),
      pkgs: inScope.reduce((a, r) => a + r.n_shipments, 0),
      charged: inScope.reduce((a, r) => a + r.freight_charged, 0),
      cost: inScope.reduce((a, r) => a + r.cost, 0),
      matchedOrders: matched.length,
      matchedPkgs: matched.reduce((a, r) => a + r.n_shipments, 0),
    }
    totals.margin = totals.charged - totals.cost
    totals.costPerPkg = totals.matchedPkgs > 0 ? totals.cost / totals.matchedPkgs : 0
    totals.unitsPerPkg = totals.pkgs > 0 ? totals.units / totals.pkgs : 0

    // by month (date_shipped)
    const byMonth = new Map()
    for (const r of inScope) {
      const m = (r.date_shipped || '').slice(0, 7)
      if (!m) continue
      const cur = byMonth.get(m) || { month: m, orders: 0, pkgs: 0, charged: 0, cost: 0 }
      cur.orders++; cur.pkgs += r.n_shipments; cur.charged += r.freight_charged; cur.cost += r.cost
      byMonth.set(m, cur)
    }
    const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
    const maxMonthCost = Math.max(1, ...months.map(m => m.cost))

    // by service (ship_via)
    const byVia = new Map()
    for (const r of inScope) {
      const v = r.ship_via || '—'
      const cur = byVia.get(v) || { via: v, carrier: r.carrier, orders: 0, pkgs: 0, charged: 0, cost: 0 }
      cur.orders++; cur.pkgs += r.n_shipments; cur.charged += r.freight_charged; cur.cost += r.cost
      byVia.set(v, cur)
    }
    const services = [...byVia.values()].sort((a, b) => b.cost - a.cost)

    // by customer
    const byCust = new Map()
    for (const r of inScope) {
      const c = r.customer_name || '—'
      const cur = byCust.get(c) || { customer: c, orders: 0, units: 0, pkgs: 0, charged: 0, cost: 0, costOrders: 0 }
      cur.orders++; cur.units += r.qty_shipped; cur.pkgs += r.n_shipments
      cur.charged += r.freight_charged; cur.cost += r.cost
      if (r.cost > 0) cur.costOrders++
      byCust.set(c, cur)
    }
    const customers = [...byCust.values()]
      .map(c => ({ ...c, margin: c.charged - c.cost }))
      .filter(c => c.cost > 0 || c.charged > 0)
    customers.sort((a, b) =>
      custSort === 'cost'    ? b.cost - a.cost :
      custSort === 'charged' ? b.charged - a.charged :
                               a.margin - b.margin)   // worst recovery first

    return { carriers, totals, months, maxMonthCost, services, customers, unmatchedCost, unmatchedLines }
  }, [shipments, invoices, carrierFilter, custSort])

  const m = model
  const hasData = shipments.length > 0 || invoices.length > 0

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1>Freight Analytics</h1>
          <p className="text-sm text-ink-muted mt-1">
            Carrier cost vs freight charged · {shipments.length.toLocaleString()} shipped orders · {invoices.length.toLocaleString()} invoice lines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={shipFileRef} type="file" accept=".csv,.CSV" className="hidden"
            onChange={e => { handleImport('shipments', e.target.files[0]); e.target.value = '' }} />
          <input ref={invFileRef} type="file" accept=".csv,.CSV" className="hidden"
            onChange={e => { handleImport('invoices', e.target.files[0]); e.target.value = '' }} />
          <button onClick={() => shipFileRef.current?.click()} disabled={!!importing} className="btn-ghost text-sm">
            {importing === 'shipments' ? 'Importing…' : '⬆ Freight Charged report'}
          </button>
          <button onClick={() => invFileRef.current?.click()} disabled={!!importing} className="btn-ghost text-sm">
            {importing === 'invoices' ? 'Importing…' : '⬆ FedEx invoice (detail CSV)'}
          </button>
        </div>
      </div>

      {importMsg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${
          importMsg.ok
            ? 'bg-accent-gold-soft border-accent-gold/30 text-ink-strong'
            : 'bg-status-critical/10 border-status-critical/30 text-status-critical'
        }`}>
          {importMsg.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-ink-muted text-sm">Loading…</div>
      ) : !hasData ? (
        <div className="card p-10 text-center">
          <div className="text-3xl mb-3">🚚</div>
          <div className="font-semibold text-ink-strong mb-1">No freight data yet</div>
          <div className="text-sm text-ink-muted max-w-md mx-auto">
            Import the ePIC <span className="font-semibold">FREIGHT CHARGED</span> report (orders side) and the FedEx
            invoice <span className="font-semibold">detail</span> CSV (cost side) using the buttons above. Charges match
            orders via the FedEx Customer Reference field.
          </div>
        </div>
      ) : (
        <>
          {/* Carrier filter */}
          {m.carriers.length > 1 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {['all', ...m.carriers].map(c => (
                <button key={c} onClick={() => setCarrierFilter(c)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    carrierFilter === c
                      ? 'bg-accent-clay text-ink-inverse border-accent-clay'
                      : 'bg-surface-card text-ink-mid border-surface-border hover:border-ink-muted'
                  }`}>
                  {c === 'all' ? 'All carriers' : c}
                </button>
              ))}
            </div>
          )}

          {/* KPI band */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            {[
              ['Carrier cost', fmt$Full(m.totals.cost), `${m.totals.matchedOrders.toLocaleString()} orders matched`],
              ['Freight charged', fmt$Full(m.totals.charged), 'billed to customers'],
              ['Recovery', fmt$Full(m.totals.margin), m.totals.cost > 0 ? `${((m.totals.charged / m.totals.cost) * 100).toFixed(0)}% of cost` : '—', m.totals.margin < 0],
              ['Cost / package', `$${m.totals.costPerPkg.toFixed(2)}`, 'on matched orders'],
              ['Units / package', m.totals.unitsPerPkg.toFixed(2), `${m.totals.pkgs.toLocaleString()} pkgs total`],
              ['Unmatched charges', fmt$Full(m.unmatchedCost), `${m.unmatchedLines} lines · fees & pre-2026`],
            ].map(([label, val, sub, bad]) => (
              <div key={label} className="card p-3.5">
                <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-lg font-semibold tabular-nums ${bad ? 'text-status-critical' : 'text-ink-strong'}`}>{val}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Monthly trend */}
          <div className="card p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink-strong">Monthly · cost vs charged</h3>
              <span className="text-[10px] text-ink-muted">by ship date</span>
            </div>
            <div className="space-y-2">
              {m.months.map(mo => (
                <div key={mo.month} className="flex items-center gap-3 text-xs">
                  <span className="w-16 text-ink-mid tabular-nums flex-shrink-0">{mo.month}</span>
                  <div className="flex-1 min-w-0">
                    <div className="h-3 rounded-sm bg-accent-clay/80" style={{ width: `${(mo.cost / m.maxMonthCost) * 100}%`, minWidth: mo.cost > 0 ? 2 : 0 }} />
                    <div className="h-3 rounded-sm bg-accent-gold/80 mt-0.5" style={{ width: `${(mo.charged / m.maxMonthCost) * 100}%`, minWidth: mo.charged > 0 ? 2 : 0 }} />
                  </div>
                  <span className="w-20 text-right tabular-nums text-ink-strong flex-shrink-0">{fmt$(mo.cost)}</span>
                  <span className="w-20 text-right tabular-nums text-ink-muted flex-shrink-0">{fmt$(mo.charged)}</span>
                  <span className={`w-20 text-right tabular-nums font-semibold flex-shrink-0 ${mo.charged - mo.cost < 0 ? 'text-status-critical' : 'text-status-healthy'}`}>
                    {fmt$(mo.charged - mo.cost)}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-1 text-[10px] text-ink-muted">
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-accent-clay/80 inline-block" /> carrier cost</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-accent-gold/80 inline-block" /> charged</span>
                <span className="ml-auto">columns: cost · charged · recovery</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            {/* By service */}
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-strong mb-3">By service</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-border text-[10px] text-ink-muted uppercase tracking-wider">
                    <th className="text-left py-2">Service</th>
                    <th className="text-right py-2">Pkgs</th>
                    <th className="text-right py-2">Cost</th>
                    <th className="text-right py-2">$/pkg</th>
                  </tr>
                </thead>
                <tbody>
                  {m.services.map(s => (
                    <tr key={s.via} className="border-b border-surface-border-soft">
                      <td className="py-2 font-medium text-ink-strong">{s.via}</td>
                      <td className="py-2 text-right tabular-nums">{s.pkgs.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{fmt$(s.cost)}</td>
                      <td className="py-2 text-right tabular-nums text-ink-mid">{s.pkgs > 0 ? `$${(s.cost / s.pkgs).toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recovery by customer */}
            <div className="card p-4 lg:col-span-2">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-ink-strong">Recovery by customer</h3>
                <div className="flex gap-1.5">
                  {[['margin', 'Worst recovery'], ['cost', 'Highest cost'], ['charged', 'Most charged']].map(([k, l]) => (
                    <button key={k} onClick={() => setCustSort(k)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
                        custSort === k
                          ? 'bg-accent-clay text-ink-inverse border-accent-clay'
                          : 'bg-surface-card text-ink-mid border-surface-border hover:border-ink-muted'
                      }`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-border text-[10px] text-ink-muted uppercase tracking-wider">
                    <th className="text-left py-2">Customer</th>
                    <th className="text-right py-2">Orders</th>
                    <th className="text-right py-2">Pkgs</th>
                    <th className="text-right py-2">Charged</th>
                    <th className="text-right py-2">Cost</th>
                    <th className="text-right py-2">Recovery</th>
                  </tr>
                </thead>
                <tbody>
                  {m.customers.slice(0, 25).map(c => (
                    <tr key={c.customer} className="border-b border-surface-border-soft">
                      <td className="py-2 font-medium text-ink-strong">
                        {c.customer}
                        {c.costOrders < c.orders && c.cost > 0 && (
                          <span className="ml-1.5 text-[9px] text-ink-muted" title="Some orders have no charge on our account — likely third-party billed">
                            {c.orders - c.costOrders} 3rd-party
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">{c.orders.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{c.pkgs.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{fmt$(c.charged)}</td>
                      <td className="py-2 text-right tabular-nums">{fmt$(c.cost)}</td>
                      <td className={`py-2 text-right tabular-nums font-semibold ${c.margin < 0 ? 'text-status-critical' : 'text-status-healthy'}`}>
                        {fmt$(c.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {m.customers.length > 25 && (
                <p className="text-[10px] text-ink-muted mt-2">Showing top 25 of {m.customers.length}</p>
              )}
            </div>
          </div>

          <p className="text-[11px] text-ink-muted">
            Note: customers on free-freight or freight-in-price programs show $0 charged by design — recovery for them
            reads as the freight absorbed into their pricing, not a billing error. Unmatched charges are account-level
            fees and shipments for orders outside the imported window.
          </p>
        </>
      )}
    </div>
  )
}
