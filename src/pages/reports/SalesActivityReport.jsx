import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../components/AuthProvider'
import { supabase } from '../../lib/supabase'

// =====================================================================
// Sales Activity Report (executive mode)
//
// Rep performance — visible to everyone
// Executive Intelligence section — owner + executive only (gated)
// =====================================================================

const REPS = ['Christian Heffernan', "JT D'Emidio", 'Abigail Davis']

const REP_ACCENT = {
  'Christian Heffernan': 'info',
  "JT D'Emidio":         'healthy',
  'Abigail Davis':       'gold',
}

const REP_ACCENT_HEX = {
  info:    '#4a6b8c',
  healthy: '#5b8c5a',
  gold:    '#d4a574',
  clay:    '#b85d3a',
}

const PERIODS = [
  { key: 'week',    label: 'Weekly'    },
  { key: 'month',   label: 'Monthly'   },
  { key: 'quarter', label: 'Quarterly' },
]

const ACTIVITY_TYPES = {
  scheduled_meeting: { icon: '🤝', label: 'Meeting'    },
  cold_call:         { icon: '📞', label: 'Cold Call'  },
  sample_book:       { icon: '📚', label: 'Sample Book' },
  call:              { icon: '☎️',  label: 'Customer Call' },
  email:             { icon: '✉️',  label: 'Email'      },
  note:              { icon: '📝', label: 'Note'       },
}

const TIER_STYLES = {
  urgent:  { pill: 'pill-critical', label: 'Urgent'  },
  flagged: { pill: 'pill-warning',  label: 'Flagged' },
}

const ALLOWED_INTEL_ROLES = ['owner', 'executive']

