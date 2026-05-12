import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../components/AuthProvider'
import { supabase } from '../../lib/supabase'

// =====================================================================
// Sales Activity Report (merged)
//
// Single page combining:
//   • Rep performance (period selector, rep cards, summary table)
//     — visible to everyone
//   • Executive Intelligence — By Rep / Team Pipeline tabs +
//     engagement funnel for aging-quote attention cards
//     — owner + executive only (gated below)
// =====================================================================

const REPS = ['Christian Heffernan', "JT D'Emidio", 'Abigail Davis']

const REP_COLORS = {
  'Christian Heffernan': { bg: 'bg-blue-50', accent: 'bg-blue-600', text: 'text-blue-700', border: 'border-blue-200', light: 'bg-blue-100' },
  "JT D'Emidio":         { bg: 'bg-emerald-50', accent: 'bg-emerald-600', text: 'text-emerald-700', border: 'border-emerald-200', light: 'bg-emerald-100' },
  'Abigail Davis':       { bg: 'bg-purple-50', accent: 'bg-purple-600', text: 'text-purple-700', border: 'border-purple-200', light: 'bg-purple-100' },
}

const PERIODS = [
  { key: 'week',    label: 'Weekly'    },
  { key: 'month',   label: 'Monthly'   },
  { key: 'quarter', label: 'Quarterly' },
]

const ACTIVITY_TYPES = {
  call:     { icon: '📞', label: 'Call'    },
  meeting:  { icon: '🤝', label: 'Meeting' },
  note:     { icon: '📝', label: 'Note'    },
  email:    { icon: '✉️',  label: 'Email'   },
}

const TIER_STYLES = {
  urgent:  { dot: '#c2410c', bg: '#fef3ec', border: '#f7d4b8', label: '⚠️ Urgent'  },
  flagged: { dot: '#a0573a', bg: '#fbf6ee', border: '#ecd9c0', label: '⚠️ Flagged' },
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
  const counts = { call:0, meeting:0, note:0, email:0 }
  activities.forEach(a => { if (counts[a.activity_type] !== undefined) counts[a.activity_type]++ })
  const total = Object.values(counts).reduce((a,b)=>a+b,0)
  if (!total) return <div className="text-xs text-gray-400 text-center py-2">No activities logged</div>

  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {Object.entries(ACTIVITY_TYPES).map(([type, cfg]) => (
        counts[type] > 0 && (
          <div key={type} className="flex items-center gap-1 text-xs text-gray-600">
            <span>{cfg.icon}</span>
            <span className="font-semibold">{counts[type]}</span>
            <span className="text-gray-400">{cfg.label}</span>
          </div>
        )
      ))}
    </div>
  )
}

