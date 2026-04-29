import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function MatchReview() {
  const navigate = useNavigate()
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})

  useEffect(() => { loadPending() }, [])

  async function loadPending() {
    setLoading(true)
    const { data } = await supabase
      .from('epic_committed_stock')
      .select('*, parts(id, name, vendor_id, vendor)')
      .eq('match_status', 'pending_review')
      .eq('relieved', false)
      .order('match_score', { ascending: false })
      .limit(200)
    setPending(data || [])
    setLoading(false)
  }

  async function approve(item) {
    setSaving(prev => ({ ...prev, [item.id]: 'approving' }))
    try {
      // Save to mappings table
      await supabase.from('epic_part_mappings').upsert({
        epic_stock_code:  item.stock_code,
        epic_description: item.component_description,
        wrangl_part_id:   item.part_id,
        wrangl_part_name: item.parts?.name,
        approved_at:      new Date().toISOString(),
      }, { onConflict: 'epic_stock_code' })

      // Mark as auto_matched
      await supabase.from('epic_committed_stock')
        .update({ match_status: 'auto_matched' })
        .eq('id', item.id)

      // Update qty_committed on part
      const { data: part } = await supabase
        .from('parts')
        .select('qty_committed')
        .eq('id', item.part_id)
        .single()

      if (part) {
        const current = parseFloat(part.qty_committed) || 0
        await supabase.from('parts').update({
          qty_committed: current + parseFloat(item.required_qty || 0),
          updated_at: new Date().toISOString(),
        }).eq('id', item.part_id)
      }

      setPending(prev => prev.filter(p => p.id !== item.id))
    } catch (e) {
      alert('Error approving: ' + e.message)
    } finally {
      setSaving(prev => ({ ...prev, [item.id]: null }))
    }
  }

  async function reject(item) {
    setSaving(prev => ({ ...prev, [item.id]: 'rejecting' }))
    try {
      await supabase.from('epic_committed_stock')
        .update({ match_status: 'unmatched', part_id: null })
        .eq('id', item.id)
      setPending(prev => prev.filter(p => p.id !== item.id))
    } catch (e) {
      alert('Error rejecting: ' + e.message)
    } finally {
      setSaving(prev => ({ ...prev, [item.id]: null }))
    }
  }

  if (loading) return <div className="p-8 text-stone-500 text-sm">Loading pending matches...</div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Match Review</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {pending.length} pending match{pending.length !== 1 ? 'es' : ''} — review and approve or reject
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory/committed-import')} className="text-sm text-stone-500 hover:text-stone-800 transition-colors">
            ← Import
          </button>
          <button onClick={() => navigate('/inventory')} className="text-sm text-stone-500 hover:text-stone-800 transition-colors">
            Inventory
          </button>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="text-stone-600 font-semibold">No pending matches</p>
          <p className="text-stone-400 text-sm mt-1">All committed stock lines have been reviewed.</p>
        </div>
      ) : (
        <>
          {/* Info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
            <span className="text-amber-500 text-lg mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">These matches scored 85–94% confidence</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Approve to confirm the match, commit the qty, and save it permanently so future imports skip review.
                Reject if the match is wrong — it will be marked unmatched with no qty change.
              </p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold tracking-[0.1em] text-stone-400 uppercase border-b border-stone-100 bg-stone-50">
                  <th className="text-left px-5 py-3">ePIC Component</th>
                  <th className="text-left px-5 py-3">Stock Code</th>
                  <th className="text-left px-5 py-3">Matched To (Wrangl)</th>
                  <th className="text-center px-5 py-3">Score</th>
                  <th className="text-center px-5 py-3">Qty</th>
                  <th className="text-left px-5 py-3">WO</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map(item => {
                  const score = Math.round((item.match_score || 0) * 100)
                  const scoreColor = score >= 92 ? 'text-green-700 bg-green-50' : score >= 88 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'
                  const isSaving = saving[item.id]

                  return (
                    <tr key={item.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-stone-800 font-medium text-xs leading-snug">{item.component_description}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded">{item.stock_code}</span>
                      </td>
                      <td className="px-5 py-3">
                        {item.parts ? (
                          <div>
                            <p className="text-stone-800 text-xs font-medium">{item.parts.name}</p>
                            {item.parts.vendor && (
                              <p className="text-stone-400 text-xs">{item.parts.vendor}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-stone-300 text-xs">No match</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor}`}>
                          {score}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-stone-600 text-xs font-semibold">
                        {item.required_qty} {item.uom}
                      </td>
                      <td className="px-5 py-3 text-stone-400 text-xs font-mono">{item.work_order}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => approve(item)}
                            disabled={!!isSaving}
                            className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-40"
                          >
                            {isSaving === 'approving' ? '...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => reject(item)}
                            disabled={!!isSaving}
                            className="text-xs font-semibold text-red-500 bg-red-50 border border-red-200 px-3 py-1 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40"
                          >
                            {isSaving === 'rejecting' ? '...' : 'Reject'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
