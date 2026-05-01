import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const STATUS_STYLES = {
  draft:         'bg-stone-50 text-stone-500 border-stone-200',
  quote:         'bg-purple-50 text-purple-700 border-purple-200',
  credit_hold:   'bg-red-50 text-red-700 border-red-200',
  credit_ok:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  po_sent:       'bg-cyan-50 text-cyan-700 border-cyan-200',
  submitted:     'bg-blue-50 text-blue-700 border-blue-200',
  printed:       'bg-amber-50 text-amber-700 border-amber-200',
  in_production: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  complete:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  invoiced:      'bg-teal-50 text-teal-700 border-teal-200',
  cancelled:     'bg-red-50 text-red-400 border-red-200',
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

    // Get counts for all statuses (filtered by rep if sales)
    let countQuery = supabase.from('orders').select('status')
    if (isSalesRep && repName) countQuery = countQuery.eq('sales_rep', repName)

    const { data: allOrders } = await countQuery
    const c = { all: allOrders?.length || 0 }
    allOrders?.forEach(o => { c[o.status] = (c[o.status] || 0) + 1 })
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
          <h2 className="text-2xl font-display font-bold text-stone-800">Orders</h2>
          <p className="text-stone-400 text-sm mt-0.5">
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
                ? 'bg-brand-dark text-white border-brand-dark'
                : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
            }`}
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
          <div className="p-12 text-center text-stone-400">Loading orders...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">≡</div>
            <div className="text-stone-600 font-semibold mb-1">No orders found</div>
            <div className="text-stone-400 text-sm">Try a different filter or create a new order</div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Order #</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Sidemark</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Rep</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Date</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Amount</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className={`border-b border-stone-50 hover:bg-stone-50 cursor-pointer transition-colors ${
                    i === filtered.length - 1 ? 'border-b-0' : ''
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm font-semibold text-brand-light">
                      #{o.order_number}
                    </span>
                    {o.read_only && (
                      <span className="ml-2 text-[10px] text-stone-300 border border-stone-200 px-1.5 py-0.5 rounded">ePIC</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-stone-700 font-medium">{o.customer_name || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-stone-500">{o.sidemark || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-stone-400">{o.sales_rep?.split(' ')[0] || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-stone-400">
                      {o.order_date ? new Date(o.order_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm font-semibold text-stone-700">
                      {(o.subtotal || o.order_amount) ? '$' + Number(o.subtotal || o.order_amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLES[o.status]}`}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-stone-300 text-sm">→</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {filtered.length === 200 && (
        <p className="text-center text-xs text-stone-400 mt-3">Showing most recent 200 orders. Use search to find specific orders.</p>
      )}
    </div>
  )
}