function TrendBadge({ current, previous }) {
  if (!previous || previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return <span className="text-xs text-gray-400">—</span>
  const up = pct > 0
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
      {up ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}

// =====================================================================
// Main component
// =====================================================================
export default function SalesActivityReport() {
  const { profile } = useAuth()
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
            .in('status', ['invoiced', 'printed', 'credit_ok', 'po_sent', 'quote'])
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

        results[rep] = {
          orders:       { count: invoiced.length, value: invoiced.reduce((s,o) => s + Number(o.order_amount||0), 0) },
          pipeline:     { count: pipeline.length, value: pipeline.reduce((s,o) => s + Number(o.order_amount||0), 0) },
          activities:   { count: activities.length, items: activities },
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

  // Cache for rep user IDs
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
            <h1 className="text-2xl font-bold text-gray-900">Sales Activity Report</h1>
            {isExec && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                Executive View
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">Rep performance for 1:1 reviews</p>
        </div>
        <button onClick={load} disabled={loading}
          className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 font-medium">
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────────────
          EXECUTIVE INTELLIGENCE — owner/executive only
          ──────────────────────────────────────────────────────────── */}
      {isExec && <ExecutiveIntelligence profile={profile} />}

      {/* ────────────────────────────────────────────────────────────────
          REP PERFORMANCE — everyone
          ──────────────────────────────────────────────────────────── */}

      {/* Period selector */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => { setPeriod(p.key); setOffset(0) }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all
                ${period === p.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setOffset(o => o - 1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm">
            ‹
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[140px] text-center">
            {range.label}
          </span>
          <button onClick={() => setOffset(o => Math.min(o + 1, 0))}
            disabled={offset >= 0}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm disabled:opacity-30">
            ›
          </button>
        </div>

        <span className="text-xs text-gray-400">
          {range.startStr} → {range.endStr}
        </span>
      </div>

      {/* Rep cards */}
      <div className="grid grid-cols-3 gap-5 mb-6">
        {REPS.map(rep => {
          const c = REP_COLORS[rep]
          const d = repData[rep]
          const initials = rep.split(' ').map(p=>p[0]).join('')

          return (
            <div key={rep} className={`bg-white border ${c.border} rounded-xl overflow-hidden`}>
              <div className={`${c.bg} px-4 py-3 border-b ${c.border} flex items-center gap-3`}>
                <div className={`w-9 h-9 rounded-full ${c.accent} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                  {initials}
                </div>
                <div>
                  <div className={`text-sm font-bold ${c.text}`}>{rep}</div>
                  <div className="text-xs text-gray-500">{range.label}</div>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoiced</span>
                    <TrendBadge current={d?.orders.count||0} previous={d?.prev.orders||0} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900 tabular-nums">
                      {loading ? '—' : d?.orders.count ?? 0}
                    </span>
                    <span className="text-sm text-gray-500 font-medium">
                      {loading ? '' : fmt$(d?.orders.value)}
                    </span>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pipeline Activity</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900 tabular-nums">
                      {loading ? '—' : d?.pipeline.count ?? 0}
                    </span>
                    <span className="text-sm text-gray-500 font-medium">
                      {loading ? '' : fmt$(d?.pipeline.value)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">quotes, credit ok, po sent, printed</div>
                </div>

                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Activities</span>
                    <TrendBadge current={d?.activities.count||0} previous={d?.prev.activities||0} />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums mb-2">
                    {loading ? '—' : d?.activities.count ?? 0}
                  </div>
                  {!loading && d?.activities.items && (
                    <ActivityBreakdown activities={d.activities.items} />
                  )}
                </div>

                <div className="grid grid-cols-2 divide-x divide-gray-100">
                  <div className="px-4 py-3 text-center">
                    <div className="text-xl font-bold text-gray-900 tabular-nums">
                      {loading ? '—' : d?.newCustomers ?? 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">New Customers</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-xl font-bold text-gray-900 tabular-nums">
                      {loading ? '—' : d?.followUps ?? 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Follow-ups Done</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Team Summary — {range.label}</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Rep</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">Invoiced Orders</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">Invoiced Value</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">Pipeline</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">Activities</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">New Customers</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">Follow-ups</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {REPS.map(rep => {
              const d = repData[rep]
              const c = REP_COLORS[rep]
              return (
                <tr key={rep} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${c.accent}`} />
                      <span className="text-sm font-medium text-gray-900">{rep}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                    {loading ? '—' : d?.orders.count ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                    {loading ? '—' : fmt$(d?.orders.value)}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-gray-600 tabular-nums">
                    {loading ? '—' : `${d?.pipeline.count ?? 0} (${fmt$(d?.pipeline.value)})`}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-gray-600 tabular-nums">
                    {loading ? '—' : d?.activities.count ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-gray-600 tabular-nums">
                    {loading ? '—' : d?.newCustomers ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-gray-600 tabular-nums">
                    {loading ? '—' : d?.followUps ?? 0}
                  </td>
                </tr>
              )
            })}
            {!loading && (
              <tr className="bg-gray-900 text-white">
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
// Executive Intelligence section — merged from old SalesIntelligence
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
    setAllCards(cardsRes.data || [])
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
    return allCards.filter(c => c.rep_name === selectedRep).slice(0, 8)
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
    <section style={{ marginBottom: 32, background: '#faf6ed', border: '1px solid #ecd9c0', borderRadius: 12, overflow: 'hidden' }}>
      {/* Section header — collapsible */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: collapsed ? 'none' : '1px solid #ecd9c0',
        }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#3a2818', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Executive Intelligence
          </span>
          <span style={{ fontSize: 12, color: '#6b5640' }}>
            {loading ? 'Loading…' : `${allCards.length} customers flagged across ${reps.length} reps`}
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#6b5640', transition: 'transform 0.2s', transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>›</span>
      </button>

      {!collapsed && (
        <div style={{ padding: 20 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #ecd9c0', marginBottom: 20 }}>
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

// =====================================================================
// Intelligence subcomponents (from old SalesIntelligence page)
// =====================================================================

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer',
        fontSize: 14, fontWeight: active ? 700 : 500,
        color: active ? '#3a2818' : '#9d8b73',
        borderBottom: active ? '2px solid #3a2818' : '2px solid transparent',
        marginBottom: -1,
      }}>
      {children}
    </button>
  )
}

function ByRepTab({ reps, selectedRep, setSelectedRep, cards, allCardsForRep, navigate, loading }) {
  if (loading) return <div style={{ color: '#9d8b73', fontSize: 13, padding: 16 }}>Loading…</div>
  if (reps.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid #ecd9c0', borderRadius: 12, padding: 24, color: '#6b5640' }}>
        ✓ All caught up — no aging quotes across the team.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#3a2818' }}>View as rep:</label>
        <select
          value={selectedRep || ''}
          onChange={e => setSelectedRep(e.target.value)}
          style={{
            padding: '8px 12px', border: '1px solid #ecd9c0', borderRadius: 8,
            fontSize: 14, background: '#fff', color: '#3a2818', minWidth: 220,
          }}>
          {reps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#9d8b73' }}>
          Showing top 8 of {allCardsForRep} flagged
        </span>
      </div>

      <div style={{
        background: '#fbf6ee', border: '1px solid #ecd9c0', borderRadius: 8,
        padding: '8px 12px', fontSize: 12, color: '#8a7560', marginBottom: 16,
      }}>
        🔍 Viewing as <strong>{selectedRep}</strong>. Engagement events from this view are tracked separately and don't affect rep funnel metrics.
      </div>

      {cards.length === 0 ? (
        <div style={{ color: '#9d8b73', fontSize: 13, padding: 16 }}>
          No flagged cards for this rep right now.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {cards.map(card => {
            const style = TIER_STYLES[card.tier] || TIER_STYLES.flagged
            const lastActivityLabel = card.last_activity_at
              ? `Last activity ${fmtDays(card.days_since_activity)} ago`
              : 'No activity logged yet'
            return (
              <div
                key={card.customer_id}
                onClick={() => navigate(`/customers/${card.customer_id}?tab=quotes`)}
                style={{
                  background: style.bg, border: `1px solid ${style.border}`, borderRadius: 10,
                  padding: 14, cursor: 'pointer',
                }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: style.dot, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {style.label}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#3a2818', marginBottom: 2 }}>
                  {card.account_name}
                </div>
                <div style={{ fontSize: 12, color: '#6b5640', marginBottom: 10 }}>
                  {card.aging_quote_count} {card.aging_quote_count === 1 ? 'quote' : 'quotes'} · {fmtMoney(card.aging_quote_total_value)} · oldest {fmtDays(card.oldest_quote_age_days)}
                </div>
                <div style={{ fontSize: 11, color: '#8a7560', marginBottom: 10, fontStyle: 'italic' }}>
                  {lastActivityLabel}
                </div>
                <div style={{ fontSize: 11, color: '#9d8b73' }}>
                  Score: <strong>{card.attention_score}</strong> · YTD revenue: {fmtMoney(card.ytd_revenue || 0)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PipelineTab({ rows, totals, reps, repFilter, setRepFilter, sortBy, sortDir, toggleSort, navigate, loading }) {
  if (loading) return <div style={{ color: '#9d8b73', fontSize: 13, padding: 16 }}>Loading…</div>
  const arrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#3a2818' }}>Rep:</label>
          <select value={repFilter} onChange={e => setRepFilter(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #ecd9c0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#3a2818' }}>
            <option value="all">All reps</option>
            {reps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12, color: '#6b5640' }}>
          <span><strong style={{ color: '#3a2818' }}>{totals.customers}</strong> customers</span>
          <span><strong style={{ color: '#3a2818' }}>{totals.quotes}</strong> quotes</span>
          <span><strong style={{ color: '#3a2818' }}>{fmtMoney(totals.value)}</strong> at risk</span>
          {totals.urgent > 0 && (
            <span style={{ color: '#c2410c' }}><strong>{totals.urgent}</strong> urgent</span>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #ecd9c0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#fbf6ee', borderBottom: '1px solid #ecd9c0' }}>
            <tr>
              <Th onClick={() => toggleSort('rep_name')}>            Rep{arrow('rep_name')}</Th>
              <Th onClick={() => toggleSort('account_name')}>        Customer{arrow('account_name')}</Th>
              <Th onClick={() => toggleSort('aging_quote_count')} num>Quotes{arrow('aging_quote_count')}</Th>
              <Th onClick={() => toggleSort('aging_quote_total_value')} num>Total Value{arrow('aging_quote_total_value')}</Th>
              <Th onClick={() => toggleSort('oldest_quote_age_days')} num>Oldest{arrow('oldest_quote_age_days')}</Th>
              <Th onClick={() => toggleSort('days_since_activity')} num>Last Activity{arrow('days_since_activity')}</Th>
              <Th onClick={() => toggleSort('ytd_revenue')} num>YTD Rev{arrow('ytd_revenue')}</Th>
              <Th onClick={() => toggleSort('attention_score')} num>Score{arrow('attention_score')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#9d8b73' }}>No customers flagged.</td></tr>
            ) : rows.map(r => (
              <tr key={r.customer_id}
                  onClick={() => navigate(`/customers/${r.customer_id}?tab=quotes`)}
                  style={{ borderBottom: '1px solid #f5ecdf', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fbf6ee' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                <Td>{r.rep_name || <span style={{ color: '#9d8b73' }}>—</span>}</Td>
                <Td bold>{r.account_name}</Td>
                <Td num>{r.aging_quote_count}</Td>
                <Td num>{fmtMoney(r.aging_quote_total_value)}</Td>
                <Td num>{fmtDays(r.oldest_quote_age_days)}</Td>
                <Td num>
                  {r.last_activity_at ? fmtDays(r.days_since_activity) + ' ago' : <span style={{ color: '#c2410c' }}>never</span>}
                </Td>
                <Td num>{fmtMoney(r.ytd_revenue || 0)}</Td>
                <Td num bold>
                  {r.tier === 'urgent' && <span style={{ color: '#c2410c', marginRight: 4 }}>⚠️</span>}
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

function Th({ children, onClick, num }) {
  return (
    <th onClick={onClick} style={{
      padding: '10px 12px', textAlign: num ? 'right' : 'left', fontSize: 11,
      fontWeight: 700, color: '#6b5640', textTransform: 'uppercase', letterSpacing: 0.5,
      cursor: 'pointer', userSelect: 'none',
    }}>
      {children}
    </th>
  )
}

function Td({ children, num, bold }) {
  return (
    <td style={{
      padding: '9px 12px', textAlign: num ? 'right' : 'left',
      fontVariantNumeric: num ? 'tabular-nums' : 'normal',
      color: '#3a2818', fontWeight: bold ? 600 : 400,
    }}>
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
    <section style={{ marginTop: 32, padding: 20, background: '#fff', border: '1px solid #ecd9c0', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#3a2818', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Engagement (last 14 days)
        </h3>
        <span style={{ fontSize: 11, color: '#9d8b73' }}>
          Did the cards drive follow-ups?
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ color: '#9d8b73', fontSize: 13, padding: '8px 0' }}>
          No engagement data yet — give it a week of real use.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <Stat label="Cards Shown"   value={totals.shown}  />
            <Stat label="Click Rate"    value={`${overallClickRate}%`}  caption={`${totals.clicked} clicks`} />
            <Stat label="Action Rate"   value={`${overallActionRate}%`} caption={`${totals.acted} activities logged`} />
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ecd9c0' }}>
                <th style={{ textAlign: 'left',  padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Rep</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Shown</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Clicked</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Acted</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Click %</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Action %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id} style={{ borderBottom: '1px solid #f5ecdf' }}>
                  <td style={{ padding: '8px 6px', color: '#3a2818' }}>{r.rep_name || '—'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#3a2818' }}>{r.shown}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#3a2818' }}>{r.clicked}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#3a2818' }}>{r.acted}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6b5640' }}>{r.click_rate_pct}%</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.action_rate_pct >= 15 ? '#5b8c5a' : r.action_rate_pct >= 5 ? '#a0573a' : '#9d8b73', fontWeight: 600 }}>{r.action_rate_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontSize: 11, color: '#9d8b73', marginTop: 12 }}>
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
    <div style={{ background: '#fbf6ee', border: '1px solid #ecd9c0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b5640', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#3a2818', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: '#9d8b73', marginTop: 2 }}>{caption}</div>
      )}
    </div>
  )
}
