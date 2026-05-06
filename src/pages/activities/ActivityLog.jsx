import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'
import ActivityForm from './ActivityForm'

const TYPE_STYLES = {
  call:              { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   icon: '☎️', label: 'Other Call' },
  cold_call:         { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   icon: '📞', label: 'Cold Call' },
  email:             { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  icon: '✉️', label: 'Email' },
  note:              { bg: 'bg-stone-50',  text: 'text-stone-600',  border: 'border-stone-200',  icon: '📝', label: 'Note' },
  scheduled_meeting: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: '🤝', label: 'Scheduled Meeting' },
  meeting:           { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: '🤝', label: 'Meeting' },
  sample_book:       { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  icon: '📚', label: 'Sample Book' },
}

function startOfWeek() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
  return d.toISOString()
}

// Compute period boundaries for scorecard time filter
function periodRange(period) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Monday-based week (matches startOfWeek above)
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1

  if (period === 'this_week') {
    const start = new Date(today)
    start.setDate(today.getDate() - dayOfWeek)
    return { start, end: null, label: 'This week' }
  }
  if (period === 'last_week') {
    const start = new Date(today)
    start.setDate(today.getDate() - dayOfWeek - 7)
    const end = new Date(today)
    end.setDate(today.getDate() - dayOfWeek)
    return { start, end, label: 'Last week' }
  }
  if (period === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start, end: null, label: 'This month' }
  }
  // default: this_week
  const start = new Date(today)
  start.setDate(today.getDate() - dayOfWeek)
  return { start, end: null, label: 'This week' }
}

// Pro-rate goals based on period (weekly goals × number of weeks in period)
function periodGoalMultiplier(period) {
  if (period === 'this_month') {
    // Approximate: 4.3 weeks per month
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return daysInMonth / 7
  }
  return 1 // weekly views are 1x
}

