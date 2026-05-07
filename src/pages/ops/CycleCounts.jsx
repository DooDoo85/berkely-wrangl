import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const TIER_LABEL = { A: 'Tier A · Motors & Cordless', B: 'Tier B · Components/Extrusions/Fabrics', C: 'Tier C · Faux Blinds' }
const TIER_COLOR = { A: '#a0573a', B: '#b8854d', C: '#5b8c5a' }
const TEAM_LABEL = { roller: 'Roller Team', faux: 'Faux Team' }

const VARIANCE_AUTO_APPROVE_PCT = 0.05  // 5% — anything under auto-approves

function nextFriday(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  // Friday = 5. If today is Friday, use today. Otherwise next Friday.
  const offset = day === 5 ? 0 : (5 - day + 7) % 7
  d.setDate(d.getDate() + offset)
  d.setHours(0, 0, 0, 0)
  return d
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmt$(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  const sign = n < 0 ? '-' : ''
  return sign + '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export default function CycleCounts() {
  const { profile } = useAuth()
  const [team, setTeam]               = useState('roller')
  const [parts, setParts]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [activePart, setActivePart]   = useState(null)
  const [pendingReviews, setPendingReviews] = useState([])
  const [showReviews, setShowReviews] = useState(false)

  const upcomingFriday = useMemo(() => nextFriday(), [])

  useEffect(() => { load() }, [team])

  async function load() {
    setLoading(true)
    const friday = nextFriday()
    const fridayStr = friday.toISOString().slice(0, 10)

    const [dueRes, reviewsRes] = await Promise.all([
      // Parts due on or before the upcoming Friday for this team
      supabase.from('parts')
        .select('id, name, part_type, vendor, qty_on_hand, unit_cost, cycle_count_tier, cycle_count_team, last_counted_at, next_count_due')
        .eq('active', true)
        .eq('cycle_count_team', team)
        .lte('next_count_due', fridayStr)
        .order('next_count_due', { ascending: true }),

      // Pending variance reviews (for owner/admin)
      supabase.from('cycle_counts')
        .select('*, parts(name, part_type, unit_cost)')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setParts(dueRes.data || [])
    setPendingReviews(reviewsRes.data || [])
    setLoading(false)
  }

  // Group by tier for display
  const groupedByTier = useMemo(() => {
    const groups = { A: [], B: [], C: [] }
    parts.forEach(p => {
      if (groups[p.cycle_count_tier]) groups[p.cycle_count_tier].push(p)
    })
    return groups
  }, [parts])

  const totalDue = parts.length
  const isOwner = profile?.role === 'owner'

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#faf6ed' }}>
      <div className="p-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-2xl font-bold text-stone-800">Cycle Counts</h2>
            <p className="text-sm text-stone-500 mt-1">
              Counts due on or before <span className="font-semibold">{fmtDate(upcomingFriday)}</span>
            </p>
          </div>
          {isOwner && pendingReviews.length > 0 && (
            <button
              onClick={() => setShowReviews(!showReviews)}
              className="px-3 py-2 text-sm font-semibold rounded-lg bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200">
              {pendingReviews.length} variance{pendingReviews.length === 1 ? '' : 's'} to review
            </button>
          )}
        </div>

        {/* Pending reviews drawer (owner only) */}
        {showReviews && (
          <PendingReviewsCard reviews={pendingReviews} onAction={load} />
        )}

        {/* Team toggle */}
        <div className="flex items-center gap-2 mb-4">
          {['roller', 'faux'].map(t => (
            <button
              key={t}
              onClick={() => setTeam(t)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                team === t
                  ? 'bg-stone-700 text-white border-stone-700'
                  : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
              }`}
            >
              {TEAM_LABEL[t]}
            </button>
          ))}
          <span className="ml-auto text-sm text-stone-500">
            {loading ? 'Loading…' : totalDue === 0 ? 'No counts due' : `${totalDue} part${totalDue === 1 ? '' : 's'} due`}
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-stone-400">Loading…</div>
        ) : parts.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-12 text-center">
            <div className="text-4xl mb-2">✓</div>
            <div className="text-stone-700 font-medium">All caught up</div>
            <div className="text-sm text-stone-500 mt-1">Nothing due for this team before {fmtDate(upcomingFriday)}.</div>
          </div>
        ) : (
          <div className="space-y-5">
            {['A', 'B', 'C'].map(tier => {
              const tierParts = groupedByTier[tier]
              if (!tierParts.length) return null
              return (
                <div key={tier} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100"
                       style={{ backgroundColor: '#faf6ed' }}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TIER_COLOR[tier] }} />
                    <h3 className="text-sm font-semibold text-stone-800">{TIER_LABEL[tier]}</h3>
                    <span className="ml-auto text-xs text-stone-500">{tierParts.length} due</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 border-b border-stone-100">
                      <tr>
                        <th className="text-left px-4 py-2 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Part</th>
                        <th className="text-left px-4 py-2 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Type</th>
                        <th className="text-right px-4 py-2 text-[10px] font-bold text-stone-500 uppercase tracking-wider">On Hand</th>
                        <th className="text-left px-4 py-2 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Last Counted</th>
                        <th className="text-left px-4 py-2 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Due</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tierParts.map(p => (
                        <tr key={p.id} className="border-b border-stone-50 hover:bg-stone-50">
                          <td className="px-4 py-2.5 font-medium text-stone-800">
                            {p.name}
                            {p.vendor && <div className="text-[11px] text-stone-400">{p.vendor}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-stone-600 text-xs">{p.part_type}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-stone-800">{(p.qty_on_hand ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-stone-500 text-xs">{fmtDate(p.last_counted_at)}</td>
                          <td className="px-4 py-2.5 text-stone-500 text-xs">{fmtDate(p.next_count_due)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => setActivePart(p)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-700 text-white hover:bg-stone-800">
                              Count
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}

        {/* Count modal */}
        {activePart && (
          <CountModal
            part={activePart}
            onClose={() => setActivePart(null)}
            onSubmitted={() => { setActivePart(null); load() }}
            counterId={profile?.id}
          />
        )}

      </div>
    </div>
  )
}

// ─── Count modal ───────────────────────────────────────────────────────────
function CountModal({ part, onClose, onSubmitted, counterId }) {
  const expected = Number(part.qty_on_hand ?? 0)
  const [actual, setActual]     = useState('')
  const [notes, setNotes]       = useState('')
  const [submitting, setSubmitting] = useState(false)

  const actualNum = parseFloat(actual)
  const variance = isNaN(actualNum) ? null : actualNum - expected
  const variancePct = (variance !== null && expected !== 0) ? Math.abs(variance) / expected : null
  const varianceValue = (variance !== null && part.unit_cost != null) ? variance * Number(part.unit_cost) : null
  const willAutoApprove = variancePct !== null && variancePct < VARIANCE_AUTO_APPROVE_PCT

  async function submit() {
    if (isNaN(actualNum)) { alert('Enter a count'); return }
    setSubmitting(true)
    const status = (variance === 0 || willAutoApprove) ? 'auto_approved' : 'pending_review'
    const today  = new Date().toISOString().slice(0, 10)

    // Insert the count
    const { error: insertErr } = await supabase.from('cycle_counts').insert({
      part_id:        part.id,
      count_date:     today,
      expected_qty:   expected,
      actual_qty:     actualNum,
      variance,
      variance_pct:   variancePct,
      variance_value: varianceValue,
      status,
      notes:          notes || null,
      counted_by:     counterId,
    })
    if (insertErr) { alert('Failed to save count: ' + insertErr.message); setSubmitting(false); return }

    // If auto-approved, post the adjustment to qty_on_hand + log inventory transaction
    if (status === 'auto_approved' && variance !== 0) {
      await applyAdjustment(part, actualNum, variance, counterId)
    }

    // Stamp last_counted_at and next_count_due regardless of status
    const cycleDays = part.cycle_count_tier === 'A' ? 14 : 90
    const naiveNext = new Date()
    naiveNext.setDate(naiveNext.getDate() + cycleDays)
    // Snap to next Friday
    const dow = naiveNext.getDay()
    const off = dow === 5 ? 0 : (5 - dow + 7) % 7
    naiveNext.setDate(naiveNext.getDate() + off)
    const nextDueDate = naiveNext.toISOString().slice(0, 10)

    await supabase.from('parts').update({
      last_counted_at: new Date().toISOString(),
      next_count_due:  nextDueDate,
    }).eq('id', part.id)

    setSubmitting(false)
    onSubmitted()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-stone-100">
          <h3 className="font-bold text-stone-800">{part.name}</h3>
          <div className="text-xs text-stone-500 mt-1">{part.vendor || ''} {part.vendor && '·'} {part.part_type}</div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-stone-50 rounded-lg p-3">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Expected (Book Qty)</div>
            <div className="text-2xl font-bold text-stone-800 tabular-nums">{expected.toLocaleString()}</div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Actual (Counted)</label>
            <input
              type="number"
              step="any"
              value={actual}
              onChange={e => setActual(e.target.value)}
              autoFocus
              placeholder="Enter physical count"
              className="w-full px-3 py-3 text-2xl font-semibold text-stone-800 border-2 border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 tabular-nums"
            />
          </div>

          {variance !== null && (
            <div className={`rounded-lg p-3 border ${
              variance === 0           ? 'bg-emerald-50 border-emerald-200' :
              willAutoApprove          ? 'bg-amber-50 border-amber-200'     :
                                         'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-stone-700">Variance</span>
                <span className={`font-bold tabular-nums ${
                  variance === 0   ? 'text-emerald-700' :
                  willAutoApprove  ? 'text-amber-700'   :
                                     'text-red-700'
                }`}>
                  {variance > 0 ? '+' : ''}{variance.toLocaleString()}
                  {variancePct !== null && ` (${(variancePct * 100).toFixed(1)}%)`}
                </span>
              </div>
              {varianceValue !== null && (
                <div className="text-xs text-stone-500 mt-1">
                  Dollar impact: {fmt$(varianceValue)}
                </div>
              )}
              <div className="text-xs mt-2 text-stone-600">
                {variance === 0 ? '✓ Match — no adjustment needed' :
                 willAutoApprove ? '✓ Will auto-post (within 5% threshold)' :
                                   '⚠ Will queue for owner review (variance ≥5%)'}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Anything to flag about this count?"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300" />
          </div>
        </div>

        <div className="px-6 py-3 bg-stone-50 border-t border-stone-100 flex justify-end gap-2 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-stone-600 hover:bg-stone-100">Cancel</button>
          <button onClick={submit} disabled={submitting || isNaN(actualNum)}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-stone-700 text-white hover:bg-stone-800 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Submit Count'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pending Reviews Card ──────────────────────────────────────────────────
function PendingReviewsCard({ reviews, onAction }) {
  const [working, setWorking] = useState(null)

  async function approveCount(c) {
    setWorking(c.id)
    const part = c.parts
    // Apply the adjustment
    const variance = c.variance
    if (variance !== 0) {
      await applyAdjustment({ id: c.part_id, name: part.name, qty_on_hand: c.expected_qty, unit_cost: part.unit_cost }, c.actual_qty, variance, null)
    }
    await supabase.from('cycle_counts').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
    }).eq('id', c.id)
    setWorking(null)
    onAction()
  }

  async function rejectCount(c) {
    if (!confirm('Reject this count? The variance will be discarded and book qty stays unchanged.')) return
    setWorking(c.id)
    await supabase.from('cycle_counts').update({
      status: 'rejected',
      approved_at: new Date().toISOString(),
    }).eq('id', c.id)
    setWorking(null)
    onAction()
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl mb-5 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200">
        <h3 className="font-semibold text-amber-900 text-sm">Pending Variance Reviews</h3>
        <p className="text-xs text-amber-700">Variances ≥5% — approve to post adjustment, or reject to discard.</p>
      </div>
      <div className="divide-y divide-amber-200">
        {reviews.map(c => (
          <div key={c.id} className="px-4 py-3 flex items-center gap-3 bg-white">
            <div className="flex-1">
              <div className="font-medium text-stone-800 text-sm">{c.parts?.name}</div>
              <div className="text-xs text-stone-500 mt-0.5">
                Expected {Number(c.expected_qty).toLocaleString()} · Counted {Number(c.actual_qty).toLocaleString()}
                {c.notes && ` · ${c.notes}`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-red-700 tabular-nums">
                {c.variance > 0 ? '+' : ''}{Number(c.variance).toLocaleString()}
                {c.variance_pct && ` (${(Number(c.variance_pct) * 100).toFixed(1)}%)`}
              </div>
              <div className="text-xs text-stone-500">{fmt$(c.variance_value)}</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => approveCount(c)} disabled={working === c.id}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                Approve
              </button>
              <button onClick={() => rejectCount(c)} disabled={working === c.id}
                className="px-3 py-1.5 text-xs rounded-lg text-red-600 hover:bg-red-50 border border-red-200">
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Apply adjustment helper ───────────────────────────────────────────────
async function applyAdjustment(part, newQty, variance, userId) {
  // Update qty_on_hand
  await supabase.from('parts').update({ qty_on_hand: newQty }).eq('id', part.id)
  // Log inventory transaction
  await supabase.from('inventory_transactions').insert({
    transaction_type: 'adjust',
    part_id:          part.id,
    quantity:         variance,
    reason:           'cycle_count',
    notes:            `Cycle count adjustment for ${part.name}`,
    user_id:          userId,
  })
}
