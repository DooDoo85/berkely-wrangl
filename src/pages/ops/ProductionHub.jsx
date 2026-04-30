import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import HoldModal from '../../components/HoldModal'

const HOLD_REASONS = [
  'Part on order',
  'Fabric on order',
  'Customer issue',
  'Measurement issue',
  'Other',
]

export default function ProductionHub() {
  const navigate = useNavigate()
  const [orderInput, setOrderInput] = useState('')
  const [order, setOrder] = useState(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showHoldModal, setShowHoldModal] = useState(false)

  async function searchOrder() {
    const val = orderInput.trim()
    if (!val) return
    setSearching(true)
    setError(null)
    setOrder(null)
    setSuccess(null)

    const { data, error: err } = await supabase
      .from('orders')
      .select('*')
      .or(`order_number.eq.${val},epic_id.eq.${val}`)
      .single()

    if (err || !data) {
      setError(`Order #${val} not found.`)
    } else {
      setOrder(data)
    }
    setSearching(false)
  }

  async function startProduction() {
    if (!order) return
    setSaving(true)
    const { error: err } = await supabase
      .from('orders')
      .update({ status: 'in_production', updated_at: new Date().toISOString() })
      .eq('id', order.id)

    if (err) {
      setError('Failed to update order: ' + err.message)
    } else {
      setSuccess(`Order #${order.order_number} moved to In Production ✓`)
      setOrder(null)
      setOrderInput('')
    }
    setSaving(false)
  }

  async function handleHoldSaved() {
    setShowHoldModal(false)
    setSuccess(`Order #${order.order_number} placed on hold ✓`)
    setOrder(null)
    setOrderInput('')
  }

  const statusColors = {
    printed:       'bg-blue-50 text-blue-700',
    in_production: 'bg-amber-50 text-amber-700',
    on_hold:       'bg-red-50 text-red-600',
    invoiced:      'bg-green-50 text-green-700',
    shipped:       'bg-green-50 text-green-700',
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Production Hub</h1>
          <p className="text-sm text-stone-500 mt-0.5">Enter an order number to start production or place on hold</p>
        </div>
        <button
          onClick={() => navigate('/orders/on-hold')}
          className="text-sm text-stone-500 hover:text-stone-800 border border-stone-200 px-3 py-1.5 rounded transition-colors"
        >
          Orders on Hold →
        </button>
      </div>

      {/* Order entry */}
      <div className="card p-5 mb-5">
        <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-3">Order Number</p>
        <div className="flex gap-3">
          <input
            type="text"
            value={orderInput}
            onChange={e => setOrderInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') searchOrder() }}
            placeholder="e.g. 114475"
            className="input flex-1 text-lg font-mono"
            autoFocus
          />
          <button
            onClick={searchOrder}
            disabled={searching || !orderInput.trim()}
            className="px-5 py-2 bg-brand-dark text-white font-semibold rounded-xl hover:bg-brand-dark/90 disabled:opacity-40 transition-colors"
          >
            {searching ? 'Looking up...' : 'Look Up'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 mb-4 bg-red-50 border border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="card p-4 mb-4 bg-green-50 border border-green-200">
          <p className="text-sm font-semibold text-green-700">{success}</p>
        </div>
      )}

      {/* Order found */}
      {order && (
        <div className="card overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-stone-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-stone-800 font-mono">#{order.order_number}</h2>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${statusColors[order.status] || 'bg-stone-100 text-stone-600'}`}>
                    {order.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm text-stone-500 mt-1">{order.customer_name}</p>
                {order.sidemark && <p className="text-xs text-stone-400 mt-0.5">{order.sidemark}</p>}
              </div>
              {order.sales_rep && (
                <div className="text-right">
                  <p className="text-xs text-stone-400">Sales Rep</p>
                  <p className="text-sm font-semibold text-stone-700">{order.sales_rep}</p>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-4 grid grid-cols-3 gap-4 text-sm border-b border-stone-100">
            <div>
              <p className="text-xs text-stone-400 mb-0.5">Order Date</p>
              <p className="text-stone-700">{order.order_date ? new Date(order.order_date).toLocaleDateString() : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-stone-400 mb-0.5">PO Number</p>
              <p className="text-stone-700 font-mono">{order.po_number || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-stone-400 mb-0.5">Ship Via</p>
              <p className="text-stone-700">{order.ship_via || '—'}</p>
            </div>
          </div>

          {/* Hold info if already on hold */}
          {order.status === 'on_hold' && (
            <div className="px-5 py-4 bg-red-50 border-b border-red-100">
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">Currently On Hold</p>
              <p className="text-sm text-red-700"><strong>Reason:</strong> {order.hold_reason}</p>
              {order.hold_note && <p className="text-sm text-red-600 mt-1">{order.hold_note}</p>}
              {order.part_expected_date && (
                <p className="text-xs text-red-500 mt-1">Parts expected: {new Date(order.part_expected_date).toLocaleDateString()}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="px-5 py-4 flex items-center gap-3">
            {order.status === 'on_hold' ? (
              <button
                onClick={async () => {
                  setSaving(true)
                  await supabase.from('orders').update({
                    status: 'in_production',
                    hold_released_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  }).eq('id', order.id)
                  setSaving(false)
                  setSuccess(`Hold released — Order #${order.order_number} back in production ✓`)
                  setOrder(null)
                  setOrderInput('')
                }}
                disabled={saving}
                className="flex-1 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors"
              >
                ✓ Release Hold — Back to In Production
              </button>
            ) : (
              <>
                <button
                  onClick={startProduction}
                  disabled={saving || order.status === 'in_production'}
                  className="flex-1 py-3 bg-brand-dark text-white font-semibold rounded-xl hover:bg-brand-dark/90 disabled:opacity-40 transition-colors"
                >
                  {order.status === 'in_production' ? 'Already In Production' : '▶ Start Production'}
                </button>
                <button
                  onClick={() => setShowHoldModal(true)}
                  disabled={saving}
                  className="flex-1 py-3 border-2 border-red-300 text-red-600 font-semibold rounded-xl hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  ⏸ Place on Hold
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Hold modal */}
      {showHoldModal && order && (
        <HoldModal
          order={order}
          onClose={() => setShowHoldModal(false)}
          onSaved={handleHoldSaved}
        />
      )}
    </div>
  )
}
