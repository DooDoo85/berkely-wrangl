import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import HoldModal from '../../components/HoldModal'

function daysSince(dateStr) {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

export default function OrdersOnHold() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [releasing, setReleasing] = useState({})
  const [editingOrder, setEditingOrder] = useState(null)

  useEffect(() => { loadOrders() }, [])

  async function loadOrders() {
    setLoading(true)
    // Match the home widget's "Orders on Hold" logic: any order with a non-null hold_reason.
    // Captures both Pete-style flags (order still in production but blocked) and Rene-style
    // full holds (status = on_hold). Excludes invoiced/cancelled — once shipped/closed,
    // the hold is historical and shouldn't appear in the action list.
    const { data } = await supabase
      .from('orders')
      .select('*')
      .not('hold_reason', 'is', null)
      .not('status', 'in', '(invoiced,cancelled)')
      .order('hold_started_at', { ascending: true, nullsFirst: false })
    setOrders(data || [])
    setLoading(false)
  }

  async function releaseHold(order) {
    setReleasing(prev => ({ ...prev, [order.id]: true }))
    // Clear the hold_reason flag regardless of current status. If the order was
    // fully halted (status = on_hold), also flip it back to in_production —
    // otherwise leave the status alone (Pete-style flags don't need re-statusing).
    const updates = {
      hold_reason:      null,
      hold_note:        null,
      hold_released_at: new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    }
    if (order.status === 'on_hold') {
      updates.status = 'in_production'
    }
    await supabase.from('orders').update(updates).eq('id', order.id)
    setReleasing(prev => ({ ...prev, [order.id]: false }))
    loadOrders()
  }

  const reasonColor = {
    'Part on order':     'bg-status-warning-soft text-status-warning border-[rgba(194,145,58,0.25)]',
    'Fabric on order':   'bg-accent-gold-soft text-accent-clay border-[rgba(184,93,58,0.20)]',
    'Customer issue':    'bg-status-info-soft text-status-info border-[rgba(74,107,140,0.25)]',
    'Measurement issue': 'bg-status-warning-soft text-status-warning border-[rgba(194,145,58,0.25)]',
    'Other':             'bg-[rgba(141,123,104,0.06)] text-ink-mid border-[var(--surface-border)]',
  }

  if (loading) return <div className="p-8 text-ink-muted text-sm">Loading...</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Orders on Hold</h1>
          <p className="text-sm text-ink-muted mt-0.5">{orders.length} order{orders.length !== 1 ? 's' : ''} currently on hold</p>
        </div>
        <button
          onClick={() => navigate('/ops')}
          className="text-sm text-ink-muted hover:text-ink-strong border border-[var(--surface-border)] px-3 py-1.5 rounded transition-colors"
        >
          ← Production Hub
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="text-ink-mid font-semibold">No orders on hold</p>
          <p className="text-ink-muted text-sm mt-1">All clear — no production holds at this time.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const daysOnHold = daysSince(order.hold_started_at)
            const isUrgent = daysOnHold >= 5

            return (
              <div key={order.id} className={`card overflow-hidden ${isUrgent ? 'border-[rgba(181,74,58,0.25)]' : ''}`}>
                <div className="flex items-start justify-between px-5 py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono font-bold text-ink-strong">#{order.order_number}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${reasonColor[order.hold_reason] || reasonColor['Other']}`}>
                        {order.hold_reason}
                      </span>
                      {isUrgent && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-status-critical-soft text-status-critical border border-[rgba(181,74,58,0.25)]">
                          ⚠ {daysOnHold} days on hold
                        </span>
                      )}
                      {!isUrgent && (
                        <span className="text-xs text-ink-muted">
                          {daysOnHold === 0 ? 'Placed today' : `${daysOnHold} day${daysOnHold !== 1 ? 's' : ''} on hold`}
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-ink-mid">{order.customer_name}</p>
                    {order.sidemark && <p className="text-xs text-ink-muted mt-0.5">{order.sidemark}</p>}

                    {order.hold_note && (
                      <p className="text-sm text-ink-muted mt-2 italic">"{order.hold_note}"</p>
                    )}

                    <div className="flex items-center gap-6 mt-3 text-xs text-ink-muted">
                      {order.sales_rep && (
                        <span>Rep: <span className="font-semibold text-ink-mid">{order.sales_rep}</span></span>
                      )}
                      {order.hold_started_at && (
                        <span>Hold started: <span className="font-semibold text-ink-mid">{new Date(order.hold_started_at).toLocaleDateString()}</span></span>
                      )}
                      {order.part_expected_date && (
                        <span>Parts expected: <span className="font-semibold text-ink-mid">{new Date(order.part_expected_date + 'T00:00:00').toLocaleDateString()}</span></span>
                      )}
                      {order.expected_ship_date && (
                        <span>Expected ship: <span className="font-semibold text-status-healthy">{new Date(order.expected_ship_date + 'T00:00:00').toLocaleDateString()}</span></span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setEditingOrder(order)}
                      className="text-xs text-ink-muted hover:text-ink-mid border border-[var(--surface-border)] px-2 py-1 rounded transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => releaseHold(order)}
                      disabled={!!releasing[order.id]}
                      className="text-xs font-semibold bg-status-healthy text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      {releasing[order.id] ? '...' : '✓ Release Hold'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit hold modal */}
      {editingOrder && (
        <HoldModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSaved={() => { setEditingOrder(null); loadOrders() }}
        />
      )}
    </div>
  )
}