// Team scorecard — table of reps × KPIs
function TeamScorecard({ rows, goals, multiplier, loading, period, onCellClick, onPeriodChange }) {
  const periods = [
    { key: 'this_week',  label: 'This Week' },
    { key: 'last_week',  label: 'Last Week' },
    { key: 'this_month', label: 'This Month' },
  ]

  function cellColor(value, goal) {
    if (!goal || goal <= 0) return 'text-stone-700'
    const pct = (value / goal) * 100
    if (pct >= 100) return 'text-emerald-600 font-semibold'
    if (pct >= 50)  return 'text-amber-600 font-semibold'
    return 'text-red-500 font-semibold'
  }

  return (
    <div className="card mb-6 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-stone-100">
        <div>
          <div className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase">Team Scorecard</div>
          <div className="text-sm text-stone-500 mt-0.5">{periodRange(period).label}{multiplier !== 1 ? ` (goals scaled ${multiplier.toFixed(1)}×)` : ''}</div>
        </div>
        <div className="flex gap-1">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => onPeriodChange(p.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                period === p.key
                  ? 'bg-brand-dark text-white border-brand-dark'
                  : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-stone-400">Loading scorecard...</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-stone-400">No active reps to show.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wider">Rep</th>
              <th className="text-center px-3 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wider">🤝 Meetings</th>
              <th className="text-center px-3 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wider">👤 New Accts</th>
              <th className="text-center px-3 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wider">📚 Sample Books</th>
              <th className="text-center px-3 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wider">📞 Cold Calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const meetingGoal = Math.round((goals.scheduled_meetings || 0) * multiplier)
              const accountGoal = Math.round((goals.new_accounts || 0) * multiplier)
              const sampleGoal  = Math.round((goals.sample_books || 0) * multiplier)
              return (
                <tr key={row.rep_id} className="border-t border-stone-50 hover:bg-stone-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-stone-800">{row.full_name || row.email}</td>
                  <td onClick={() => onCellClick(row.rep_id, 'scheduled_meeting')}
                      className={`text-center px-3 py-3 cursor-pointer hover:bg-stone-100 ${cellColor(row.scheduled_meetings, meetingGoal)}`}>
                    {row.scheduled_meetings} <span className="text-stone-300 font-normal">/ {meetingGoal}</span>
                  </td>
                  <td className={`text-center px-3 py-3 ${cellColor(row.new_accounts, accountGoal)}`}>
                    {row.new_accounts} <span className="text-stone-300 font-normal">/ {accountGoal}</span>
                  </td>
                  <td onClick={() => onCellClick(row.rep_id, 'sample_book')}
                      className={`text-center px-3 py-3 cursor-pointer hover:bg-stone-100 ${cellColor(row.sample_books, sampleGoal)}`}>
                    {row.sample_books} <span className="text-stone-300 font-normal">/ {sampleGoal}</span>
                  </td>
                  <td onClick={() => onCellClick(row.rep_id, 'cold_call')}
                      className="text-center px-3 py-3 cursor-pointer hover:bg-stone-100 text-stone-700">
                    {row.cold_calls}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="text-[10px] text-stone-400 px-4 py-2 bg-stone-50 border-t border-stone-100">
        Click any cell to filter the activity feed below
      </div>
    </div>
  )
}


  const pct      = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 100
  const onTrack  = target === 0 || actual >= target
  const behind   = target > 0 && actual >= target * 0.5 && actual < target
  const critical = target > 0 && actual < target * 0.5

  const valueColor = onTrack ? 'text-emerald-600' : behind ? 'text-amber-500' : 'text-red-500'
  const barColor   = onTrack ? '#10b981'           : behind ? '#f59e0b'        : '#ef4444'
  const bgColor    = onTrack ? 'bg-emerald-50'     : behind ? 'bg-amber-50'   : 'bg-red-50'
  const borderColor= onTrack ? 'border-emerald-100': behind ? 'border-amber-100' : 'border-red-100'

  return (
    <div className={`${bgColor} border ${borderColor} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{icon}</span>
          <span className="text-xs font-semibold text-stone-600">{label}</span>
        </div>
        <div className={`text-lg font-display font-bold ${valueColor}`}>
          {loading ? '—' : actual}
          {target > 0 && <span className="text-xs font-normal text-stone-400 ml-0.5">/{target}</span>}
        </div>
      </div>
      {target > 0 && (
        <div className="h-1.5 bg-white/60 rounded-full">
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      )}
      {target === 0 && (
        <div className="text-xs text-stone-400 mt-1">this week</div>
      )}
    </div>
  )
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 60)  return mins + 'm ago'
  if (hrs < 24)   return hrs + 'h ago'
  if (days < 7)   return days + 'd ago'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ActivityLog() {
  const navigate    = useNavigate()
  const { profile } = useAuth()
  const isSales     = profile?.role === 'sales'
  const repId       = profile?.rep_id

  const [activities,  setActivities]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [kpiLoading,  setKpiLoading]  = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [filter,      setFilter]      = useState('all')
  const [search,      setSearch]      = useState('')
  const [repFilter,   setRepFilter]   = useState('all')
  const [reps,        setReps]        = useState([])
  const [kpis,        setKpis]        = useState({ scheduled_meetings: 0, sample_books: 0, new_accounts: 0, cold_calls: 0 })
  const [goals,       setGoals]       = useState({ scheduled_meetings: 15, sample_books: 3, new_accounts: 2, cold_calls: 0 })
  // Team scorecard (execs only)
  const [period,      setPeriod]      = useState('this_week')
  const [teamRows,    setTeamRows]    = useState([])
  const [teamLoading, setTeamLoading] = useState(false)

  useEffect(() => { fetchActivities() }, [filter, repFilter, period, profile])

  useEffect(() => {
    if (isSales && repId) fetchKpis()
    // Load rep list for non-sales users (so execs can filter)
    if (profile && !isSales) loadReps()
  }, [isSales, repId, profile])

  // Reload team scorecard when period changes (or when reps list loads)
  useEffect(() => {
    if (!isSales && reps.length > 0) loadTeamScorecard()
  }, [period, reps, isSales])

  async function loadTeamScorecard() {
    setTeamLoading(true)
    try {
      const range = periodRange(period)
      const startISO = range.start.toISOString()
      const endISO = range.end ? range.end.toISOString() : null
      const startDate = startISO.slice(0, 10)
      const endDate   = endISO ? endISO.slice(0, 10) : null

      // Pull goals fresh too
      const { data: goalsData } = await supabase.from('weekly_goals').select('metric_key, target_value')
      const goalMap = { scheduled_meetings: 15, sample_books: 3, new_accounts: 2, cold_calls: 0 }
      ;(goalsData || []).forEach(g => { goalMap[g.metric_key] = g.target_value })
      setGoals(goalMap)

      // Activities for all reps in this period
      let actsQuery = supabase.from('activities')
        .select('user_id, activity_type')
        .gte('activity_date', startDate)
      if (endDate) actsQuery = actsQuery.lt('activity_date', endDate)
      const { data: acts } = await actsQuery

      // Customers created in this period (by sales_rep name)
      // sales_rep field stores the rep's name string — we'll match against profiles.full_name
      let custQuery = supabase.from('customers').select('sales_rep').gte('created_at', startISO)
      if (endISO) custQuery = custQuery.lt('created_at', endISO)
      const { data: custs } = await custQuery

      // Aggregate per rep
      const repsForScorecard = reps.filter(r => ['sales', 'admin', 'owner'].includes(r.role))
      const rows = repsForScorecard.map(r => {
        const userActs = (acts || []).filter(a => a.user_id === r.id)
        const newAccountsCount = (custs || []).filter(c => c.sales_rep === r.full_name).length
        return {
          rep_id: r.id,
          full_name: r.full_name,
          email: r.email,
          scheduled_meetings: userActs.filter(a => a.activity_type === 'scheduled_meeting').length,
          cold_calls:         userActs.filter(a => a.activity_type === 'cold_call').length,
          sample_books:       userActs.filter(a => a.activity_type === 'sample_book').length,
          new_accounts:       newAccountsCount,
        }
      })
      // Sort by total activity descending so most active reps surface first
      rows.sort((a, b) => {
        const aTotal = a.scheduled_meetings + a.cold_calls + a.sample_books + a.new_accounts
        const bTotal = b.scheduled_meetings + b.cold_calls + b.sample_books + b.new_accounts
        return bTotal - aTotal
      })
      setTeamRows(rows)
    } catch (err) {
      console.error('Team scorecard error:', err)
    } finally {
      setTeamLoading(false)
    }
  }

  // Click handler for scorecard cells — filters the feed below
  function handleCellClick(repId, activityType) {
    setRepFilter(repId)
    setFilter(activityType)
    // Scroll feed into view
    setTimeout(() => {
      document.getElementById('activity-feed-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  async function loadReps() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('active', true)
      .in('role', ['sales', 'admin', 'owner'])
      .order('full_name')
    setReps(data || [])
  }

  async function fetchKpis() {
    setKpiLoading(true)
    try {
      const weekStart = startOfWeek()
      const weekStartDate = weekStart.slice(0, 10)

      const [goalsRes, actsRes, customersRes] = await Promise.all([
        supabase.from('weekly_goals').select('metric_key, target_value'),
        supabase.from('activities')
          .select('activity_type')
          .eq('user_id', profile.id)
          .gte('activity_date', weekStartDate),
        supabase.from('customers')
          .select('id')
          .eq('sales_rep', repId)
          .gte('created_at', weekStart),
      ])

      const acts = actsRes.data || []

      // Goals from DB (with sane defaults)
      const goalMap = { scheduled_meetings: 15, sample_books: 3, new_accounts: 2, cold_calls: 0 }
      ;(goalsRes?.data || []).forEach(g => { goalMap[g.metric_key] = g.target_value })
      setGoals(goalMap)

      setKpis({
        scheduled_meetings: acts.filter(a => a.activity_type === 'scheduled_meeting').length,
        sample_books:       acts.filter(a => a.activity_type === 'sample_book').length,
        cold_calls:         acts.filter(a => a.activity_type === 'cold_call').length,
        new_accounts:       (customersRes.data || []).length,
      })
    } catch (err) {
      console.error('KPI fetch error:', err)
    } finally {
      setKpiLoading(false)
    }
  }

  async function fetchActivities() {
    setLoading(true)
    let query = supabase
      .from('activities')
      .select(`*, 
        customers(account_name),
        orders(order_number, customer_name),
        profiles(full_name)
      `)
      .order('activity_date', { ascending: false })
      .limit(100)

    if (filter !== 'all') query = query.eq('activity_type', filter)

    // Sales reps only see their own activities
    if (profile?.role === 'sales') {
      query = query.eq('user_id', profile.id)
    } else {
      // Execs/admins/owners can filter by a specific rep
      if (repFilter !== 'all') {
        query = query.eq('user_id', repFilter)
      }
      // Apply period filter to feed (matches the scorecard time window)
      const range = periodRange(period)
      query = query.gte('activity_date', range.start.toISOString().slice(0, 10))
      if (range.end) {
        query = query.lt('activity_date', range.end.toISOString().slice(0, 10))
      }
    }

    const { data } = await query
    setActivities(data || [])
    setLoading(false)
  }

  const filtered = activities.filter(a => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      a.subject?.toLowerCase().includes(s) ||
      a.body?.toLowerCase().includes(s) ||
      a.customers?.account_name?.toLowerCase().includes(s) ||
      a.orders?.order_number?.toLowerCase().includes(s)
    )
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-stone-800">Activities</h2>
          <p className="text-stone-400 text-sm mt-0.5">{activities.length} logged</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <span className="text-lg leading-none">+</span> Log Activity
        </button>
      </div>

      {/* Quick log form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <ActivityForm
              onSave={() => { setShowForm(false); fetchActivities() }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      {/* Weekly KPI Scorecard — sales reps only */}
      {isSales && (
        <div className="mb-6">
          <div className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase mb-3">My week — scorecard</div>
          <div className="grid grid-cols-4 gap-3">
            <KpiScorecard label="Scheduled Meetings" icon="🤝" actual={kpis.scheduled_meetings} target={goals.scheduled_meetings} loading={kpiLoading} />
            <KpiScorecard label="New Accounts"       icon="👤" actual={kpis.new_accounts}       target={goals.new_accounts}       loading={kpiLoading} />
            <KpiScorecard label="Sample Books"       icon="📚" actual={kpis.sample_books}       target={goals.sample_books}       loading={kpiLoading} />
            <KpiScorecard label="Cold Calls"         icon="📞" actual={kpis.cold_calls}         target={0}                        loading={kpiLoading} />
          </div>
        </div>
      )}

      {/* Team Scorecard — executives only */}
      {!isSales && (
        <TeamScorecard
          rows={teamRows}
          goals={goals}
          multiplier={periodGoalMultiplier(period)}
          loading={teamLoading}
          period={period}
          onPeriodChange={setPeriod}
          onCellClick={handleCellClick}
        />
      )}

      <div id="activity-feed-anchor" />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {['all', 'scheduled_meeting', 'cold_call', 'sample_book', 'call', 'email', 'note'].map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                filter === t
                  ? 'bg-brand-dark text-white border-brand-dark'
                  : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
              }`}
            >
              {t !== 'all' && <span>{TYPE_STYLES[t]?.icon}</span>}
              {t === 'all' ? 'All' : TYPE_STYLES[t]?.label || t}
            </button>
          ))}
        </div>

        {/* Rep filter — only visible to non-sales users */}
        {!isSales && reps.length > 0 && (
          <select
            value={repFilter}
            onChange={e => setRepFilter(e.target.value)}
            className="text-xs font-semibold border border-stone-200 rounded-lg px-3 py-1.5 bg-white text-stone-700 hover:border-stone-300 focus:outline-none focus:border-stone-500"
          >
            <option value="all">All Reps</option>
            {reps.map(r => (
              <option key={r.id} value={r.id}>
                {r.full_name || r.email}
              </option>
            ))}
          </select>
        )}

        <input
          type="text"
          placeholder="Search activities..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-xs"
        />
      </div>

      {/* Activity feed */}
      {loading ? (
        <div className="card p-12 text-center text-stone-400">Loading activities...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">◈</div>
          <div className="text-stone-600 font-semibold mb-1">No activities yet</div>
          <div className="text-stone-400 text-sm mb-4">Log your first call, email, or note</div>
          <button onClick={() => setShowForm(true)} className="btn-primary">+ Log Activity</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const style = TYPE_STYLES[a.activity_type] || TYPE_STYLES.note
            return (
              <div key={a.id} className="card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  {/* Type badge */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${style.bg} border ${style.border}`}>
                    <span className="text-base">{style.icon}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Links */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {a.customers && (
                            <button
                              onClick={() => navigate(`/customers/${a.customer_id}`)}
                              className="text-xs font-semibold text-brand-light hover:text-brand-mid transition-colors"
                            >
                              {a.customers.account_name}
                            </button>
                          )}
                          {a.customers && a.orders && (
                            <span className="text-stone-300 text-xs">·</span>
                          )}
                          {a.orders && (
                            <button
                              onClick={() => navigate(`/orders/${a.order_id}`)}
                              className="text-xs font-semibold text-brand-light hover:text-brand-mid transition-colors"
                            >
                              Order #{a.orders.order_number}
                            </button>
                          )}
                          {!a.customers && !a.orders && (
                            <span className="text-xs text-stone-400">General</span>
                          )}
                        </div>

                        {/* Subject */}
                        {a.subject && (
                          <div className="font-semibold text-stone-800 text-sm mb-1">{a.subject}</div>
                        )}

                        {/* Body */}
                        {a.body && (
                          <div className="text-sm text-stone-600 leading-relaxed">{a.body}</div>
                        )}

                        {/* Follow-up */}
                        {a.follow_up_date && !a.completed && (
                          <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                            <span>📅</span> Follow up {new Date(a.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-stone-400">{timeAgo(a.activity_date)}</div>
                        <div className="text-xs text-stone-300 mt-0.5">{a.profiles?.full_name?.split(' ')[0]}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
