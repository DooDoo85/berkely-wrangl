import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const STATUS_STYLES = {
  draft:         'bg-stone-50 text-stone-500 border-stone-200',
  submitted:     'bg-blue-50 text-blue-700 border-blue-200',
  printed:       'bg-amber-50 text-amber-700 border-amber-200',
  in_production: 'bg-purple-50 text-purple-700 border-purple-200',
  complete:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  invoiced:      'bg-teal-50 text-teal-700 border-teal-200',
  cancelled:     'bg-red-50 text-red-400 border-red-200',
}

const STATUS_LABELS = {
  draft: 'Draft', submitted: 'Submitted', printed: 'Printed',
  in_production: 'In Production', complete: 'Complete',
  invoiced: 'Invoiced', cancelled: 'Cancelled'
}

const STATUS_FLOW = ['draft', 'submitted', 'printed', 'in_production', 'complete', 'invoiced']

export default function OrderDetail() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const { profile } = useAuth()
  const [order,     setOrder]     = useState(null)
  const [items,     setItems]     = useState([])
  const [timeline,  setTimeline]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [updating,  setUpdating]  = useState(false)

  useEffect(() => { loadOrder() }, [id])

  async function loadOrder() {
    const [orderRes, itemsRes, timelineRes] = await Promise.all([
      supabase.from('orders').select('*, customers(account_name, billing_address)').eq('id', id).single(),
      supabase.from('order_items').select('*').eq('order_id', id).order('line_number'),
      supabase.from('order_timeline').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    ])
    setOrder(orderRes.data)
    setItems(itemsRes.data || [])
    setTimeline(timelineRes.data || [])
    setLoading(false)
  }

  async function updateStatus(newStatus) {
    if (order.read_only) return
    setUpdating(true)
    const oldStatus = order.status
    await supabase.from('orders').update({ status: newStatus }).eq('id', id)
    await supabase.from('order_timeline').insert({
      order_id: id, event_type: 'status_change',
      from_status: oldStatus, to_status: newStatus,
      user_id: profile?.id, note: `Status changed to ${STATUS_LABELS[newStatus]}`
    })
    await loadOrder()
    setUpdating(false)
  }

  if (loading) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="card p-12 text-center text-stone-400">Loading...</div>
    </div>
  )

  if (!order) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="card p-12 text-center text-stone-400">Order not found</div>
    </div>
  )

  const currentIdx = STATUS_FLOW.indexOf(order.status)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/orders')} className="btn-ghost text-sm">← Orders</button>
        </div>
        <div className="flex items-center gap-2">
          {!order.read_only && (
            <button onClick={() => navigate(`/orders/${id}/edit`)} className="btn-ghost text-sm">Edit</button>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="card p-6 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-display font-bold text-stone-800">
                Order #{order.order_number}
              </h2>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLES[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
              {order.read_only && (
                <span className="text-xs text-stone-400 border border-stone-200 px-2 py-0.5 rounded">
                  ePIC — Read Only
                </span>
              )}
            </div>
            <div className="text-stone-500 text-sm font-semibold">{order.customer_name}</div>
            {order.sidemark && <div className="text-stone-400 text-sm mt-0.5">{order.sidemark}</div>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-display font-bold text-stone-800">
              {order.subtotal ? '$' + Number(order.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
            </div>
            <div className="text-xs text-stone-400 mt-0.5">Order total</div>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-stone-100">
          {[
            { label: 'Order Date',   value: order.order_date ? new Date(order.order_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric'}) : '—' },
            { label: 'Sales Rep',    value: order.sales_rep || '—' },
            { label: 'PO Number',    value: order.po_number || '—' },
            { label: 'Ship Via',     value: order.ship_via || '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">{label}</div>
              <div className="text-sm text-stone-700">{value}</div>
            </div>
          ))}
        </div>

        {order.notes && (
          <div className="mt-4 p-3 bg-stone-50 rounded-lg text-sm text-stone-500">{order.notes}</div>
        )}
      </div>

      {/* Status workflow — only for Wrangl orders */}
      {!order.read_only && (
        <div className="card p-5 mb-5">
          <div className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-4">Update Status</div>
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_FLOW.map((s, idx) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={updating || s === order.status}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  s === order.status
                    ? STATUS_STYLES[s] + ' cursor-default'
                    : idx < currentIdx
                    ? 'bg-stone-50 text-stone-300 border-stone-100 cursor-pointer hover:border-stone-300'
                    : 'bg-white text-stone-500 border-stone-200 cursor-pointer hover:border-brand-gold hover:text-brand-gold'
                }`}
              >
                {idx < currentIdx ? '✓ ' : idx === currentIdx ? '● ' : ''}{STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Line items */}
        <div className="col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-stone-700">Line Items</h3>
            {!order.read_only && (
              <button onClick={() => navigate(`/orders/${id}/edit`)}
                className="text-xs text-brand-gold hover:text-amber-600 font-semibold">
                + Add Item
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="text-center py-8 text-stone-400">
              <div className="text-3xl mb-2">≡</div>
              <div className="text-sm">
                {order.read_only
                  ? 'Line item detail not available for ePIC orders'
                  : 'No line items yet — edit order to add items'}
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="text-left py-2 text-xs font-bold text-stone-400 uppercase">#</th>
                  <th className="text-left py-2 text-xs font-bold text-stone-400 uppercase">Product</th>
                  <th className="text-center py-2 text-xs font-bold text-stone-400 uppercase">Size</th>
                  <th className="text-center py-2 text-xs font-bold text-stone-400 uppercase">Qty</th>
                  <th className="text-right py-2 text-xs font-bold text-stone-400 uppercase">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className="border-b border-stone-50 last:border-0">
                    <td className="py-3 text-xs text-stone-400">{item.line_number || i+1}</td>
                    <td className="py-3">
                      <div className="text-sm font-medium text-stone-700">{item.product_name || '—'}</div>
                      <div className="text-xs text-stone-400">{item.group_name}</div>
                      {item.notes && <div className="text-xs text-stone-400 mt-0.5">{item.notes}</div>}
                    </td>
                    <td className="py-3 text-center text-xs text-stone-500">
                      {item.width_inches && item.height_inches
                        ? `${item.width_inches}" × ${item.height_inches}"`
                        : '—'}
                    </td>
                    <td className="py-3 text-center text-sm text-stone-700">{item.quantity}</td>
                    <td className="py-3 text-right text-sm font-semibold text-stone-700">
                      {item.line_total ? '$' + Number(item.line_total).toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Timeline */}
        <div className="card p-5">
          <h3 className="font-semibold text-stone-700 mb-4">Timeline</h3>
          {timeline.length === 0 ? (
            <div className="text-xs text-stone-400 text-center py-4">No activity yet</div>
          ) : (
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div key={t.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-brand-gold mt-1 flex-shrink-0" />
                    {i < timeline.length - 1 && <div className="w-px flex-1 bg-stone-100 mt-1" />}
                  </div>
                  <div className="pb-3 flex-1 min-w-0">
                    <div className="text-xs font-medium text-stone-600">{t.note || t.event_type}</div>
                    <div className="text-[10px] text-stone-400 mt-0.5">
                      {new Date(t.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
