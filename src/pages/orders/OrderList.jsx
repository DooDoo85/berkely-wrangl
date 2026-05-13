import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const STATUS_STYLES = {
  draft:         'bg-[rgba(141,123,104,0.10)] text-ink-muted border-[var(--surface-border)]',
  quote:         'bg-accent-gold-soft text-accent-clay border-[rgba(184,93,58,0.20)]',
  credit_hold:   'bg-status-critical-soft text-status-critical border-[rgba(181,74,58,0.25)]',
  credit_ok:     'bg-status-healthy-soft text-status-healthy border-[rgba(91,140,90,0.25)]',
  po_sent:       'bg-status-info-soft text-status-info border-[rgba(74,107,140,0.25)]',
  submitted:     'bg-status-info-soft text-status-info border-[rgba(74,107,140,0.25)]',
  printed:       'bg-status-warning-soft text-status-warning border-[rgba(194,145,58,0.25)]',
  in_production: 'bg-accent-gold-soft text-accent-clay border-[rgba(184,93,58,0.20)]',
  complete:      'bg-status-healthy-soft text-status-healthy border-[rgba(91,140,90,0.25)]',
  invoiced:      'bg-status-healthy-soft text-status-healthy border-[rgba(91,140,90,0.25)]',
  cancelled:     'bg-[rgba(141,123,104,0.10)] text-ink-muted border-[var(--surface-border)]',
}

const STATUS_LABELS = {
  draft: 'Draft',
  quote: 'Quote',
  credit_hold: 'Credit Hold',
  credit_ok: 'Credit OK',
  po_sent: 'PO Sent',
  submitted: 'Submitted',
  printed: 'Printed',
  in_production: 'In Production',
  complete: 'Complete',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled'
}

export default function OrderList() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isSalesRep = profile?.role === 'sales'

  const [orders,   setOrders]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState('all')
  const [counts,   setCounts]   = useState({})
  const [repName,  setRepName]  = useState(null)

  useEffect(() => {
    if (!profile) return
    if (isSalesRep) {
      // Look up rep name from email map
      supabase.from('rep_email_map').select('rep_name').eq('email', profile.email).single()
        .then(({ data }) => setRepName(data?.rep_name || null))
    } else {
      setRepName(null)
    }
  }, [profile, isSalesRep])

  useEffect(() => {
    if (!profile) return
    if (isSalesRep && !repName) return // wait for rep name to load
    fetchOrders()
  }, [status, profile, repName])

  async function fetchOrders() {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('id, order_number, customer_name, status, order_date, sales_rep, subtotal, order_amount, total_units, sidemark, source, read_only')
      .order('order_date', { ascending: false, nullsFirst: false })
      .limit(200)

    if (status !== 'all') query = query.eq('status', status)
    if (isSalesRep && repName) query = query.eq('sales_rep', repName)

    const { data } = await query
    setOrders(data || [])

    // Get counts per status using head:true (no row limit issue)
    const statusList = ['quote', 'credit_hold', 'credit_ok', 'po_sent', 'printed', 'in_production', 'invoiced']
    const countPromises = statusList.map(async (s) => {
      let q = supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', s)
      if (isSalesRep && repName) q = q.eq('sales_rep', repName)
      const { count } = await q
      return [s, count || 0]
    })

    let allCountQuery = supabase.from('orders').select('*', { count: 'exact', head: true })
    if (isSalesRep && repName) allCountQuery = allCountQuery.eq('sales_rep', repName)

    const [{ count: allCount }, ...statusCounts] = await Promise.all([
      allCountQuery,
      ...countPromises,
    ])

    const c = { all: allCount || 0 }
    statusCounts.forEach(([s, n]) => { c[s] = n })
    setCounts(c)
    setLoading(false)
  }

  const filtered = orders.filter(o => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      o.order_number?.toLowerCase().includes(s) ||
      o.customer_name?.toLowerCase().includes(s) ||
      o.sidemark?.toLowerCase().includes(s) ||
      o.sales_rep?.toLowerCase().includes(s)
    )
  })

  const statusTabs = ['all', 'quote', 'credit_hold', 'credit_ok', 'po_sent', 'printed', 'in_production', 'invoiced']

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="tracking-tight">Orders</h1>
          <p className="text-ink-muted text-sm mt-0.5">
            {isSalesRep ? `Your orders · ${counts.all || 0} total` : `${counts.all || 0} total orders`}
          </p>
        </div>
        <button onClick={() => navigate('/orders/new')} className="btn-primary flex items-center gap-2">
          <span className="text-lg leading-none">+</span> New Order
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {statusTabs.map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              status === s
                ? 'text-white border-transparent'
                : 'text-ink-mid hover:border-[rgba(92,67,42,0.20)]'
            }`}
            style={status === s
              ? { background: '#2a1d10' }
              : { background: 'var(--surface-card)', borderColor: 'var(--surface-border)' }
            }
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
            <span className="ml-1.5 opacity-60">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by order #, customer, sidemark..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-md"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-ink-muted">Loading orders...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3 text-ink-muted">≡</div>
            <div className="text-ink-strong font-semibold mb-1">No orders found</div>
            <div className="text-ink-muted text-sm">Try a different filter or create a new order</div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--surface-border)', background: 'rgba(141,123,104,0.06)' }}>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Order #</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Sidemark</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Rep</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Date</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Amount</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className={`border-b hover:bg-black/[0.02] cursor-pointer transition-colors ${
                    i === filtered.length - 1 ? 'border-b-0' : ''
                  }`}
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm font-semibold text-accent-clay">
                      #{o.order_number}
                    </span>
                    {o.read_only && (
                      <span className="ml-2 text-[10px] text-ink-muted border px-1.5 py-0.5 rounded" style={{ borderColor: 'var(--surface-border)' }}>ePIC</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-ink-strong font-medium">{o.customer_name || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-ink-mid">{o.sidemark || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-ink-muted">{o.sales_rep?.split(' ')[0] || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-ink-muted">
                      {o.order_date ? new Date(o.order_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm font-semibold text-ink-strong tabular-nums">
                      {(o.subtotal || o.order_amount) ? '$' + Number(o.subtotal || o.order_amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLES[o.status]}`}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-ink-muted text-sm">→</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {filtered.length === 200 && (
        <p className="text-center text-xs text-ink-muted mt-3">Showing most recent 200 orders. Use search to find specific orders.</p>
      )}
    </div>
  )
}
