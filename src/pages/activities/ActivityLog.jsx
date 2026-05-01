import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'
import ActivityForm from './ActivityForm'

const TYPE_STYLES = {
  call:        { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   icon: '📞' },
  email:       { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  icon: '✉️' },
  note:        { bg: 'bg-stone-50',  text: 'text-stone-600',  border: 'border-stone-200',  icon: '📝' },
  meeting:     { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: '🤝' },
  sample_book: { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  icon: '📚' },
}

const WEEKLY_TARGETS = {
  meetings:     10,
  new_customers: 5,
  sample_books:  5,
  new_orders:    0, // no fixed target — just show count
}

function startOfWeek() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
  return d.toISOString()
}

function KpiScorecard({ label, icon, actual, target, loading }) {
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
  const [kpis,        setKpis]        = useState({ meetings: 0, sample_books: 0, new_customers: 0, new_orders: 0 })

  useEffect(() => { fetchActivities() }, [filter, profile])

  useEffect(() => {
    if (isSales && repId) fetchKpis()
  }, [isSales, repId])

  async function fetchKpis() {
    setKpiLoading(true)
    try {
      const weekStart = startOfWeek()
      const weekStartDate = weekStart.slice(0, 10)

      const [actsRes, customersRes, ordersRes] = await Promise.all([
        supabase.from('activities')
          .select('activity_type, activity_date, user_id, profiles(rep_id)')
          .gte('activity_date', weekStart),
        supabase.from('customers')
          .select('id, created_at, sales_rep')
          .eq('sales_rep', repId)
          .gte('created_at', weekStart),
        supabase.from('orders')
          .select('id, created_at, sales_rep')
          .eq('sales_rep', repId)
          .gte('created_at', weekStart),
      ])

      const acts = (actsRes.data || []).filter(a => a.profiles?.rep_id === repId)

      setKpis({
        meetings:      acts.filter(a => a.activity_type === 'meeting').length,
        sample_books:  acts.filter(a => a.activity_type === 'sample_book').length,
        new_customers: (customersRes.data || []).length,
        new_orders:    (ordersRes.data || []).length,
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
            <KpiScorecard label="Meetings"      icon="🤝" actual={kpis.meetings}      target={WEEKLY_TARGETS.meetings}      loading={kpiLoading} />
            <KpiScorecard label="Sample Books"  icon="📚" actual={kpis.sample_books}  target={WEEKLY_TARGETS.sample_books}  loading={kpiLoading} />
            <KpiScorecard label="New Customers" icon="👤" actual={kpis.new_customers} target={WEEKLY_TARGETS.new_customers} loading={kpiLoading} />
            <KpiScorecard label="New Orders"    icon="📋" actual={kpis.new_orders}    target={WEEKLY_TARGETS.new_orders}    loading={kpiLoading} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {['all', 'call', 'email', 'note', 'meeting', 'sample_book'].map(t => (
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
              {t === 'sample_book' ? 'Sample Book' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
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
