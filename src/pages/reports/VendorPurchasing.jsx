import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const usd = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n))
const usd2 = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n))
const num = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US').format(n))

// Build month options from the data (YYYY-MM), newest first, plus "All time".
function monthOptions(rows) {
  const set = new Set()
  rows.forEach(r => { if (r.po_date) set.add(r.po_date.slice(0, 7)) })
  const months = [...set].sort().reverse()
  return [{ key: 'all', label: 'All time' }, ...months.map(m => ({
    key: m,
    label: new Date(m + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }))]
}

export default function VendorPurchasing() {
  const { profile } = useAuth()
  const role = profile?.role
  const canView = role === 'owner' || role === 'executive'

  const [lines, setLines]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [month, setMonth]   = useState('all')
  const [openVendor, setOpenVendor] = useState(null)

  useEffect(() => { if (canView) load(); else setLoading(false) }, [canView])

  async function load() {
    setLoading(true)
    // Pull all lines (PO line grain). For very large histories this could paginate,
    // but purchasing volume is modest (hundreds of lines).
    const { data, error } = await supabase
      .from('purchasing_lines')
      .select('vendor, po_number, po_date, stock_code, description, qty_ordered, extended_cost')
      .order('po_date', { ascending: false })
      .limit(10000)
    if (error) { setError(error.message); setLoading(false); return }
    setLines(data || [])
    setLoading(false)
  }

  const months = useMemo(() => monthOptions(lines), [lines])

  const scoped = useMemo(() => {
    if (month === 'all') return lines
    return lines.filter(r => r.po_date && r.po_date.slice(0, 7) === month)
  }, [lines, month])

  // Vendor summary
  const vendors = useMemo(() => {
    const map = {}
    for (const r of scoped) {
      const v = r.vendor || '—'
      if (!map[v]) map[v] = { vendor: v, spend: 0, lines: 0, pos: new Set(), misc: 0 }
      map[v].spend += Number(r.extended_cost) || 0
      map[v].lines += 1
      map[v].pos.add(r.po_number)
      if (r.stock_code === 'MISC') map[v].misc += Number(r.extended_cost) || 0
    }
    return Object.values(map)
      .map(v => ({ ...v, poCount: v.pos.size }))
      .sort((a, b) => b.spend - a.spend)
  }, [scoped])

  const grandTotal = useMemo(() => scoped.reduce((s, r) => s + (Number(r.extended_cost) || 0), 0), [scoped])
  const miscTotal  = useMemo(() => scoped.filter(r => r.stock_code === 'MISC').reduce((s, r) => s + (Number(r.extended_cost) || 0), 0), [scoped])

  // Items for the expanded vendor, rolled up by stock code
  const vendorItems = useMemo(() => {
    if (!openVendor) return []
    const map = {}
    for (const r of scoped) {
      if ((r.vendor || '—') !== openVendor) continue
      const code = r.stock_code || '—'
      const key = code + '|' + (r.description || '')
      if (!map[key]) map[key] = { stock_code: code, description: r.description, qty: 0, spend: 0 }
      map[key].qty += Number(r.qty_ordered) || 0
      map[key].spend += Number(r.extended_cost) || 0
    }
    return Object.values(map).sort((a, b) => b.spend - a.spend)
  }, [scoped, openVendor])

  if (!canView) {
    return (
      <div className="min-h-screen bg-surface-page">
        <div className="max-w-screen-xl mx-auto p-6">
          <h1 className="font-display font-bold text-ink-strong text-xl mb-2">Vendor Purchasing</h1>
          <p className="text-sm text-ink-mid">This report is limited to owner/executive accounts.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-page">
      <div className="max-w-screen-xl mx-auto p-3 md:p-4 pb-12">

        <div className="mb-3">
          <h1 className="font-display font-bold text-ink-strong text-xl md:text-2xl">Vendor Purchasing</h1>
          <p className="text-xs text-ink-muted mt-0.5">What we've bought from each vendor, by PO. Click a vendor to see its items.</p>
        </div>

        {/* Month filter */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <select value={month} onChange={e => { setMonth(e.target.value); setOpenVendor(null) }}
            className="text-sm border border-stone-300 rounded-lg px-3 py-1.5 bg-white">
            {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span className="text-[11px] text-ink-muted">
            {loading ? '' : `${usd(grandTotal)} total · ${scoped.length} lines${miscTotal > 0 ? ` · ${usd(miscTotal)} MISC` : ''}`}
          </span>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="card p-10 text-center text-ink-muted text-sm !rounded-lg ring-1 ring-stone-200 shadow-none">Loading purchasing data…</div>
        ) : scoped.length === 0 ? (
          <div className="card p-10 text-center !rounded-lg ring-1 ring-stone-200 shadow-none">
            <p className="text-sm text-ink-mid">No purchasing data{month !== 'all' ? ' for this month' : ' yet'}.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {vendors.map(v => {
              const isOpen = openVendor === v.vendor
              const pct = grandTotal > 0 ? (v.spend / grandTotal * 100) : 0
              return (
                <div key={v.vendor} className="card !rounded-lg ring-1 ring-stone-200 shadow-none overflow-hidden">
                  {/* Vendor summary row */}
                  <button onClick={() => setOpenVendor(isOpen ? null : v.vendor)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50/60 transition-colors text-left">
                    <span className={`text-ink-muted text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-ink-strong truncate">{v.vendor}</p>
                      <p className="text-[11px] text-ink-muted">{v.poCount} PO{v.poCount !== 1 ? 's' : ''} · {v.lines} lines{v.misc > 0 ? ` · ${usd(v.misc)} MISC` : ''}</p>
                    </div>
                    {/* spend bar */}
                    <div className="hidden sm:block w-28 h-2 rounded-full bg-stone-100 overflow-hidden flex-shrink-0">
                      <div className="h-full bg-brand-gold" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-right flex-shrink-0 w-28">
                      <p className="text-[17px] font-semibold text-ink-strong tabular-nums">{usd(v.spend)}</p>
                      <p className="text-[10px] text-ink-muted">{pct.toFixed(0)}% of spend</p>
                    </div>
                  </button>

                  {/* Expanded: items rolled up by stock code */}
                  {isOpen && (
                    <div className="border-t border-stone-200 overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-stone-50/60">
                          <tr className="text-[10px] font-bold uppercase tracking-wider text-ink-muted border-b border-stone-200">
                            <th className="px-4 py-2">Stock Code</th>
                            <th className="px-4 py-2">Description</th>
                            <th className="px-4 py-2 text-right">Qty</th>
                            <th className="px-4 py-2 text-right">Spend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vendorItems.map((it, i) => (
                            <tr key={i} className={`border-b border-stone-100 last:border-0 ${it.stock_code === 'MISC' ? 'bg-amber-50/30' : ''}`}>
                              <td className="px-4 py-1.5 text-[12px] font-mono text-ink-mid whitespace-nowrap">
                                {it.stock_code}
                                {it.stock_code === 'MISC' && <span className="ml-1.5 text-[9px] font-bold text-amber-700">misc</span>}
                              </td>
                              <td className="px-4 py-1.5 text-[12px] text-ink-mid">{it.description || '—'}</td>
                              <td className="px-4 py-1.5 text-[12px] text-right tabular-nums text-ink-mid">{num(Math.round(it.qty))}</td>
                              <td className="px-4 py-1.5 text-[12px] text-right tabular-nums font-semibold text-ink-strong">{usd2(it.spend)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