function fmt$(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`
  if (n >= 1000)    return `$${(n/1000).toFixed(0)}k`
  return `$${Number(n).toFixed(0)}`
}

const fmtMoney = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
const fmtDays  = (n) => n === 1 ? '1 day' : `${n} days`

function getPeriodRange(period, offset = 0) {
  const now = new Date()
  let start, end, label

  if (period === 'week') {
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + (offset * 7))
    monday.setHours(0,0,0,0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23,59,59,999)
    start = monday
    end   = sunday
    label = offset === 0 ? 'This Week'
          : offset === -1 ? 'Last Week'
          : `Week of ${monday.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`
  } else if (period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    start = new Date(d.getFullYear(), d.getMonth(), 1)
    start.setHours(0,0,0,0)
    end   = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    end.setHours(23,59,59,999)
    label = offset === 0 ? 'This Month'
          : d.toLocaleDateString('en-US',{month:'long',year:'numeric'})
  } else {
    const qMonth = Math.floor((now.getMonth()) / 3) * 3 + (offset * 3)
    const qYear  = now.getFullYear() + Math.floor(qMonth / 12)
    const qStart = ((qMonth % 12) + 12) % 12
    start = new Date(qYear, qStart, 1)
    start.setHours(0,0,0,0)
    end   = new Date(qYear, qStart + 3, 0)
    end.setHours(23,59,59,999)
    const qNum = Math.floor(qStart / 3) + 1
    label = offset === 0 ? `Q${qNum} ${qYear}` : `Q${qNum} ${qYear}`
  }

  return { start, end, label,
    startStr: start.toISOString().slice(0,10),
    endStr:   end.toISOString().slice(0,10) }
}

function ActivityBreakdown({ activities }) {
  const counts = Object.fromEntries(Object.keys(ACTIVITY_TYPES).map(k => [k, 0]))
  activities.forEach(a => { if (counts[a.activity_type] !== undefined) counts[a.activity_type]++ })
  const total = Object.values(counts).reduce((a,b)=>a+b,0)
  if (!total) return <div className="text-xs text-ink-muted text-center py-2">No activities logged</div>

  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {Object.entries(ACTIVITY_TYPES).map(([type, cfg]) => (
        counts[type] > 0 && (
          <div key={type} className="flex items-center gap-1 text-xs text-ink-mid">
            <span>{cfg.icon}</span>
            <span className="font-semibold">{counts[type]}</span>
            <span className="text-ink-muted">{cfg.label}</span>
          </div>
        )
      ))}
    </div>
  )
}

function TrendBadge({ current, previous }) {
  if (!previous || previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return <span className="text-xs text-ink-muted">—</span>
  const up = pct > 0
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
      up ? 'bg-status-healthy-soft text-status-healthy' : 'bg-status-critical-soft text-status-critical'
    }`}>
      {up ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}

// =====================================================================
// Main component
// =====================================================================
export default function SalesActivityReport() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isExec = profile && ALLOWED_INTEL_ROLES.includes(profile.role)

  const [period,  setPeriod]  = useState('week')
  const [offset,  setOffset]  = useState(0)
  const [loading, setLoading] = useState(true)
  const [repData, setRepData] = useState({})

  const range     = getPeriodRange(period, offset)
  const prevRange = getPeriodRange(period, offset - 1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const results = {}
      await Promise.all(REPS.map(async (rep) => {
        const [ordersRes, activitiesRes, newCustomersRes, followUpsRes] = await Promise.all([
          supabase.from('orders')
            .select('order_number, order_amount, status, epic_status_date')
            .eq('sales_rep', rep)
            .in('status', ['invoiced', 'printed', 'credit_ok', 'po_sent', 'in_production'])
            .gte('epic_status_date', range.startStr)
            .lte('epic_status_date', range.endStr),

          supabase.from('activities')
            .select('id, activity_type, completed, follow_up_date')
            .eq('user_id', await getRepUserId(rep))
            .gte('activity_date', range.startStr)
            .lte('activity_date', range.endStr),

          supabase.from('customers')
            .select('id', { count: 'exact', head: true })
            .eq('sales_rep', rep)
            .gte('created_at', range.start.toISOString())
            .lte('created_at', range.end.toISOString()),

          supabase.from('activities')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', await getRepUserId(rep))
            .eq('completed', true)
            .gte('updated_at', range.start.toISOString())
            .lte('updated_at', range.end.toISOString()),
        ])

        const [prevOrdersRes, prevActivitiesRes] = await Promise.all([
          supabase.from('orders')
            .select('order_amount', { count: 'exact' })
            .eq('sales_rep', rep)
            .in('status', ['invoiced'])
            .gte('epic_status_date', prevRange.startStr)
            .lte('epic_status_date', prevRange.endStr),

          supabase.from('activities')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', await getRepUserId(rep))
            .gte('activity_date', prevRange.startStr)
            .lte('activity_date', prevRange.endStr),
        ])

        const orders      = ordersRes.data || []
        const activities  = activitiesRes.data || []
        const invoiced    = orders.filter(o => o.status === 'invoiced')
        const pipeline    = orders.filter(o => o.status !== 'invoiced')

        // KPI breakdowns from activity types
        const scheduledMeetings = activities.filter(a => a.activity_type === 'scheduled_meeting').length
        const coldCalls         = activities.filter(a => a.activity_type === 'cold_call').length
        const sampleBooks       = activities.filter(a => a.activity_type === 'sample_book').length

        // Total activities = all logged activities + completed follow-ups
        const totalActivities = activities.length + (followUpsRes.count || 0)

        results[rep] = {
          orders:       { count: invoiced.length, value: invoiced.reduce((s,o) => s + Number(o.order_amount||0), 0) },
          pipeline:     { count: pipeline.length, value: pipeline.reduce((s,o) => s + Number(o.order_amount||0), 0) },
          activities:   { count: activities.length, items: activities },
          totalActivities,
          scheduledMeetings,
          coldCalls,
          sampleBooks,
          newCustomers: newCustomersRes.count || 0,
          followUps:    followUpsRes.count || 0,
          prev: {
            orders:     prevOrdersRes.count || 0,
            activities: prevActivitiesRes.count || 0,
          }
        }
      }))
      setRepData(results)
    } catch (err) {
      console.error('SalesReport error:', err)
    } finally {
      setLoading(false)
    }
  }, [period, offset])

  useEffect(() => { load() }, [load])

  const repUserIdCache = {}
  async function getRepUserId(rep) {
    if (repUserIdCache[rep]) return repUserIdCache[rep]
    const { data } = await supabase
      .from('rep_email_map')
      .select('email')
      .eq('rep_name', rep)
      .single()
    if (!data) return null
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', data.email)
      .single()
    repUserIdCache[rep] = profileRow?.id || null
    return repUserIdCache[rep]
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1>Sales Activity Report</h1>
            {isExec && (
              <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 bg-accent-gold-soft text-accent-clay rounded-full border border-accent-gold/30">
                Executive View
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted mt-1">Rep performance for 1:1 reviews</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost text-xs">
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Executive Intelligence — owner/executive only */}
      {isExec && <ExecutiveIntelligence profile={profile} />}

      {/* Period selector */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex bg-surface-page/60 rounded-lg p-0.5 border border-surface-border">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => { setPeriod(p.key); setOffset(0) }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                ${period === p.key ? 'bg-surface-card text-ink-strong shadow-sm' : 'text-ink-mid hover:text-ink-strong'}`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setOffset(o => o - 1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-surface-border hover:bg-surface-page/40 text-ink-mid text-sm">
            ‹
          </button>
          <span className="text-sm font-semibold text-ink-strong min-w-[140px] text-center">
            {range.label}
          </span>
          <button onClick={() => setOffset(o => Math.min(o + 1, 0))}
            disabled={offset >= 0}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-surface-border hover:bg-surface-page/40 text-ink-mid text-sm disabled:opacity-30">
            ›
          </button>
        </div>

        <span className="text-xs text-ink-muted">
          {range.startStr} → {range.endStr}
        </span>
      </div>

      {/* Rep cards */}
      <div className="grid grid-cols-3 gap-5 mb-6">
        {REPS.map(rep => {
          const accentKey = REP_ACCENT[rep] || 'info'
          const accentHex = REP_ACCENT_HEX[accentKey]
          const d = repData[rep]
          const initials = rep.split(' ').map(p=>p[0]).join('')

          return (
            <div key={rep} className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border flex items-center gap-3"
                   style={{ background: `${accentHex}12` }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-ink-inverse"
                     style={{ background: accentHex }}>
                  {initials}
                </div>
                <div>
                  <div className="text-sm font-bold text-ink-strong">{rep}</div>
                  <div className="text-xs text-ink-muted">{range.label}</div>
                </div>
              </div>

              <div className="divide-y divide-surface-border-soft">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Invoiced</span>
                    <TrendBadge current={d?.orders.count||0} previous={d?.prev.orders||0} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-ink-strong tabular-nums">
                      {loading ? '—' : d?.orders.count ?? 0}
                    </span>
                    <span className="text-sm text-ink-mid font-medium">
                      {loading ? '' : fmt$(d?.orders.value)}
                    </span>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <div className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Pipeline Activity</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-ink-strong tabular-nums">
                      {loading ? '—' : d?.pipeline.count ?? 0}
                    </span>
                    <span className="text-sm text-ink-mid font-medium">
                      {loading ? '' : fmt$(d?.pipeline.value)}
                    </span>
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">credit ok, po sent, printed, in production</div>
                </div>

                <div className="px-4 py-3 cursor-pointer hover:bg-surface-page/40 transition-colors"
                     onClick={() => navigate(`/activities?rep=${encodeURIComponent(rep)}&period=${period}`)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Total Activities</span>
                    <span className="text-xs text-accent-clay font-medium">View →</span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-2xl font-bold text-ink-strong tabular-nums">
                      {loading ? '—' : d?.totalActivities ?? 0}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {!loading && d?.followUps > 0 && `incl. ${d.followUps} follow-ups`}
                    </span>
                  </div>
                  {!loading && d?.activities.items && (
                    <ActivityBreakdown activities={d.activities.items} />
                  )}
                </div>

                {/* Bottom KPI strip — 4 tiles */}
                <div className="grid grid-cols-4 divide-x divide-surface-border-soft">
                  <div className="px-3 py-3 text-center">
                    <div className="text-lg font-bold text-ink-strong tabular-nums">
                      {loading ? '—' : d?.scheduledMeetings ?? 0}
                    </div>
                    <div className="text-[10px] text-ink-muted mt-0.5 leading-tight">Meetings</div>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <div className="text-lg font-bold text-ink-strong tabular-nums">
                      {loading ? '—' : d?.coldCalls ?? 0}
                    </div>
                    <div className="text-[10px] text-ink-muted mt-0.5 leading-tight">Cold Calls</div>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <div className="text-lg font-bold text-ink-strong tabular-nums">
                      {loading ? '—' : d?.sampleBooks ?? 0}
                    </div>
                    <div className="text-[10px] text-ink-muted mt-0.5 leading-tight">Sample Books</div>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <div className="text-lg font-bold text-ink-strong tabular-nums">
                      {loading ? '—' : d?.newCustomers ?? 0}
                    </div>
                    <div className="text-[10px] text-ink-muted mt-0.5 leading-tight">New Customers</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-ink-strong" style={{ fontFamily: 'Inter' }}>Team Summary — {range.label}</h2>
        </div>
        <table className="w-full">
          <thead className="bg-surface-page/40 border-b border-surface-border">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wider">Rep</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-ink-muted uppercase tracking-wider">Invoiced Orders</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-ink-muted uppercase tracking-wider">Invoiced Value</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-ink-muted uppercase tracking-wider">Pipeline</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-ink-muted uppercase tracking-wider">Activities</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-ink-muted uppercase tracking-wider">New Customers</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-ink-muted uppercase tracking-wider">Follow-ups</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border-soft">
            {REPS.map(rep => {
              const d = repData[rep]
              const accentHex = REP_ACCENT_HEX[REP_ACCENT[rep] || 'info']
              return (
                <tr key={rep} className="hover:bg-surface-page/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: accentHex }} />
                      <span className="text-sm font-medium text-ink-strong">{rep}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-ink-strong tabular-nums">
                    {loading ? '—' : d?.orders.count ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-ink-strong tabular-nums">
                    {loading ? '—' : fmt$(d?.orders.value)}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-ink-mid tabular-nums">
                    {loading ? '—' : `${d?.pipeline.count ?? 0} (${fmt$(d?.pipeline.value)})`}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-ink-mid tabular-nums">
                    {loading ? '—' : d?.activities.count ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-ink-mid tabular-nums">
                    {loading ? '—' : d?.newCustomers ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-ink-mid tabular-nums">
                    {loading ? '—' : d?.followUps ?? 0}
                  </td>
                </tr>
              )
            })}
            {!loading && (
              <tr className="bg-ink-strong text-ink-inverse">
                <td className="px-5 py-3 text-sm font-bold">Total</td>
                <td className="px-5 py-3 text-right text-sm font-bold tabular-nums">
                  {REPS.reduce((s,r) => s + (repData[r]?.orders.count||0), 0)}
                </td>
                <td className="px-5 py-3 text-right text-sm font-bold tabular-nums">
                  {fmt$(REPS.reduce((s,r) => s + (repData[r]?.orders.value||0), 0))}
                </td>
                <td className="px-5 py-3 text-right text-sm font-bold tabular-nums">
                  {REPS.reduce((s,r) => s + (repData[r]?.pipeline.count||0), 0)} orders
                </td>
                <td className="px-5 py-3 text-right text-sm font-bold tabular-nums">
                  {REPS.reduce((s,r) => s + (repData[r]?.activities.count||0), 0)}
                </td>
                <td className="px-5 py-3 text-right text-sm font-bold tabular-nums">
                  {REPS.reduce((s,r) => s + (repData[r]?.newCustomers||0), 0)}
                </td>
                <td className="px-5 py-3 text-right text-sm font-bold tabular-nums">
                  {REPS.reduce((s,r) => s + (repData[r]?.followUps||0), 0)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =====================================================================
// Executive Intelligence section
// =====================================================================
function ExecutiveIntelligence({ profile }) {
  const navigate = useNavigate()
  const [tab, setTab]                 = useState('by_rep')
  const [allCards, setAllCards]       = useState([])
  const [engagement, setEngagement]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedRep, setSelectedRep] = useState(null)
  const [sortBy, setSortBy]           = useState('attention_score')
  const [sortDir, setSortDir]         = useState('desc')
  const [pipelineRepFilter, setPipelineRepFilter] = useState('all')
  const [collapsed, setCollapsed]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [cardsRes, engRes] = await Promise.all([
      supabase.from('v_rep_attention_quotes').select('*').order('attention_score', { ascending: false }),
      supabase.from('v_attention_engagement').select('*'),
    ])
    // Filter to recent quotes only — customer must have at least one quote within the last 30 days.
    // Using oldest_quote_age_days as the gate: if even the oldest is <= 30, all quotes are recent.
    // Customers with stale quotes (> 30 days) drop out of the worklist entirely.
    const recent = (cardsRes.data || []).filter(c => (c.oldest_quote_age_days ?? 999) <= 30)
    setAllCards(recent)
    setEngagement(engRes.data || [])
    setLoading(false)
  }

  const reps = useMemo(() => {
    const set = new Set()
    allCards.forEach(c => c.rep_name && set.add(c.rep_name))
    return Array.from(set).sort()
  }, [allCards])

  useEffect(() => {
    if (tab === 'by_rep' && !selectedRep && reps.length > 0) {
      setSelectedRep(reps[0])
    }
  }, [tab, reps, selectedRep])

  const cardsForSelectedRep = useMemo(() => {
    if (!selectedRep) return []
    // Show all flagged customers for the rep — no top-N cap. The list view handles density.
    // Already sorted by attention_score desc at the data layer.
    return allCards.filter(c => c.rep_name === selectedRep)
  }, [allCards, selectedRep])

  useEffect(() => {
    if (tab !== 'by_rep' || !selectedRep || cardsForSelectedRep.length === 0 || !profile?.id) return
    logExecView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRep, cardsForSelectedRep.length])

  async function logExecView() {
    const rows = cardsForSelectedRep.map((card, idx) => ({
      event_type:      'exec_view',
      user_id:         profile.id,
      customer_id:     card.customer_id,
      viewed_rep_name: selectedRep,
      quote_ids:       card.quote_nos || [],
      card_metadata: {
        rank:               idx + 1,
        attention_score:    card.attention_score,
        aging_quote_count:  card.aging_quote_count,
        total_value:        card.aging_quote_total_value,
        days_since_activity: card.days_since_activity,
        tier:               card.tier,
      },
    }))
    await supabase.from('attention_events').insert(rows)
  }

  const pipelineRows = useMemo(() => {
    let rows = allCards
    if (pipelineRepFilter !== 'all') {
      rows = rows.filter(c => c.rep_name === pipelineRepFilter)
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortBy] ?? 0
      const bv = b[sortBy] ?? 0
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return rows
  }, [allCards, pipelineRepFilter, sortBy, sortDir])

  const pipelineTotals = useMemo(() => ({
    customers: pipelineRows.length,
    quotes:    pipelineRows.reduce((s, r) => s + (r.aging_quote_count || 0), 0),
    value:     pipelineRows.reduce((s, r) => s + Number(r.aging_quote_total_value || 0), 0),
    urgent:    pipelineRows.filter(r => r.tier === 'urgent').length,
  }), [pipelineRows])

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  return (
    <section className="card-priority mb-8 overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-surface-page/30 transition-colors"
      >
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold text-ink-strong uppercase tracking-widest">
            Executive Intelligence
          </span>
          <span className="text-xs text-ink-mid">
            {loading ? 'Loading…' : `${allCards.length} customers flagged across ${reps.length} reps · quotes within 30 days`}
          </span>
        </div>
        <span className={`text-xs text-ink-muted transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}>›</span>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 border-t border-surface-border">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-surface-border mb-5 mt-2">
            <TabButton active={tab === 'by_rep'}   onClick={() => setTab('by_rep')}>By Rep</TabButton>
            <TabButton active={tab === 'pipeline'} onClick={() => setTab('pipeline')}>Team Pipeline</TabButton>
          </div>

          {tab === 'by_rep' ? (
            <ByRepTab
              reps={reps}
              selectedRep={selectedRep}
              setSelectedRep={setSelectedRep}
              cards={cardsForSelectedRep}
              allCardsForRep={allCards.filter(c => c.rep_name === selectedRep).length}
              navigate={navigate}
              loading={loading}
            />
          ) : (
            <PipelineTab
              rows={pipelineRows}
              totals={pipelineTotals}
              reps={reps}
              repFilter={pipelineRepFilter}
              setRepFilter={setPipelineRepFilter}
              sortBy={sortBy}
              sortDir={sortDir}
              toggleSort={toggleSort}
              navigate={navigate}
              loading={loading}
            />
          )}

          <EngagementPanel rows={engagement} loading={loading} />
        </div>
      )}
    </section>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm transition-colors -mb-px border-b-2 ${
        active
          ? 'text-ink-strong border-ink-strong font-semibold'
          : 'text-ink-muted border-transparent hover:text-ink-mid'
      }`}>
      {children}
    </button>
  )
}

function ByRepTab({ reps, selectedRep, setSelectedRep, cards, allCardsForRep, navigate, loading }) {
  const [search, setSearch] = useState('')

  if (loading) return <div className="text-ink-muted text-sm p-4">Loading…</div>
  if (reps.length === 0) {
    return (
      <div className="card p-6 text-ink-mid">
        ✓ All caught up — no aging quotes across the team within the last 30 days.
      </div>
    )
  }

  // Filter by customer name (client-side)
  const q = search.trim().toLowerCase()
  const filteredCards = q
    ? cards.filter(c => (c.account_name || '').toLowerCase().includes(q))
    : cards

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label className="text-sm font-semibold text-ink-strong">View as rep:</label>
        <select
          value={selectedRep || ''}
          onChange={e => setSelectedRep(e.target.value)}
          className="input max-w-xs"
        >
          {reps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customers..."
          className="input flex-1 max-w-xs"
        />
        <span className="text-xs text-ink-muted ml-auto">
          {q
            ? `Showing ${filteredCards.length} of ${cards.length} flagged`
            : `${cards.length} flagged · quotes within 30 days`}
        </span>
      </div>

      <div className="bg-surface-page/40 border border-surface-border rounded-lg px-3 py-2 text-xs text-ink-mid mb-4">
        🔍 Viewing as <strong className="text-ink-strong">{selectedRep}</strong>. Engagement events from this view are tracked separately and don't affect rep funnel metrics.
      </div>

      {filteredCards.length === 0 ? (
        <div className="text-ink-muted text-sm p-4">
          {q ? 'No customers match the search.' : 'No flagged cards for this rep within the last 30 days.'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-border" style={{ background: 'rgba(141,123,104,0.06)' }}>
              <tr>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider w-24">Tier</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Customer</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Quotes</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Total Value</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Oldest</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Last Activity</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">YTD Revenue</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Score</th>
              </tr>
            </thead>
            <tbody>
              {filteredCards.map(card => {
                const style = TIER_STYLES[card.tier] || TIER_STYLES.flagged
                return (
                  <tr
                    key={card.customer_id}
                    onClick={() => navigate(`/customers/${card.customer_id}?tab=quotes`)}
                    className="border-b border-surface-border-soft hover:bg-black/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <span className={style.pill}>{style.label}</span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink-strong">
                      {card.account_name}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-mid">{card.aging_quote_count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-mid">{fmtMoney(card.aging_quote_total_value)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-mid">{fmtDays(card.oldest_quote_age_days)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted italic">
                      {card.last_activity_at ? `${fmtDays(card.days_since_activity)} ago` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-mid">{fmtMoney(card.ytd_revenue || 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-ink-strong">{card.attention_score}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PipelineTab({ rows, totals, reps, repFilter, setRepFilter, sortBy, sortDir, toggleSort, navigate, loading }) {
  if (loading) return <div className="text-ink-muted text-sm p-4">Loading…</div>
  const arrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-ink-strong">Rep:</label>
          <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="input max-w-xs">
            <option value="all">All reps</option>
            {reps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="ml-auto flex gap-4 text-xs text-ink-mid">
          <span><strong className="text-ink-strong">{totals.customers}</strong> customers</span>
          <span><strong className="text-ink-strong">{totals.quotes}</strong> quotes</span>
          <span><strong className="text-ink-strong">{fmtMoney(totals.value)}</strong> at risk</span>
          {totals.urgent > 0 && (
            <span className="text-status-critical"><strong>{totals.urgent}</strong> urgent</span>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-page/40 border-b border-surface-border">
            <tr>
              <ThPipe onClick={() => toggleSort('rep_name')}>            Rep{arrow('rep_name')}</ThPipe>
              <ThPipe onClick={() => toggleSort('account_name')}>        Customer{arrow('account_name')}</ThPipe>
              <ThPipe onClick={() => toggleSort('aging_quote_count')} num>Quotes{arrow('aging_quote_count')}</ThPipe>
              <ThPipe onClick={() => toggleSort('aging_quote_total_value')} num>Total Value{arrow('aging_quote_total_value')}</ThPipe>
              <ThPipe onClick={() => toggleSort('oldest_quote_age_days')} num>Oldest{arrow('oldest_quote_age_days')}</ThPipe>
              <ThPipe onClick={() => toggleSort('days_since_activity')} num>Last Activity{arrow('days_since_activity')}</ThPipe>
              <ThPipe onClick={() => toggleSort('ytd_revenue')} num>YTD Rev{arrow('ytd_revenue')}</ThPipe>
              <ThPipe onClick={() => toggleSort('attention_score')} num>Score{arrow('attention_score')}</ThPipe>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-ink-muted">No customers flagged.</td></tr>
            ) : rows.map(r => (
              <tr key={r.customer_id}
                  onClick={() => navigate(`/customers/${r.customer_id}?tab=quotes`)}
                  className="border-b border-surface-border-soft hover:bg-surface-page/40 cursor-pointer">
                <Td>{r.rep_name || <span className="text-ink-muted">—</span>}</Td>
                <Td bold>{r.account_name}</Td>
                <Td num>{r.aging_quote_count}</Td>
                <Td num>{fmtMoney(r.aging_quote_total_value)}</Td>
                <Td num>{fmtDays(r.oldest_quote_age_days)}</Td>
                <Td num>
                  {r.last_activity_at ? fmtDays(r.days_since_activity) + ' ago' : <span className="text-status-critical">never</span>}
                </Td>
                <Td num>{fmtMoney(r.ytd_revenue || 0)}</Td>
                <Td num bold>
                  {r.tier === 'urgent' && <span className="text-status-critical mr-1">⚠</span>}
                  {r.attention_score}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ThPipe({ children, onClick, num }) {
  return (
    <th onClick={onClick} className={`${num ? 'text-right' : 'text-left'} px-3 py-2.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider cursor-pointer select-none`}>
      {children}
    </th>
  )
}

function Td({ children, num, bold }) {
  return (
    <td className={`${num ? 'text-right tabular-nums' : ''} px-3 py-2.5 text-sm ${bold ? 'font-semibold text-ink-strong' : 'text-ink-mid'}`}>
      {children}
    </td>
  )
}

function EngagementPanel({ rows, loading }) {
  if (loading) return null

  const totals = rows.reduce(
    (acc, r) => ({
      shown:   acc.shown + (r.shown || 0),
      clicked: acc.clicked + (r.clicked || 0),
      acted:   acc.acted + (r.acted || 0),
    }),
    { shown: 0, clicked: 0, acted: 0 }
  )

  const overallClickRate  = totals.shown > 0 ? Math.round(100 * totals.clicked / totals.shown) : 0
  const overallActionRate = totals.shown > 0 ? Math.round(100 * totals.acted / totals.shown)   : 0

  return (
    <section className="mt-8 card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-bold text-ink-strong uppercase tracking-widest">
          Engagement (last 14 days)
        </h3>
        <span className="text-xs text-ink-muted">Did the cards drive follow-ups?</span>
      </div>

      {rows.length === 0 ? (
        <div className="text-ink-muted text-sm">
          No engagement data yet — give it a week of real use.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Cards Shown"   value={totals.shown}  />
            <Stat label="Click Rate"    value={`${overallClickRate}%`}  caption={`${totals.clicked} clicks`} />
            <Stat label="Action Rate"   value={`${overallActionRate}%`} caption={`${totals.acted} activities logged`} />
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left  py-2 px-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Rep</th>
                <th className="text-right py-2 px-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Shown</th>
                <th className="text-right py-2 px-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Clicked</th>
                <th className="text-right py-2 px-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Acted</th>
                <th className="text-right py-2 px-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Click %</th>
                <th className="text-right py-2 px-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Action %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id} className="border-b border-surface-border-soft">
                  <td className="py-2 px-2 text-ink-strong">{r.rep_name || '—'}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-ink-strong">{r.shown}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-ink-strong">{r.clicked}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-ink-strong">{r.acted}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-ink-mid">{r.click_rate_pct}%</td>
                  <td className={`py-2 px-2 text-right tabular-nums font-semibold ${
                    r.action_rate_pct >= 15 ? 'text-status-healthy' :
                    r.action_rate_pct >= 5  ? 'text-status-warning' : 'text-ink-muted'
                  }`}>{r.action_rate_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-[11px] text-ink-muted mt-3">
            Action rate ≥15% across reps means the cards are driving real follow-ups.
            Below 5% suggests the scoring needs tuning or reps aren't engaging.
          </p>
        </>
      )}
    </section>
  )
}

function Stat({ label, value, caption }) {
  return (
    <div className="card-soft p-3.5">
      <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest">
        {label}
      </div>
      <div className="text-2xl font-bold text-ink-strong mt-1 tabular-nums">
        {value}
      </div>
      {caption && (
        <div className="text-[11px] text-ink-muted mt-0.5">{caption}</div>
      )}
    </div>
  )
}
