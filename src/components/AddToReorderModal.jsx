import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

export default function AddToReorderModal({ part, onClose, onAdded }) {
  const { session } = useAuth()
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!part) return
    setSaving(true)

    // Look up vendor id
    let vendorId = null
    if (part.vendor_id) {
      const { data } = await supabase
        .from('vendors')
        .select('id')
        .ilike('vendor_name', part.vendor_id)
        .limit(1)
      vendorId = data?.[0]?.id || null
    }

    await supabase.from('reorder_queue').insert({
      part_id: part.id,
      part_name: part.name,
      stock_number: part.vendor_part_name || null,
      vendor_id: vendorId,
      vendor_name: part.vendor_id || 'Unknown Vendor',
      qty_requested: qty,
      note: note || null,
      added_by: session?.user?.id || null
    })

    setSaving(false)
    setDone(true)
    if (onAdded) onAdded()
    setTimeout(() => onClose(), 1200)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        {done ? (
          <div className="text-center py-4">
            <div className="text-2xl mb-2">✓</div>
            <p className="font-semibold text-stone-800">Added to reorder queue</p>
            <p className="text-sm text-stone-500 mt-1">{part.name}</p>
          </div>
        ) : (
          <>
            <h2 className="font-bold text-stone-800 mb-1">Add to Reorder Queue</h2>
            <p className="text-sm text-stone-500 mb-5">{part.name}</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wide block mb-1">Quantity Needed</label>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={e => setQty(parseInt(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wide block mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. urgently needed, specific color..."
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="bg-stone-50 rounded-lg p-3 text-xs text-stone-500 space-y-1">
                <div className="flex justify-between">
                  <span>Vendor</span>
                  <span className="font-medium text-stone-700">{part.vendor_id || 'Unknown'}</span>
                </div>
                {part.vendor_part_name && (
                  <div className="flex justify-between">
                    <span>Stock #</span>
                    <span className="font-mono text-stone-700">{part.vendor_part_name}</span>
                  </div>
                )}
                {part.qty_on_hand !== undefined && (
                  <div className="flex justify-between">
                    <span>On Hand</span>
                    <span className={`font-medium ${part.qty_on_hand <= 0 ? 'text-red-600' : 'text-stone-700'}`}>{part.qty_on_hand}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 border border-stone-200 text-stone-600 text-sm font-semibold py-2 rounded-lg hover:bg-stone-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving || qty < 1}
                className="flex-1 bg-brand-dark text-white text-sm font-semibold py-2 rounded-lg hover:bg-brand-mid transition-colors disabled:opacity-50"
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
