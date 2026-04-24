import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const REASONS = ['Damage', 'Miscount', 'Correction', 'Return', 'Expired', 'Lost', 'Found', 'Other']

export default function AdjustInventory() {
  const navigate    = useNavigate()
  const { profile } = useAuth()

  const [partSearch,   setPartSearch]   = useState('')
  const [parts,        setParts]        = useState([])
  const [selPart,      setSelPart]      = useState(null)
  const [showPartDrop, setShowPartDrop] = useState(false)
  const [direction,    setDirection]    = useState('+') // '+' or '-'
  const [qty,          setQty]          = useState('')
  const [reason,       setReason]       = useState('')
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [success,      setSuccess]      = useState(null)
  const [error,        setError]        = useState('')
  const qtyRef = useRef(null)

  async function fetchParts(search = '') {
    let q = supabase.from('parts').select('id, name, part_type, vendor_id, qty_on_hand, unit_of_measure')
      .eq('active', true).order('name').limit(20)
    if (search) q = q.ilike('name', `%${search}%`)
    const { data } = await q
    setParts(data || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selPart || !qty || parseFloat(qty) <= 0 || !reason) {
      setError('Select a part, enter quantity, and choose a reason')
      return
    }
    setSaving(true)
    setError('')

    try {
      const qtyNum = parseFloat(qty)
      const signedQty = direction === '+' ? qtyNum : -qtyNum
      const newQty = Math.max(0, (selPart.qty_on_hand || 0) + signedQty)

      const { error: txErr } = await supabase.from('inventory_transactions').insert({
        transaction_type: 'adjust',
        part_id:          selPart.id,
        quantity:         signedQty,
        reason:           reason,
        notes:            notes || null,
        user_id:          profile?.id,
      })
      if (txErr) throw txErr

      await supabase.from('parts').update({
        qty_on_hand: newQty,
        updated_at:  new Date().toISOString(),
      }).eq('id', selPart.id)

      setSuccess({
        part:      selPart.name,
        direction: direction,
        qty:       qtyNum,
        unit:      selPart.unit_of_measure || 'EA',
        reason:    reason,
        newQty:    newQty,
      })

      setSelPart(null); setPartSearch(''); setQty(''); setReason(''); setNotes('')
      setSaving(false)
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const newQtyPreview = selPart && qty
    ? Math.max(0, (selPart.qty_on_hand || 0) + (direction === '+' ? parseFloat(qty) : -parseFloat(qty)))
    : null

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/ops')} className="btn-ghost text-sm">← Ops</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Adjust Inventory</h2>
      </div>

      {success && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <span className="text-xl">⚖️</span>
          <div>
            <div className="text-sm font-semibold text-blue-700">
              Adjusted {success.direction === '+' ? '+' : '-'}{success.qty} {success.unit} — {success.reason}
            </div>
            <div className="text-xs text-blue-600">{success.part} — new qty: {success.newQty}</div>
          </div>
        </div>
      )}

      <div className="card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Part search */}
          <div className="relative">
            <label className="label">Part *</label>
            <input
              className="input"
              placeholder="Search by name or vendor ID..."
              value={partSearch}
              onChange={e => { setPartSearch(e.target.value); fetchParts(e.target.value); setShowPartDrop(true); if (!e.target.value) setSelPart(null) }}
              onFocus={() => { fetchParts(partSearch); setShowPartDrop(true) }}
              onBlur={() => setTimeout(() => setShowPartDrop(false), 200)}
              autoFocus
            />
            {selPart && (
              <div className="mt-1 text-xs text-stone-500 flex items-center gap-2">
                <span className="text-blue-600">✓</span> {selPart.name}
                <span className="text-stone-300">·</span> Current qty: {selPart.qty_on_hand || 0} {selPart.unit_of_measure}
                <button type="button" onClick={() => { setSelPart(null); setPartSearch('') }}
                  className="text-stone-300 hover:text-stone-500 ml-1">✕</button>
              </div>
            )}
            {showPartDrop && parts.length > 0 && !selPart && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                {parts.map(p => (
                  <button key={p.id} type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors"
                    onClick={() => { setSelPart(p); setPartSearch(p.name); setShowPartDrop(false); setTimeout(() => qtyRef.current?.focus(), 50) }}>
                    <div className="text-sm font-semibold text-stone-700">{p.name}</div>
                    <div className="text-xs text-stone-400">{p.part_type} · qty: {p.qty_on_hand || 0} {p.unit_of_measure}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Direction + Quantity */}
          <div>
            <label className="label">Adjustment *</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDirection('+')}
                className={`w-14 py-2.5 rounded-lg text-lg font-bold border transition-all ${
                  direction === '+' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-stone-400 border-stone-200 hover:border-stone-300'
                }`}>+</button>
              <button type="button" onClick={() => setDirection('-')}
                className={`w-14 py-2.5 rounded-lg text-lg font-bold border transition-all ${
                  direction === '-' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-stone-400 border-stone-200 hover:border-stone-300'
                }`}>−</button>
              <input
                ref={qtyRef}
                className="input flex-1 text-lg font-semibold"
                type="number" step="0.01" min="0.01"
                placeholder="0"
                value={qty}
                onChange={e => setQty(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('adj-reason')?.focus() } }}
              />
            </div>
            {newQtyPreview !== null && (
              <div className={`mt-1 text-xs ${newQtyPreview < 0 ? 'text-red-500' : 'text-stone-400'}`}>
                New qty will be: <strong>{newQtyPreview}</strong> {selPart?.unit_of_measure}
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="label">Reason *</label>
            <div id="adj-reason" className="grid grid-cols-4 gap-2">
              {REASONS.map(r => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                    reason === r ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes <span className="text-stone-300 font-normal normal-case">(optional)</span></label>
            <input className="input" placeholder="Additional details..."
              value={notes} onChange={e => setNotes(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e) } }}
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate('/ops')} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving || !selPart || !qty || !reason} className="btn-primary flex-1 text-base py-3">
              {saving ? 'Saving...' : '⚖️ Save Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
