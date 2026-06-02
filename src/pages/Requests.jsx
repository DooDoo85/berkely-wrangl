import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'

const STATUSES = [
  { key: 'new',     label: 'New',     color: 'bg-blue-100 text-blue-700' },
  { key: 'doing',   label: 'Doing',   color: 'bg-amber-100 text-amber-700' },
  { key: 'waiting', label: 'Waiting', color: 'bg-purple-100 text-purple-700' },
  { key: 'done',    label: 'Done',    color: 'bg-emerald-100 text-emerald-700' },
]
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]))

// Common askers — quick-pick chips so entry is fast. Free text also allowed.
const ASKERS = ['Pete', 'Kevin', 'Parker', 'Sally', 'Rene', 'Me']

const fmtWhen = (d) => {
  const diff = Date.now() - new Date(d).getTime()
  const h = Math.floor(diff / 3.6e6), dys = Math.floor(diff / 8.64e7)
  if (h < 1) return 'just now'
  if (h < 24) return h + 'h ago'
  if (dys < 7) return dys + 'd ago'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Requests() {
  const { profile } = useAuth()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [showDone, setShowDone] = useState(false)

  // New-request form
  const [title, setTitle]     = useState('')
  const [detail, setDetail]   = useState('')
  const [asker, setAsker]     = useState('')
  const [urgent, setUrgent]   = useState(false)
  const [adding, setAdding]   = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setRows(data || [])
    setLoading(false)
  }

  async function addRequest() {
    if (!title.trim()) { setError('Enter what is being requested.'); return }
    setAdding(true); setError('')
    const payload = {
      title: title.trim(),
      detail: detail.trim() || null,
      requested_by: asker.trim() || null,
      created_by: profile?.id || null,
      status: 'new',
      priority: urgent ? 'urgent' : 'normal',
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('requests').insert(payload)
    setAdding(false)
    if (error) { setError(error.message); return }
    setTitle(''); setDetail(''); setAsker(''); setUrgent(false)
    load()
  }

  async function setStatus(row, status) {
    const updates = { status, updated_at: new Date().toISOString(), done_at: status === 'done' ? new Date().toISOString() : null }
    const { error } = await supabase.from('requests').update(updates).eq('id', row.id)
    if (error) { setError(error.message); return }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...updates } : r))
  }

  async function remove(row) {
    if (!confirm('Delete this request?')) return
    await supabase.from('requests').delete().eq('id', row.id)
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  const visible = useMemo(
    () => rows.filter(r => showDone || r.status !== 'done'),
    [rows, showDone]
  )

  // Group by asker, "Unassigned" last
  const grouped = useMemo(() => {
    const map = {}
    for (const r of visible) {
      const k = r.requested_by || 'Unassigned'
      ;(map[k] = map[k] || []).push(r)
    }
    return Object.entries(map).sort((a, b) => {
      if (a[0] === 'Unassigned') return 1
      if (b[0] === 'Unassigned') return -1
      return b[1].length - a[1].length
    })
  }, [visible])

  const openCount = rows.filter(r => r.status !== 'done').length

  return (
    <div className="min-h-screen bg-surface-page">
      <div className="max-w-screen-xl mx-auto p-3 md:p-4 pb-12">

        <div className="mb-3">
          <h1 className="font-display font-bold text-ink-strong text-xl md:text-2xl">Requests</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            {loading ? 'Loading…' : `${openCount} open request${openCount !== 1 ? 's' : ''}`} · anyone can add — nothing slips through
          </p>
        </div>

        {/* Add form */}
        <div className="card p-3 !rounded-lg ring-1 ring-stone-200 shadow-none mb-4">
          <div className="flex flex-col gap-2">
            <input value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) addRequest() }}
              placeholder="What's needed? (e.g. order more shrink wrap)"
              className="w-full text-sm border border-stone-300 rounded-lg px-3 py-2" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-ink-muted">From:</span>
              {ASKERS.map(a => (
                <button key={a} onClick={() => setAsker(a)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    asker === a ? 'bg-ink-strong text-white border-ink-strong'
                                : 'bg-white text-ink-mid border-stone-200 hover:border-stone-300'}`}>
                  {a}
                </button>
              ))}
              <input value={ASKERS.includes(asker) ? '' : asker}
                onChange={e => setAsker(e.target.value)}
                placeholder="other…"
                className="text-xs border border-stone-300 rounded-full px-2.5 py-1 w-24" />
              <label className="flex items-center gap-1.5 text-xs text-ink-mid cursor-pointer ml-2">
                <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="rounded border-stone-300" />
                Urgent
              </label>
              <button onClick={addRequest} disabled={adding}
                className="ml-auto text-sm font-semibold px-4 py-1.5 rounded-lg bg-brand-gold text-white hover:brightness-105 disabled:opacity-50">
                {adding ? 'Adding…' : 'Add request'}
              </button>
            </div>
          </div>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-ink-muted">Grouped by who asked</span>
          <label className="flex items-center gap-2 text-xs text-ink-mid cursor-pointer">
            <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} className="rounded border-stone-300" />
            Show done
          </label>
        </div>

        {loading ? (
          <div className="card p-10 text-center text-ink-muted text-sm !rounded-lg ring-1 ring-stone-200 shadow-none">Loading…</div>
        ) : grouped.length === 0 ? (
          <div className="card p-10 text-center !rounded-lg ring-1 ring-stone-200 shadow-none">
            <div className="text-3xl mb-2">✓</div>
            <p className="text-sm text-ink-mid">No open requests. All clear.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([who, items]) => (
              <div key={who} className="card !rounded-lg ring-1 ring-stone-200 shadow-none overflow-hidden">
                <div className="px-4 py-2 bg-stone-50/60 border-b border-stone-200 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink-strong">{who}</span>
                  <span className="text-[11px] text-ink-muted">{items.length}</span>
                </div>
                <div>
                  {items.map(r => {
                    const st = STATUS_MAP[r.status] || STATUS_MAP.new
                    return (
                      <div key={r.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-stone-100 last:border-0 hover:bg-stone-50/40">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-[14px] ${r.status === 'done' ? 'line-through text-ink-muted' : 'text-ink-strong'}`}>{r.title}</p>
                            {r.priority === 'urgent' && r.status !== 'done' && (
                              <span className="text-[9px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">URGENT</span>
                            )}
                          </div>
                          {r.detail && <p className="text-[12px] text-ink-muted mt-0.5">{r.detail}</p>}
                          <p className="text-[10px] text-ink-muted mt-1">{fmtWhen(r.created_at)}</p>
                        </div>
                        {/* Status pills — click to advance */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {STATUSES.map(s => (
                            <button key={s.key} onClick={() => setStatus(r, s.key)}
                              className={`text-[10px] font-semibold px-2 py-1 rounded transition-all ${
                                r.status === s.key ? s.color : 'text-ink-muted hover:bg-stone-100'}`}>
                              {s.label}
                            </button>
                          ))}
                          <button onClick={() => remove(r)} className="text-ink-muted hover:text-red-600 text-sm ml-1">✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
