import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

// ── Fault taxonomy: stage → reasons ─────────────────────────────────────────
const FAULT_TAXONOMY = {
  'Order Entry':      ['Wrong size entered', 'Wrong color or fabric', 'Wrong product', 'Wrong quantity'],
  'Measurement':      ['Dealer measured wrong', 'Measurement not provided', 'Mount type wrong'],
  'Production':       ['Cut wrong', 'Assembly defect', 'Wrong components used', 'Quality/finish defect'],
  'Material/Fabric':  ['Fabric flaw', 'Wrong fabric pulled', 'Damaged material'],
  'Shipping/Handling':['Damaged in transit', 'Lost shipment', 'Wrong item shipped'],
  'Customer/Dealer':  ['Dealer changed order', 'Dealer error', 'Customer rejected'],
}
const STAGES = Object.keys(FAULT_TAXONOMY)

// ── Helpers ──────────────────────────────────────────────────────────────────
const usd = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n))
const usd0 = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n))
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

const RANGES = [
  { key: 'month',  label: 'This month' },
  { key: '30d',    label: 'Last 30 days' },
  { key: 'all',    label: 'All time' },
]

function rangeStart(key) {
  const now = new Date()
  if (key === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (key === '30d')   { const d = new Date(now); d.setDate(d.getDate() - 30); return d }
  return null // all
}

export default function RemakesReport() {
  const { profile } = useAuth()
  const role = profile?.role
  const canEdit = role === 'owner' || role === 'executive'

  const [remakes, setRemakes] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange]     = useState('month')
  const [needsOnly, setNeedsOnly] = useState(false)
  const [savingId, setSavingId]   = useState(null)
  const [error, setError]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('remakes')
      .select('*')
      .eq('product_line', 'roller')
      .order('remake_date', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setRemakes(data || [])
    setLoading(false)
  }

  // Date-filtered subset
  const filtered = useMemo(() => {
    const start = rangeStart(range)
    let rows = remakes
    if (start) {
      const iso = start.toISOString().slice(0, 10)
      rows = rows.filter(r => r.remake_date && r.remake_date >= iso)
    }
    if (needsOnly) rows = rows.filter(r => !r.reviewed_at)
    return rows
  }, [remakes, range, needsOnly])

  // Headline metrics (respect the date range, ignore needs-only toggle)
  const metrics = useMemo(() => {
    const start = rangeStart(range)
    const iso = start ? start.toISOString().slice(0, 10) : null
    const scope = iso ? remakes.filter(r => r.remake_date && r.remake_date >= iso) : remakes
    const net      = scope.reduce((s, r) => s + (Number(r.net_impact) || 0), 0)
    const cost     = scope.reduce((s, r) => s + (Number(r.internal_cost) || 0), 0)
    const absorbed = scope.filter(r => (Number(r.net_impact) || 0) < 0)
    const recovered= scope.filter(r => (Number(r.net_impact) || 0) >= 0)
    const needs    = scope.filter(r => !r.reviewed_at).length
    return {
      count: scope.length, net, cost,
      absorbedCount: absorbed.length,
      absorbedNet: absorbed.reduce((s, r) => s + (Number(r.net_impact) || 0), 0),
      recoveredCount: recovered.length,
      recoveredNet: recovered.reduce((s, r) => s + (Number(r.net_impact) || 0), 0),
      needs,
    }
  }, [remakes, range])

  async function saveFault(row, patch) {
    if (!canEdit) return
    setSavingId(row.remake_wo)
    const updates = {
      ...patch,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile?.id || null,
    }
    const { error } = await supabase.from('remakes').update(updates).eq('remake_wo', row.remake_wo)
    setSavingId(null)
    if (error) { setError(error.message); return }
    setRemakes(prev => prev.map(r => r.remake_wo === row.remake_wo ? { ...r, ...updates } : r))
  }

  return (
    <div className="min-h-screen bg-surface-page">
      <div className="max-w-screen-xl mx-auto p-3 md:p-4 pb-12">

        {/* Header */}
        <div className="mb-3">
          <h1 className="font-display font-bold text-ink-strong text-xl md:text-2xl">Remakes</h1>
          <p className="text-xs text-ink-muted mt-0.5">Roller shade remakes from ePIC · categorize each one to track where they originate</p>
        </div>

        {/* Headline metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
          <div className="card p-3 !rounded-lg ring-1 ring-stone-200 shadow-none">
            <p className="text-[10px] font-medium text-ink-mid uppercase tracking-wider">Net impact</p>
            <p className={`text-2xl font-medium tabular-nums mt-1 ${metrics.net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {loading ? '—' : usd0(metrics.net)}
            </p>
            <p className="text-[11px] text-ink-muted mt-0.5">{metrics.count} remakes</p>
          </div>
          <div className="card p-3 !rounded-lg ring-1 ring-stone-200 shadow-none">
            <p className="text-[10px] font-medium text-ink-mid uppercase tracking-wider">Absorbed</p>
            <p className="text-2xl font-medium tabular-nums mt-1 text-red-700">{loading ? '—' : usd0(metrics.absorbedNet)}</p>
            <p className="text-[11px] text-ink-muted mt-0.5">{metrics.absorbedCount} we ate</p>
          </div>
          <div className="card p-3 !rounded-lg ring-1 ring-stone-200 shadow-none">
            <p className="text-[10px] font-medium text-ink-mid uppercase tracking-wider">Recovered</p>
            <p className="text-2xl font-medium tabular-nums mt-1 text-emerald-700">{loading ? '—' : '+' + usd0(metrics.recoveredNet).replace('$', '$')}</p>
            <p className="text-[11px] text-ink-muted mt-0.5">{metrics.recoveredCount} billed</p>
          </div>
          <div className="card p-3 !rounded-lg ring-1 ring-stone-200 shadow-none">
            <p className="text-[10px] font-medium text-ink-mid uppercase tracking-wider">Cost of rework</p>
            <p className="text-2xl font-medium tabular-nums mt-1 text-ink-strong">{loading ? '—' : usd0(metrics.cost)}</p>
            <p className="text-[11px] text-ink-muted mt-0.5">{metrics.needs} need a reason</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
          <div className="flex gap-1">
            {RANGES.map(r => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  range === r.key ? 'bg-ink-strong text-white border-ink-strong'
                                  : 'bg-white text-ink-mid border-stone-200 hover:border-stone-300'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-mid cursor-pointer select-none">
            <input type="checkbox" checked={needsOnly} onChange={e => setNeedsOnly(e.target.checked)}
              className="rounded border-stone-300" />
            Needs reason only
          </label>
        </div>

        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {/* Table */}
        <div className="card !rounded-lg ring-1 ring-stone-200 shadow-none overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-ink-muted text-sm">Loading remakes…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-3xl mb-2">✓</div>
              <p className="text-sm text-ink-mid">{needsOnly ? 'Nothing left to categorize for this range.' : 'No remakes in this range.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-ink-muted border-b border-stone-200 bg-stone-50/50">
                    <th className="px-3 py-2.5">Remake</th>
                    <th className="px-3 py-2.5">Original</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Customer</th>
                    <th className="px-3 py-2.5">Sidemark</th>
                    <th className="px-3 py-2.5 text-right">Units</th>
                    <th className="px-3 py-2.5 text-right">Charged</th>
                    <th className="px-3 py-2.5 text-right">Cost</th>
                    <th className="px-3 py-2.5 text-right">Net</th>
                    <th className="px-3 py-2.5 min-w-[260px]">Fault reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const net = Number(r.net_impact) || 0
                    const reviewed = !!r.reviewed_at
                    return (
                      <tr key={r.remake_wo} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/40">
                        <td className="px-3 py-2 text-[13px] font-semibold text-ink-strong tabular-nums whitespace-nowrap">
                          {!reviewed && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 align-middle" title="Needs reason" />}
                          {r.remake_wo}
                        </td>
                        <td className="px-3 py-2 text-[12px] tabular-nums whitespace-nowrap text-ink-mid">
                          {r.original_wo || <span className="text-ink-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-ink-mid whitespace-nowrap">{fmtDate(r.remake_date)}</td>
                        <td className="px-3 py-2 text-[12px] text-ink-mid truncate max-w-[150px]">{r.customer || '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-ink-muted truncate max-w-[140px]">{r.sidemark || '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-ink-mid text-right tabular-nums">{r.unit_count ?? '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-ink-mid text-right tabular-nums">{usd(r.customer_charge)}</td>
                        <td className="px-3 py-2 text-[12px] text-ink-mid text-right tabular-nums">{usd(r.internal_cost)}</td>
                        <td className={`px-3 py-2 text-[12px] font-bold text-right tabular-nums ${net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          {net < 0 ? '' : '+'}{usd(net)}
                        </td>
                        <td className="px-3 py-2">
                          <FaultEditor row={r} canEdit={canEdit} saving={savingId === r.remake_wo} onSave={saveFault} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!canEdit && !loading && (
          <p className="text-[11px] text-ink-muted mt-2">Categorizing remakes is limited to owner/executive accounts.</p>
        )}
      </div>
    </div>
  )
}

// ── Inline fault editor (stage → reason) ─────────────────────────────────────
function FaultEditor({ row, canEdit, saving, onSave }) {
  const [stage, setStage]   = useState(row.fault_stage || '')
  const [reason, setReason] = useState(row.fault_reason || '')

  useEffect(() => { setStage(row.fault_stage || ''); setReason(row.fault_reason || '') }, [row.fault_stage, row.fault_reason])

  if (!canEdit) {
    return row.fault_stage
      ? <span className="text-[12px] text-ink-mid">{row.fault_stage}{row.fault_reason ? ` · ${row.fault_reason}` : ''}</span>
      : <span className="text-[11px] text-ink-muted italic">Not categorized</span>
  }

  const reasons = stage ? FAULT_TAXONOMY[stage] || [] : []
  const dirty = stage !== (row.fault_stage || '') || reason !== (row.fault_reason || '')

  return (
    <div className="flex items-center gap-1.5">
      <select value={stage}
        onChange={e => { setStage(e.target.value); setReason('') }}
        className="text-[12px] border border-stone-300 rounded px-1.5 py-1 bg-white max-w-[120px]">
        <option value="">Stage…</option>
        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={reason} disabled={!stage}
        onChange={e => setReason(e.target.value)}
        className="text-[12px] border border-stone-300 rounded px-1.5 py-1 bg-white max-w-[130px] disabled:opacity-40">
        <option value="">Reason…</option>
        {reasons.map(rr => <option key={rr} value={rr}>{rr}</option>)}
      </select>
      {dirty && stage && reason && (
        <button onClick={() => onSave(row, { fault_stage: stage, fault_reason: reason })}
          disabled={saving}
          className="text-[11px] font-semibold text-white bg-brand-gold rounded px-2 py-1 hover:brightness-105 disabled:opacity-50">
          {saving ? '…' : 'Save'}
        </button>
      )}
    </div>
  )
}
