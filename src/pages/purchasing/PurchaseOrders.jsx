import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_STYLES = {
  draft:      'bg-stone-100 text-stone-600',
  submitted:  'bg-blue-50 text-blue-700',
  exported:   'bg-amber-50 text-amber-700',
  received:   'bg-green-50 text-green-700',
  cancelled:  'bg-red-50 text-red-500',
}

// "Open" = placed with the vendor but not yet in hand. Anything draft (not sent),
// received (done), or cancelled is excluded from the pickup list.
const CLOSED_STATUSES = ['draft', 'received', 'cancelled']

export default function PurchaseOrders() {
  const navigate = useNavigate()
  const [pos, setPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [queueCount, setQueueCount] = useState(0)
  const [filter, setFilter] = useState('all')
  const [exporting, setExporting] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: orders }, { count }] = await Promise.all([
      supabase.from('purchase_orders').select('*, purchase_order_items(id)').order('created_at', { ascending: false }),
      supabase.from('reorder_queue').select('*', { count: 'exact', head: true })
    ])
    setPOs(orders || [])
    setQueueCount(count || 0)
    setLoading(false)
  }

  async function exportPickupList() {
    setExporting(true)
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('wrangl_po_number, vendor_name, status, expected_date, purchase_order_items(part_name, stock_number, qty_ordered, qty_received)')
      .order('vendor_name', { ascending: true })
      .limit(5000)
    setExporting(false)

    if (error || !data) {
      alert('Could not load purchase orders for the pickup list. Please try again.')
      return
    }

    // Keep only open POs (submitted / exported / partial — never draft, received, cancelled)
    const openPOs = data.filter(po => !CLOSED_STATUSES.includes(po.status))

    // Group remaining line items by vendor. Remaining = ordered minus already received,
    // so partially-received POs only show what's still owed; fully-received lines drop off.
    const byVendor = {}
    for (const po of openPOs) {
      const vendor = po.vendor_name || 'Unknown Vendor'
      for (const item of (po.purchase_order_items || [])) {
        const remaining = (Number(item.qty_ordered) || 0) - (Number(item.qty_received) || 0)
        if (remaining <= 0) continue
        if (!byVendor[vendor]) byVendor[vendor] = []
        byVendor[vendor].push({
          name: item.part_name || '—',
          stock: item.stock_number || '',
          qty: remaining,
          po: po.wrangl_po_number || '',
        })
      }
    }

    const vendors = Object.keys(byVendor).sort((a, b) => a.localeCompare(b))
    if (vendors.length === 0) {
      alert('No open items to pick up — everything on open POs is already received.')
      return
    }

    const esc = (s) => String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ))

    const printedOn = new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    })

    const sections = vendors.map(vendor => {
      const lines = byVendor[vendor]
      const rows = lines.map(line => `
        <tr>
          <td class="chk"></td>
          <td class="desc">${esc(line.name)}</td>
          <td class="stock">${esc(line.stock)}</td>
          <td class="qty">${esc(line.qty)}</td>
        </tr>`).join('')
      const totalUnits = lines.reduce((s, l) => s + l.qty, 0)
      return `
        <section class="vendor">
          <h2>${esc(vendor)}</h2>
          <div class="meta">${lines.length} item${lines.length === 1 ? '' : 's'} &middot; ${totalUnits} unit${totalUnits === 1 ? '' : 's'}</div>
          <table>
            <thead>
              <tr>
                <th class="chk">&#10003;</th>
                <th class="desc">Description</th>
                <th class="stock">Part #</th>
                <th class="qty">Qty</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`
    }).join('')

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Vendor Pickup List</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1c1917; margin: 0; padding: 32px; }
  .top { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #1c1917; padding-bottom: 10px; margin-bottom: 22px; }
  .top h1 { font-size: 20px; margin: 0; }
  .top .when { font-size: 12px; color: #78716c; margin-top: 2px; }
  .printbtn { font-size: 13px; padding: 7px 14px; border: 1px solid #1c1917; background: #1c1917; color: #fff; border-radius: 6px; cursor: pointer; }
  .vendor { margin-bottom: 26px; page-break-inside: avoid; }
  .vendor h2 { font-size: 15px; margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.04em; }
  .vendor .meta { font-size: 11px; color: #78716c; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #78716c; border-bottom: 1px solid #d6d3d1; padding: 5px 8px; }
  td { font-size: 13px; padding: 7px 8px; border-bottom: 1px solid #f0eeec; vertical-align: top; }
  th.chk { width: 28px; text-align: center; }
  td.chk { width: 22px; height: 20px; border: 1px solid #d6d3d1; }
  th.qty, td.qty { text-align: right; width: 60px; font-variant-numeric: tabular-nums; font-weight: 600; }
  th.stock, td.stock { width: 140px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: #57534e; }
  @media print {
    .printbtn { display: none; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="top">
    <div>
      <h1>Vendor Pickup List</h1>
      <div class="when">Generated ${esc(printedOn)}</div>
    </div>
    <button class="printbtn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  ${sections}
</body>
</html>`

    const win = window.open('', '_blank')
    if (!win) {
      alert('Please allow pop-ups for this site to open the pickup list.')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  const filtered = filter === 'all' ? pos : pos.filter(p => p.status === filter)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Purchase Orders</h1>
          <p className="text-sm text-stone-500 mt-0.5">{pos.length} total orders</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportPickupList}
            disabled={exporting}
            className="text-sm font-semibold text-stone-600 hover:text-stone-900 border border-stone-200 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:cursor-default"
          >
            {exporting ? 'Building…' : 'Export Pickup List'}
          </button>
          {queueCount > 0 ? (
            <button
              onClick={() => navigate('/purchasing/queue')}
              className="flex items-center gap-2 text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded hover:bg-amber-100 transition-colors"
            >
              <span className="w-5 h-5 bg-amber-500 text-white rounded-full text-xs flex items-center justify-center font-bold">{queueCount}</span>
              Reorder Queue
            </button>
          ) : (
            <button onClick={() => navigate('/purchasing/queue')} className="text-sm text-stone-500 hover:text-stone-800 transition-colors border border-stone-200 px-3 py-1.5 rounded">
              Reorder Queue
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        {['all', 'draft', 'submitted', 'exported', 'received', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors capitalize ${
              filter === s ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-stone-400 py-8 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-stone-400 text-sm">No purchase orders yet.</p>
          <p className="text-stone-400 text-xs mt-1">Add items to the reorder queue and create a PO from there.</p>
          <button onClick={() => navigate('/purchasing/queue')} className="mt-4 text-sm font-semibold text-brand-dark hover:underline">
            Go to Reorder Queue →
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold tracking-[0.1em] text-stone-400 uppercase border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3">PO Number</th>
                <th className="text-left px-5 py-3">Vendor</th>
                <th className="text-center px-5 py-3">Lines</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">ePIC PO</th>
                <th className="text-left px-5 py-3">Created</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(po => (
                <tr
                  key={po.id}
                  onClick={() => navigate(`/purchasing/po/${po.id}`)}
                  className="border-b border-stone-50 hover:bg-stone-50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3 font-mono font-semibold text-brand-dark text-xs">{po.wrangl_po_number}</td>
                  <td className="px-5 py-3 text-stone-800 font-medium">{po.vendor_name}</td>
                  <td className="px-5 py-3 text-center text-stone-500">{po.purchase_order_items?.length || 0}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_STYLES[po.status]}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-stone-400 text-xs font-mono">{po.epic_po_number || '—'}</td>
                  <td className="px-5 py-3 text-stone-400 text-xs">{new Date(po.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right text-stone-400 text-xs">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
