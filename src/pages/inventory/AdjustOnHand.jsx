import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

// ═══════════════════════════════════════════════════════════════════════
// Adjust On-Hand — manual physical-count correction screen
//
// Built primarily for the May 28 component+extrusion reset count week,
// but works for any part type going forward. Pick a part, see current
// on-hand and recent movement history, enter the corrected value with a
// required note, submit.
//
// IMPORTANT — every submission writes:
//   1. An inventory_transactions row with transaction_type = 'adjust' and
//      quantity = (new - old)  [signed: +5 means "5 more than I thought",
//      -3 means "3 fewer than I thought"]
//   2. An update to parts.qty_on_hand to the new value
//
// This keeps the audit trail in inventory_transactions complete. Any
// future net-replay of inventory_transactions will produce the same
// qty_on_hand we just set, because the adjust delta has been recorded.
// ═══════════════════════════════════════════════════════════════════════

const PART_TYPES = [
  { value: 'component', label: 'Component' },
  { value: 'extrusion', label: 'Extrusion' },
  { value: 'fabric',    label: 'Fabric' },
  { value: 'blind',     label: 'Faux Blind' },
]

export default function AdjustOnHand() {
  const { profile } = useAuth()
  const [partType, setPartType]   = useState('component')
  const [search, setSearch]       = useState('')
  const [matches, setMatches]     = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched]   = useState(false)

  const [selectedPart, setSelectedPart] = useState(null)
  const [history, setHistory]     = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [newQty, setNewQty]       = useState('')
  const [reason, setReason]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(null)

  async function runSearch(e) {
    e?.preventDefault()
    const term = search.trim()
    if (!term) return
    setSearching(true)
    setSearched(true)
    setSelectedPart(null)
    setHistory([])
    setSuccess(null)

    const { data, error } = await supabase
      .from('parts')
      .select('id, name, part_type, qty_on_hand, unit_of_measure, vendor_part_number')
      .eq('part_type', partType)
      .eq('active', true)
      .ilike('name', `%${term}%`)
      .order('name')
      .limit(25)

    if (error) {
      console.error('Part search error:', error)
      setMatches([])
    } else {
      setMatches(data || [])
      if (data && data.length === 1) selectPart(data[0])
    }
    setSearching(false)
  }

  async function selectPart(part) {
    setSelectedPart(part)
    setNewQty('')
    setReason('')
    setError('')
    setSuccess(null)
    setHistoryLoading(true)

    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('transaction_type, quantity, notes, created_at, user_id')
      .eq('part_id', part.id)
      .order('created_at', { ascending: false })
      .limit(15)

    if (error) {
      console.error('History load error:', error)
      setHistory([])
    } else {
      setHistory(data || [])
    }
    setHistoryLoading(false)
  }

  async function handleSubmit() {
    setError('')
    const parsed = parseFloat(newQty)
    if (Number.isNaN(parsed)) {
      setError('Enter a numeric quantity')
      return
    }
    if (parsed < 0) {
      setError('Quantity cannot be negative')
      return
    }
    if (!reason.trim()) {
      setError('A reason note is required (e.g. "Physical count May 28")')
      return
    }

    const oldQty = Number(selectedPart.qty_on_hand || 0)
    const delta  = parsed - oldQty
    if (delta === 0) {
      setError('No change — new quantity matches current on-hand')
      return
    }

    setSaving(true)
    try {
      // 1. Write the audit transaction (signed delta)
      const { error: txnErr } = await supabase.from('inventory_transactions').insert({
        transaction_type: 'adjust',
        part_id:          selectedPart.id,
        quantity:         delta,
        notes:            reason.trim(),
        user_id:          profile?.id || null,
      })
      if (txnErr) throw new Error('Audit log failed: ' + txnErr.message)

      // 2. Update the part's on-hand to the new absolute value
      const { error: partErr } = await supabase.from('parts').update({
        qty_on_hand: parsed,
        updated_at:  new Date().toISOString(),
      }).eq('id', selectedPart.id)
      if (partErr) throw new Error('On-hand update failed: ' + partErr.message)

      setSuccess({ oldQty, newQty: parsed, delta })
      // Reload the selected part + history so the UI reflects the new state
      const { data: refreshed } = await supabase
        .from('parts')
        .select('id, name, part_type, qty_on_hand, unit_of_measure, vendor_part_number')
        .eq('id', selectedPart.id)
        .single()
      if (refreshed) selectPart(refreshed)
      setNewQty('')
      setReason('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const oldQty  = Number(selectedPart?.qty_on_hand || 0)
  const parsed  = parseFloat(newQty)
  const delta   = Number.isFinite(parsed) ? parsed - oldQty : null
  const uom     = selectedPart?.unit_of_measure || ''

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-800">Adjust On-Hand</h1>
        <p className="text-sm text-stone-500 mt-1">
          Correct a part's on-hand quantity after a physical count. Every change is logged with a reason and a signed delta in the inventory audit trail.
        </p>
      </div>

      {/* Search controls */}
      <form onSubmit={runSearch} className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex rounded-lg border border-stone-200 overflow-hidden shrink-0 flex-wrap">
            {PART_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => { setPartType(t.value); setMatches([]); setSelectedPart(null); setSearched(false); setSuccess(null) }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  partType === t.value
                    ? 'bg-brand-dark text-white'
                    : 'bg-white text-stone-600 hover:bg-stone-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${partType} by name…`}
            className="flex-1 px-4 py-2 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark/30"
          />
          <button
            type="submit"
            disabled={searching || !search.trim()}
            className="px-5 py-2 rounded-lg bg-brand-dark text-white text-sm font-semibold hover:bg-brand-dark/90 disabled:opacity-50 shrink-0"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {/* Match picker */}
      {searched && !selectedPart && (
        <div className="card mb-6">
          {matches.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500">
              No active {partType} parts match “{search.trim()}”.
            </div>
          ) : (
            <>
              <div className="px-4 py-2 border-b border-stone-100 text-[11px] font-bold uppercase tracking-widest text-stone-400">
                {matches.length} match{matches.length !== 1 ? 'es' : ''} — pick one
              </div>
              {matches.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectPart(p)}
                  className="w-full text-left px-4 py-3 border-b border-stone-50 last:border-b-0 hover:bg-stone-50 transition-colors flex items-center justify-between"
                >
                  <span className="text-sm font-medium text-stone-800">{p.name}</span>
                  <span className="text-xs text-stone-400 tabular-nums">
                    {Number(p.qty_on_hand || 0).toLocaleString()} {p.unit_of_measure}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Adjust form */}
      {selectedPart && (
        <div className="card overflow-hidden mb-6">
          {/* Part header */}
          <div className="px-5 py-4 border-b border-stone-100 bg-stone-50/60 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-stone-800">{selectedPart.name}</p>
              <p className="text-xs text-stone-500 mt-0.5">
                Currently <span className="font-mono font-semibold tabular-nums">{oldQty.toLocaleString()} {uom}</span> on hand
                {selectedPart.vendor_part_number && (
                  <> · <span className="font-mono">{selectedPart.vendor_part_number}</span></>
                )}
              </p>
            </div>
            <button
              onClick={() => { setSelectedPart(null); setHistory([]); setSuccess(null); setNewQty(''); setReason('') }}
              className="text-xs text-stone-400 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100"
            >
              ← Back
            </button>
          </div>

          {/* Form */}
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">New On-Hand Quantity ({uom})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                placeholder={`Currently ${oldQty}`}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark/30"
              />
              {delta !== null && delta !== 0 && (
                <p className={`text-xs mt-1 ${delta > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {delta > 0 ? '+' : ''}{delta.toLocaleString()} {uom} {delta > 0 ? 'added' : 'removed'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Reason / Note (required)</label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Physical count May 28"
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark/30"
              />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
            )}

            {success && (
              <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg">
                ✓ Adjusted from {success.oldQty.toLocaleString()} → {success.newQty.toLocaleString()} {uom}
                <span className="text-emerald-700"> ({success.delta > 0 ? '+' : ''}{success.delta.toLocaleString()})</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={saving || !newQty || !reason.trim()}
              className="w-full px-5 py-2.5 rounded-lg bg-brand-dark text-white text-sm font-semibold hover:bg-brand-dark/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Adjustment'}
            </button>
          </div>

          {/* Movement history */}
          <div className="border-t border-stone-100">
            <div className="px-5 py-2 bg-stone-50/40 text-[10px] font-bold uppercase tracking-widest text-stone-400">
              Recent movements (last 15)
            </div>
            {historyLoading ? (
              <div className="p-4 text-sm text-stone-400">Loading…</div>
            ) : history.length === 0 ? (
              <div className="p-4 text-sm text-stone-400 text-center">No transaction history for this part yet.</div>
            ) : (
              <div>
                {history.map((h, i) => {
                  const qty = Number(h.quantity || 0)
                  const isNeg = qty < 0
                  return (
                    <div key={i} className="px-5 py-2 grid grid-cols-12 gap-2 text-xs border-b border-stone-50 last:border-b-0 items-center">
                      <div className="col-span-2 text-stone-500">{new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                      <div className="col-span-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                          h.transaction_type === 'receive' ? 'bg-emerald-100 text-emerald-700' :
                          h.transaction_type === 'consume' ? 'bg-amber-100 text-amber-700' :
                          h.transaction_type === 'adjust'  ? 'bg-blue-100 text-blue-700' :
                          h.transaction_type === 'cut'     ? 'bg-stone-200 text-stone-700' :
                                                             'bg-stone-100 text-stone-600'
                        }`}>{h.transaction_type}</span>
                      </div>
                      <div className={`col-span-2 text-right font-mono tabular-nums font-semibold ${isNeg ? 'text-red-700' : 'text-stone-800'}`}>
                        {qty > 0 ? '+' : ''}{qty.toLocaleString()}
                      </div>
                      <div className="col-span-6 text-stone-500 truncate">{h.notes || '—'}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
