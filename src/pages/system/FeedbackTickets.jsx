import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STATUS_STYLES = {
  open:        'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved:    'bg-green-50 text-green-700 border-green-200',
  closed:      'bg-stone-100 text-stone-500 border-stone-200',
}

const PRIORITY_STYLES = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high:   'bg-orange-50 text-orange-700 border-orange-200',
  normal: 'bg-stone-50 text-stone-600 border-stone-200',
  low:    'bg-stone-50 text-stone-400 border-stone-200',
}

const CATEGORY_LABEL = {
  bug:             '🐛 Bug',
  data_issue:      '📊 Data Issue',
  feature_request: '✨ Feature',
  question:        '❓ Question',
  other:           '💬 Other',
}

export default function FeedbackTickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [selected, setSelected] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('feedback_tickets')
      .select('*')
      .order('created_at', { ascending: false })
    setTickets(data || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    setSaving(true)
    const updates = { status, updated_at: new Date().toISOString() }
    if (status === 'resolved' || status === 'closed') {
      updates.resolved_at = new Date().toISOString()
    }
    await supabase.from('feedback_tickets').update(updates).eq('id', id)
    setSaving(false)
    load()
    if (selected?.id === id) {
      setSelected(prev => ({ ...prev, ...updates }))
    }
  }

  async function saveNotes(id) {
    setSaving(true)
    await supabase.from('feedback_tickets').update({
      admin_notes: adminNotes,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setSaving(false)
    load()
    if (selected?.id === id) {
      setSelected(prev => ({ ...prev, admin_notes: adminNotes }))
    }
  }

  function openTicket(t) {
    setSelected(t)
    setAdminNotes(t.admin_notes || '')
  }

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
  const counts = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-stone-800">Feedback Tickets</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          {tickets.length} total · {counts.open || 0} open
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { key: 'open',        label: 'Open' },
          { key: 'in_progress', label: 'In Progress' },
          { key: 'resolved',    label: 'Resolved' },
          { key: 'closed',      label: 'Closed' },
          { key: 'all',         label: 'All' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
              filter === f.key
                ? 'bg-[#5a3a24] text-[#f5e6d0] border-[#5a3a24]'
                : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
            }`}
          >
            {f.label} <span className="ml-1 opacity-60">{f.key === 'all' ? tickets.length : (counts[f.key] || 0)}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Ticket list */}
        <div className="col-span-5">
          {loading ? (
            <div className="card p-8 text-center text-stone-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-stone-400 text-sm">
              No tickets in this status
            </div>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => openTicket(t)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selected?.id === t.id
                      ? 'bg-[#5a3a24]/5 border-[#5a3a24]'
                      : 'bg-white border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{t.subject}</p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {t.user_name || t.user_email || 'Unknown'} · {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLES[t.status]}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-500">{CATEGORY_LABEL[t.category] || t.category}</span>
                    {t.priority !== 'normal' && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${PRIORITY_STYLES[t.priority]}`}>
                        {t.priority}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="col-span-7">
          {!selected ? (
            <div className="card p-12 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-stone-500 font-semibold">Select a ticket to view details</p>
            </div>
          ) : (
            <div className="card p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-stone-100">
                <div className="flex-1">
                  <h2 className="text-lg font-display font-bold text-stone-800">{selected.subject}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-stone-500">{CATEGORY_LABEL[selected.category]}</span>
                    <span className="text-xs text-stone-300">·</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[selected.status]}`}>
                      {selected.status.replace('_', ' ')}
                    </span>
                    {selected.priority !== 'normal' && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${PRIORITY_STYLES[selected.priority]}`}>
                        {selected.priority}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                <div>
                  <p className="text-stone-400 mb-0.5">From</p>
                  <p className="text-stone-700 font-medium">{selected.user_name || '—'}</p>
                  <p className="text-stone-400">{selected.user_email}</p>
                </div>
                <div>
                  <p className="text-stone-400 mb-0.5">Submitted</p>
                  <p className="text-stone-700 font-medium">{new Date(selected.created_at).toLocaleString()}</p>
                </div>
                {selected.page_url && (
                  <div className="col-span-2">
                    <p className="text-stone-400 mb-0.5">Page</p>
                    <p className="text-stone-700 font-mono text-[11px]">{selected.page_url}</p>
                  </div>
                )}
              </div>

              {/* Message */}
              <div className="mb-5">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Message</p>
                <div className="bg-stone-50 rounded-xl p-4 text-sm text-stone-700 whitespace-pre-wrap">
                  {selected.message}
                </div>
              </div>

              {/* Admin notes */}
              <div className="mb-5">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Internal Notes</p>
                <textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  rows={3}
                  className="input w-full text-sm resize-none"
                  placeholder="Notes only you can see..."
                />
                {adminNotes !== (selected.admin_notes || '') && (
                  <button
                    onClick={() => saveNotes(selected.id)}
                    disabled={saving}
                    className="mt-2 text-xs font-semibold text-[#5a3a24] hover:underline"
                  >
                    {saving ? 'Saving...' : 'Save notes'}
                  </button>
                )}
              </div>

              {/* Status actions */}
              <div className="flex items-center gap-2 pt-4 border-t border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mr-2">Set status</p>
                {['open', 'in_progress', 'resolved', 'closed'].map(s => (
                  <button
                    key={s}
                    onClick={() => updateStatus(selected.id, s)}
                    disabled={saving || selected.status === s}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      selected.status === s
                        ? 'bg-[#5a3a24] text-[#f5e6d0] border-[#5a3a24] opacity-50 cursor-default'
                        : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
