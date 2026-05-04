import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

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

function fmt$(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`
  if (n >= 1000)    return `$${(n/1000).toFixed(0)}k`
  return `$${Number(n).toFixed(0)}`
}

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

function StatBox({ label, value, sub, loading }) {
  return (
    <div className="text-center p-3">
      <div className="text-2xl font-bold text-gray-900 tabular-nums leading-none">
        {loading ? '—' : value}
      </div>
      <div className="text-xs font-medium text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
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

export default function SalesActivityReport() {
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
        // Current period
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

        // Previous period for trends
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
          orders:          { count: invoiced.length, value: invoiced.reduce((s,o) => s + Number(o.order_amount||0), 0) },
          pipeline:        { count: pipeline.length, value: pipeline.reduce((s,o) => s + Number(o.order_amount||0), 0) },
          activities:      { count: activities.length, items: activities },
          newCustomers:    newCustomersRes.count || 0,
          followUps:       followUpsRes.count || 0,
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', data.email)
      .single()
    repUserIdCache[rep] = profile?.id || null
    return repUserIdCache[rep]
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Activity Report</h1>
          <p className="text-sm text-gray-500 mt-1">Rep performance for 1:1 reviews</p>
        </div>
        <button onClick={load} disabled={loading}
          className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 font-medium">
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

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

        {/* Date navigation */}
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
          const c   = REP_COLORS[rep]
          const d   = repData[rep]
          const initials = rep.split(' ').map(p=>p[0]).join('')

          return (
            <div key={rep} className={`bg-white border ${c.border} rounded-xl overflow-hidden`}>
              {/* Rep header */}
              <div className={`${c.bg} px-4 py-3 border-b ${c.border} flex items-center gap-3`}>
                <div className={`w-9 h-9 rounded-full ${c.accent} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                  {initials}
                </div>
                <div>
                  <div className={`text-sm font-bold ${c.text}`}>{rep}</div>
                  <div className="text-xs text-gray-500">{range.label}</div>
                </div>
              </div>

              {/* Stats */}
              <div className="divide-y divide-gray-100">

                {/* Orders invoiced */}
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

                {/* Pipeline */}
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

                {/* Activities */}
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

                {/* New customers + follow-ups */}
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
            {/* Totals row */}
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
