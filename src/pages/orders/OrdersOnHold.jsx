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
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'on_hold')
      .order('hold_started_at', { ascending: true })
    setOrders(data || [])
    setLoading(false)
  }

  async function releaseHold(order) {
    setReleasing(prev => ({ ...prev, [order.id]: true }))
    await supabase.from('orders').update({
      status:           'in_production',
      hold_released_at: new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    }).eq('id', order.id)
    setReleasing(prev => ({ ...prev, [order.id]: false }))
    loadOrders()
  }

  const reasonColor = {
    'Part on order':     'bg-amber-50 text-amber-700 border-amber-200',
    'Fabric on order':   'bg-purple-50 text-purple-700 border-purple-200',
    'Customer issue':    'bg-blue-50 text-blue-700 border-blue-200',
    'Measurement issue': 'bg-orange-50 text-orange-700 border-orange-200',
    'Other':             'bg-stone-50 text-stone-600 border-stone-200',
  }

  if (loading) return <div className="p-8 text-stone-500 text-sm">Loading...</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Orders on Hold</h1>
          <p className="text-sm text-stone-500 mt-0.5">{orders.length} order{orders.length !== 1 ? 's' : ''} currently on hold</p>
        </div>
        <button
          onClick={() => navigate('/ops')}
          className="text-sm text-stone-500 hover:text-stone-800 border border-stone-200 px-3 py-1.5 rounded transition-colors"
        >
          ← Production Hub
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="text-stone-600 font-semibold">No orders on hold</p>
          <p className="text-stone-400 text-sm mt-1">All clear — no production holds at this time.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const daysOnHold = daysSince(order.hold_started_at)
            const isUrgent = daysOnHold >= 5

            return (
              <div key={order.id} className={`card overflow-hidden ${isUrgent ? 'border-red-200' : ''}`}>
                <div className="flex items-start justify-between px-5 py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono font-bold text-stone-800">#{order.order_number}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${reasonColor[order.hold_reason] || reasonColor['Other']}`}>
                        {order.hold_reason}
                      </span>
                      {isUrgent && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                          ⚠ {daysOnHold} days on hold
                        </span>
                      )}
                      {!isUrgent && (
                        <span className="text-xs text-stone-400">
                          {daysOnHold === 0 ? 'Placed today' : `${daysOnHold} day${daysOnHold !== 1 ? 's' : ''} on hold`}
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-stone-700">{order.customer_name}</p>
                    {order.sidemark && <p className="text-xs text-stone-400 mt-0.5">{order.sidemark}</p>}

                    {order.hold_note && (
                      <p className="text-sm text-stone-500 mt-2 italic">"{order.hold_note}"</p>
                    )}

                    <div className="flex items-center gap-6 mt-3 text-xs text-stone-400">
                      {order.sales_rep && (
                        <span>Rep: <span className="font-semibold text-stone-600">{order.sales_rep}</span></span>
                      )}
                      {order.hold_started_at && (
                        <span>Hold started: <span className="font-semibold text-stone-600">{new Date(order.hold_started_at).toLocaleDateString()}</span></span>
                      )}
                      {order.part_expected_date && (
                        <span>Parts expected: <span className="font-semibold text-stone-600">{new Date(order.part_expected_date + 'T00:00:00').toLocaleDateString()}</span></span>
                      )}
                      {order.expected_ship_date && (
                        <span>Expected ship: <span className="font-semibold text-green-700">{new Date(order.expected_ship_date + 'T00:00:00').toLocaleDateString()}</span></span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setEditingOrder(order)}
                      className="text-xs text-stone-400 hover:text-stone-600 border border-stone-200 px-2 py-1 rounded transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => releaseHold(order)}
                      disabled={!!releasing[order.id]}
                      className="text-xs font-semibold bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors whitespace-nowrap"
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
