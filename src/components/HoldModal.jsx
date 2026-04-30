import { useState } from 'react'
import { supabase } from '../lib/supabase'

const HOLD_REASONS = [
  'Part on order',
  'Fabric on order',
  'Customer issue',
  'Measurement issue',
  'Other',
]

export default function HoldModal({ order, onClose, onSaved }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [partExpectedDate, setPartExpectedDate] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-calculate expected ship date as part_expected_date + 2 days
  const expectedShipDate = partExpectedDate
    ? new Date(new Date(partExpectedDate).getTime() + 2 * 86400000).toISOString().slice(0, 10)
    : ''

  async function handleSave() {
    if (!reason) return
    setSaving(true)
    const { error } = await supabase.from('orders').update({
      status:             'on_hold',
      hold_status:        'on_hold',
      hold_reason:        reason,
      hold_note:          note.trim() || null,
      hold_started_at:    new Date().toISOString(),
      part_expected_date: partExpectedDate || null,
      expected_ship_date: expectedShipDate || null,
      hold_released_at:   null,
      updated_at:         new Date().toISOString(),
    }).eq('id', order.id)

    setSaving(false)
    if (error) { alert('Error placing hold: ' + error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display font-bold text-stone-800">Place Order on Hold</h3>
            <p className="text-xs text-stone-400 mt-0.5">Order #{order.order_number} · {order.customer_name}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-xl leading-none">✕</button>
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">
            Hold Reason <span className="text-red-400">*</span>
          </label>
          <div className="space-y-2">
            {HOLD_REASONS.map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  reason === r
                    ? 'bg-brand-dark text-white border-brand-dark'
                    : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-stone-500 uppercase tracking-wide mb-1">
            Note <span className="font-normal text-stone-400 normal-case">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Waiting on motor from Rollease, ordered 4/29"
            className="w-full border border-stone-200 rounded-xl p-3 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 resize-none h-20"
          />
        </div>

        {/* Part expected date */}
        <div className="mb-5">
          <label className="block text-xs font-bold text-stone-500 uppercase tracking-wide mb-1">
            Part / Fabric Expected Date <span className="font-normal text-stone-400 normal-case">(optional)</span>
          </label>
          <input
            type="date"
            value={partExpectedDate}
            onChange={e => setPartExpectedDate(e.target.value)}
            className="input w-full"
          />
          {expectedShipDate && (
            <p className="text-xs text-stone-400 mt-1">
              Expected ship date: <span className="font-semibold text-stone-600">{new Date(expectedShipDate + 'T00:00:00').toLocaleDateString()}</span> (part date + 2 days)
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 rounded-xl border border-stone-200 text-sm text-stone-500 hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!reason || saving}
            className="flex-1 py-2 px-4 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : 'Place on Hold'}
          </button>
        </div>
      </div>
    </div>
  )
}
