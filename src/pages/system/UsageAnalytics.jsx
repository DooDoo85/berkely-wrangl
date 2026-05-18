import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

// ═══════════════════════════════════════════════════════════════════════
// Usage Analytics — Owner-only admin dashboard at /system/usage
//
// Three layers of access control:
//   1. Route guard below redirects non-owners
//   2. RLS policy on usage_events restricts SELECT to owners
//   3. Not in sidebar — navigate via URL or bookmark
//
// Default view:
//   - Time window: this week (Mon→now)
//   - Excludes owner role from totals (so my clicks don't drown out team)
//   - Toggleable to include owners or change window
// ═══════════════════════════════════════════════════════════════════════

// ─── Time-window helpers ─────────────────────────────────────────────
function startOfThisWeek() {
  // Monday-start. Sunday rolls back to previous Monday.
  const d = new Date()
  const day = d.getDay()  // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - daysFromMonday)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfThisMonth() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

function relativeTime(date) {
  if (!date) return 'Never'
  const diffMs = Date.now() - new Date(date).getTime()
  const mins  = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days  = Math.floor(diffMs / 86400000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return `${days}d ago`
}

// ─── Main page ───────────────────────────────────────────────────────
export default function UsageAnalytics() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // Hard gate — bounce non-owners. RLS would block their query anyway,
  // but this gives a fast UX redirect without a flash of the page.
  useEffect(() => {
    if (profile && profile.role !== 'owner') {
      navigate('/', { replace: true })
    }
  }, [profile, navigate])

  const [windowKey,       setWindowKey]       = useState('week') // 'today' | 'week' | 'month'
  const [includeOwners,   setIncludeOwners]   = useState(false)
  const [events,          setEvents]          = useState([])
  const [loading,         setLoading]         = useState(true)
  const [expandedUserId,  setExpandedUserId]  = useState(null)
  const [pageSortKey,     setPageSortKey]     = useState('visits') // 'visits' | 'unique_users'
  const [pagesView,       setPagesView]       = useState('top')    // 'top' | 'dead'

  // ─── Fetch events for current window ──────────────────────────────
  useEffect(() => {
    if (profile?.role !== 'owner') return
    fetchEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey, includeOwners, profile])

  async function fetchEvents() {
    setLoading(true)
    const since = windowKey === 'today' ? startOfToday()
                : windowKey === 'month' ? startOfThisMonth()
                :                          startOfThisWeek()

    let query = supabase
      .from('v_usage_event_with_profile')
      .select('user_id, email, role, full_name, event_type, path, path_template, viewport, session_id, occurred_at')
      .gte('occurred_at', since.toISOString())
      .order('occurred_at', { ascending: false })
      .limit(10000)

    if (!includeOwners) query = query.neq('role', 'owner')

    const { data, error } = await query
    if (error) {
      console.error('[usage] fetch error:', error)
      setEvents([])
    } else {
      setEvents(data || [])
    }
    setLoading(false)
  }

  // ─── Derived: per-user summary ────────────────────────────────────
  const userSummaries = useMemo(() => {
    const map = {}
    for (const e of events) {
      if (!map[e.user_id]) {
        map[e.user_id] = {
          user_id:    e.user_id,
          email:      e.email,
          full_name:  e.full_name,
          role:       e.role,
          pageviews:  0,
          sessions:   new Set(),
          last_seen:  e.occurred_at,
          pages:      {}, // path_template → count
          mobile:     0,
          desktop:    0,
        }
      }
      const u = map[e.user_id]
      u.pageviews++
      if (e.session_id) u.sessions.add(e.session_id)
      if (e.occurred_at > u.last_seen) u.last_seen = e.occurred_at
      u.pages[e.path_template] = (u.pages[e.path_template] || 0) + 1
      if (e.viewport === 'mobile') u.mobile++
      else if (e.viewport === 'desktop') u.desktop++
    }
    return Object.values(map)
      .map(u => ({
        ...u,
        sessions:  u.sessions.size,
        top_pages: Object.entries(u.pages)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([p, c]) => ({ path: p, count: c })),
      }))
      .sort((a, b) => b.pageviews - a.pageviews)
  }, [events])

  // ─── Derived: page popularity ─────────────────────────────────────
  const pageSummaries = useMemo(() => {
    const map = {}
    for (const e of events) {
      const key = e.path_template || e.path
      if (!map[key]) {
        map[key] = {
          path_template: key,
          visits:        0,
          users:         new Set(),
          mobile:        0,
          desktop:       0,
        }
      }
      map[key].visits++
      map[key].users.add(e.user_id)
      if (e.viewport === 'mobile') map[key].mobile++
      else if (e.viewport === 'desktop') map[key].desktop++
    }
    return Object.values(map).map(p => ({
      ...p,
      unique_users: p.users.size,
      mobile_pct:   p.visits > 0 ? Math.round((p.mobile / p.visits) * 100) : 0,
    }))
  }, [events])

  const sortedPages = useMemo(() => {
    const sorted = [...pageSummaries].sort((a, b) =>
      pageSortKey === 'visits'
        ? b.visits - a.visits
        : b.unique_users - a.unique_users
    )
    if (pagesView === 'dead') return sorted.reverse().slice(0, 20)
    return sorted.slice(0, 20)
  }, [pageSummaries, pageSortKey, pagesView])

  // ─── Derived: KPI tiles ───────────────────────────────────────────
  const kpis = useMemo(() => {
    const todayStart = startOfToday().toISOString()
    const weekStart  = startOfThisWeek().toISOString()
    const monthStart = startOfThisMonth().toISOString()

    const activeToday = new Set()
    const activeWeek  = new Set()
    const activeMonth = new Set()
    let totalThisWeek = 0

    for (const e of events) {
      if (e.occurred_at >= monthStart) activeMonth.add(e.user_id)
      if (e.occurred_at >= weekStart) {
        activeWeek.add(e.user_id)
        totalThisWeek++
      }
      if (e.occurred_at >= todayStart) activeToday.add(e.user_id)
    }

    return {
      active_today: activeToday.size,
      active_week:  activeWeek.size,
      active_month: activeMonth.size,
      total_week:   totalThisWeek,
      today_list:   Array.from(activeToday),
    }
  }, [events])

  // ─── Derived: 14-day heatmap data ─────────────────────────────────
  const dailyTrend = useMemo(() => {
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      days.push({
        date:  d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        count: 0,
        users: new Set(),
      })
    }
    for (const e of events) {
      const dateKey = e.occurred_at.slice(0, 10)
      const bucket = days.find(d => d.date === dateKey)
      if (bucket) {
        bucket.count++
        bucket.users.add(e.user_id)
      }
    }
    return days.map(d => ({ ...d, users: d.users.size }))
  }, [events])

  // ─── Derived: anomaly callouts ────────────────────────────────────
  const [allUsers, setAllUsers] = useState([])

  useEffect(() => {
    if (profile?.role !== 'owner') return
    // Fetch all profiles for the "haven't opened in 7+ days" check
    supabase
      .from('profiles')
      .select('id, email, full_name, role, active')
      .eq('active', true)
      .then(({ data }) => setAllUsers(data || []))
  }, [profile])

  const dormantUsers = useMemo(() => {
    if (!allUsers.length) return []
    // Users with any event in the current window are "active"
    const activeIds = new Set(events.map(e => e.user_id))
    return allUsers
      .filter(u => !includeOwners ? u.role !== 'owner' : true)
      .filter(u => !activeIds.has(u.id))
  }, [allUsers, events, includeOwners])

  // ─── Render ───────────────────────────────────────────────────────
  if (profile?.role !== 'owner') return null

  return (
    <div className="min-h-full">
      <div className="max-w-screen-2xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="font-display text-3xl text-ink-strong">Usage Analytics</h1>
            <p className="text-sm text-ink-mid mt-1">
              Owner-only · {events.length.toLocaleString()} events in current window
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-1">
              {['today', 'week', 'month'].map(w => (
                <button
                  key={w}
                  onClick={() => setWindowKey(w)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    windowKey === w
                      ? 'bg-stone-800 text-white'
                      : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  {w === 'today' ? 'Today' : w === 'week' ? 'This week' : 'This month'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-mid cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeOwners}
                onChange={e => setIncludeOwners(e.target.checked)}
                className="rounded border-stone-300"
              />
              Include owner activity
            </label>
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="btn-ghost text-xs px-3 py-1.5"
            >
              {loading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* KPI Tiles */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <KpiTile label="Active today"      value={kpis.active_today} sub={`of ${allUsers.filter(u => !includeOwners ? u.role !== 'owner' : true).length} users`} />
          <KpiTile label="Active this week"  value={kpis.active_week}  accent />
          <KpiTile label="Active this month" value={kpis.active_month} />
          <KpiTile label="Pageviews / week"  value={kpis.total_week.toLocaleString()} />
        </div>

        {/* Section 1 — 14-day trend */}
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink-strong">Activity — last 14 days</h2>
            <span className="text-xs text-ink-muted">Pageviews per day</span>
          </div>
          <TrendChart data={dailyTrend} />
        </div>

        {/* 2-col layout: Per-user (left) + Page popularity (right) */}
        <div className="grid grid-cols-2 gap-5 mb-5">
          {/* Section 2 — Per-user breakdown */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-ink-strong">Per-user activity</h2>
              <span className="text-xs text-ink-muted">{userSummaries.length} users</span>
            </div>
            <div className="space-y-1">
              {userSummaries.length === 0 ? (
                <div className="text-sm text-ink-muted text-center py-8">No activity in this window</div>
              ) : userSummaries.map(u => (
                <UserRow
                  key={u.user_id}
                  user={u}
                  expanded={expandedUserId === u.user_id}
                  onToggle={() => setExpandedUserId(expandedUserId === u.user_id ? null : u.user_id)}
                  events={events.filter(e => e.user_id === u.user_id).slice(0, 50)}
                />
              ))}
            </div>
          </div>

          {/* Section 3 — Page popularity */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-ink-strong">Page popularity</h2>
              <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-lg p-0.5">
                <button
                  onClick={() => setPagesView('top')}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    pagesView === 'top' ? 'bg-white text-stone-800 shadow-sm font-semibold' : 'text-stone-500'
                  }`}
                >
                  Top
                </button>
                <button
                  onClick={() => setPagesView('dead')}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    pagesView === 'dead' ? 'bg-white text-stone-800 shadow-sm font-semibold' : 'text-stone-500'
                  }`}
                >
                  Dead pages
                </button>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-muted border-b border-stone-100">
                  <th className="text-left font-medium py-2">Page</th>
                  <th
                    className="text-right font-medium py-2 cursor-pointer hover:text-ink-strong"
                    onClick={() => setPageSortKey('visits')}
                  >
                    Visits {pageSortKey === 'visits' && '↓'}
                  </th>
                  <th
                    className="text-right font-medium py-2 cursor-pointer hover:text-ink-strong"
                    onClick={() => setPageSortKey('unique_users')}
                  >
                    Users {pageSortKey === 'unique_users' && '↓'}
                  </th>
                  <th className="text-right font-medium py-2">% Mob</th>
                </tr>
              </thead>
              <tbody>
                {sortedPages.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-ink-muted py-6">No data</td></tr>
                ) : sortedPages.map(p => (
                  <tr key={p.path_template} className="border-b border-stone-50 hover:bg-stone-50">
                    <td className="py-2 font-mono text-[11px] text-ink-strong truncate max-w-[200px]" title={p.path_template}>
                      {p.path_template}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink-strong font-semibold">
                      {p.visits}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink-mid">{p.unique_users}</td>
                    <td className="py-2 text-right tabular-nums text-ink-mid">{p.mobile_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4 — Anomalies */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink-strong mb-3">Engagement anomalies</h2>

          {dormantUsers.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
              <span>✓</span>
              <span>Every active user has opened Wrangl in the current window</span>
            </div>
          ) : (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
              <span className="text-amber-600 flex-shrink-0">⚠</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-amber-800">
                  {dormantUsers.length} user{dormantUsers.length !== 1 ? 's' : ''} dormant this {windowKey === 'today' ? 'day' : windowKey === 'week' ? 'week' : 'month'}
                </div>
                <div className="text-xs text-amber-700 mt-1">
                  {dormantUsers.map(u => u.full_name || u.email).join(' · ')}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

function KpiTile({ label, value, sub, accent }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${accent ? 'text-accent-clay' : 'text-ink-strong'}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-mid mt-1">{sub}</div>}
    </div>
  )
}

function UserRow({ user, expanded, onToggle, events }) {
  const roleBadge = {
    owner:       { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    admin:       { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    executive:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
    sales:       { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
    sales_rep:   { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
    production:  { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  }[user.role] || { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200' }

  return (
    <div className="border-b border-stone-100 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 py-2.5 hover:bg-stone-50 transition-colors rounded-md px-2 -mx-2"
      >
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${roleBadge.bg} ${roleBadge.text} ${roleBadge.border}`}>
          {user.role}
        </span>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium text-ink-strong truncate">
            {user.full_name || user.email}
          </div>
          <div className="text-[11px] text-ink-muted truncate">
            {user.sessions} session{user.sessions !== 1 ? 's' : ''} · last active {relativeTime(user.last_seen)}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-base font-bold tabular-nums text-ink-strong">{user.pageviews}</div>
          <div className="text-[10px] text-ink-muted">pageviews</div>
        </div>
        <span className={`text-stone-400 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
      </button>

      {expanded && (
        <div className="bg-stone-50 -mx-2 px-4 py-3 rounded-md mb-1">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">Top pages</div>
              <div className="space-y-0.5">
                {user.top_pages.length === 0 ? (
                  <div className="text-xs text-ink-muted">No pages visited</div>
                ) : user.top_pages.map(p => (
                  <div key={p.path} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[10px] text-ink-strong truncate max-w-[180px]" title={p.path}>{p.path}</span>
                    <span className="tabular-nums text-ink-muted ml-2">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">Device split</div>
              <div className="text-xs text-ink-mid">
                <span className="tabular-nums">{user.desktop}</span> desktop ·{' '}
                <span className="tabular-nums">{user.mobile}</span> mobile
              </div>
            </div>
          </div>

          <details className="text-xs">
            <summary className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider cursor-pointer hover:text-ink-strong">
              Recent activity ({events.length} events)
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
              {events.map(e => (
                <div key={`${e.session_id}-${e.occurred_at}`} className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-ink-muted tabular-nums flex-shrink-0">
                    {new Date(e.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-ink-strong truncate">{e.path_template || e.path}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

// ─── Trend chart — simple bar chart ─────────────────────────────────
function TrendChart({ data }) {
  const max = Math.max(1, ...data.map(d => d.count))
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map(d => {
        const pct = (d.count / max) * 100
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 group relative">
            <div className="w-full flex flex-col justify-end h-24">
              <div
                className="bg-stone-700 rounded-t transition-all duration-200 hover:bg-stone-900 cursor-default"
                style={{ height: `${Math.max(pct, 2)}%` }}
                title={`${d.label}: ${d.count} pageviews, ${d.users} users`}
              />
            </div>
            <div className="text-[9px] text-ink-muted tabular-nums">
              {d.label.split(' ')[2]}
            </div>
          </div>
        )
      })}
    </div>
  )
}
