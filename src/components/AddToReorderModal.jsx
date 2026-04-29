import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AddToReorderModal({ part, onClose, onAdded }) {
  const [qty, setQty] = useState(part?.reorder_qty || 1)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    if (!part) return
    setSaving(true)
    try {
      // Try to find matching vendor in vendors table
      const { data: vendors } = await supabase
        .from('vendors')
        .select('id, vendor_name')
        .ilike('vendor_name', part.vendor || '')
        .limit(1)

      const vendorId = vendors?.[0]?.id || null
      const vendorName = part.vendor || vendors?.[0]?.vendor_name || 'Unknown Vendor'

      const { error } = await supabase.from('reorder_queue').insert({
        part_id: part.id,
        part_name: part.name,
        stock_number: part.vendor_id,
        vendor_id: vendorId,
        vendor_name: vendorName,
        qty_requested: parseInt(qty),
        note: note.trim() || null,
      })

      if (error) throw error
      setDone(true)
      setTimeout(() => {
        onAdded?.()
        onClose()
      }, 1200)
    } catch (e) {
      alert('Error adding to queue: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-stone-800">Add to Reorder Queue</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-xl leading-none">✕</button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-sm font-semibold text-emerald-700">Added to reorder queue!</p>
          </div>
        ) : (
          <>
            {/* Part info */}
            <div className="bg-stone-50 rounded-xl p-3 mb-4">
              <p className="font-semibold text-stone-800 text-sm">{part?.name}</p>
              <div className="flex items-center gap-3 mt-1">
                {part?.vendor_id && (
                  <span className="font-mono text-xs text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded">
                    {part.vendor_id}
                  </span>
                )}
                {part?.vendor && (
                  <span className="text-xs text-stone-400">{part.vendor}</span>
                )}
              </div>
              {(part?.qty_on_hand !== null && part?.qty_on_hand !== undefined) && (
                <p className="text-xs text-stone-400 mt-1">
                  Currently on hand: <span className="font-semibold text-stone-600">{part.qty_on_hand}</span>
                </p>
              )}
            </div>

            {/* Qty */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wide mb-1">
                Quantity to Order
              </label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="input w-32"
                autoFocus
              />
            </div>

            {/* Note */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wide mb-1">
                Note <span className="font-normal text-stone-400 normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. urgent, running low on job #123"
                className="input w-full"
              />
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
                onClick={handleSubmit}
                disabled={saving || !qty}
                className="flex-1 py-2 px-4 rounded-xl bg-brand-dark text-white text-sm font-semibold hover:bg-brand-dark/90 disabled:opacity-40 transition-colors"
              >
                {saving ? 'Adding...' : 'Add to Queue'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
