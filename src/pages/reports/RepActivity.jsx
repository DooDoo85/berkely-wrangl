import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// ── Weekly targets ────────────────────────────────────────────────────────────
const TARGETS = {
  meetings:     10,
  sample_books:  5,
  new_accounts:  5,
}

// ── helpers ───────────────────────────────────────────────────────────────────
function startOfWeek() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
  return d.toISOString()
}

function startOfMonth() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function daysAgo(dateStr) {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function fmt$(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000)    return `$${(n / 1000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

function timeAgo(date) {
  if (!date) return '—'
  const d = daysAgo(date)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7)  return `${d}d ago`
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── sub-components ────────────────────────────────────────────────────────────

function ActivityBar({ label, actual, target, color }) {
  const pct    = Math.min(Math.round((actual / target) * 100), 100)
  const onTrack = actual >= target
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-stone-500">{label}</span>
        <span className={`font-semibold ${onTrack ? 'text-emerald-600' : actual >= target * 0.5 ? 'text-amber-600' : 'text-red-500'}`}>
          {actual} / {target}
        </span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: onTrack ? '#10b981' : actual >= target * 0.5 ? '#f59e0b' : '#ef4444',
          }}
        />
      </div>
    </div>
  )
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="text-base">🥇</span>
  if (rank === 2) return <span className="text-base">🥈</span>
  if (rank === 3) return <span className="text-base">🥉</span>
  return <span className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center text-xs text-stone-400 font-bold">{rank}</span>
}

// ── main component ────────────────────────────────────────────────────────────

export default function RepActivity() {
  const navigate  = useNavigate()
  const [loading,  setLoading]  = useState(true)
  const [repStats, setRepStats] = useState([])
  const [selRep,   setSelRep]   = useState(null)
  const [sortBy,   setSortBy]   = useState('orders_mtd') // orders_mtd | revenue_mtd
  const [tab,      setTab]      = useState('activity')   // activity | orders

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const weekStart  = startOfWeek()
      const monthStart = startOfMonth()

      const [ordersRes, actsRes, newAccountsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, customer_name, status, order_date, updated_at, sales_rep, subtotal')
          .not('sales_rep', 'is', null)
          .order('order_date', { ascending: false })
          .limit(1000),

        supabase
          .from('activities')
          .select('id, activity_type, activity_date, user_id, customer_id, subject, body, profiles(full_name, rep_id), customers(account_name)')
          .order('activity_date', { ascending: false })
          .limit(500),

        supabase
          .from('customers')
          .select('id, sales_rep, created_at')
          .not('sales_rep', 'is', null)
          .gte('created_at', monthStart),
      ])

      const orders      = ordersRes.data  || []
      const activities  = actsRes.data    || []
      const newAccounts = newAccountsRes.data || []

      // Build per-rep stats
      const reps = {}

      const ensureRep = name => {
        if (!reps[name]) reps[name] = {
          name,
          ordersMTD: 0, ordersWTD: 0,
          revenueMTD: 0,
          meetingsWTD: 0, sampleBooksWTD: 0, newAccountsWTD: 0,
          meetingsMTD: 0, sampleBooksMTD: 0, newAccountsMTD: 0,
          lastOrderDate: null,
          lastActivityDate: null,
          recentOrders: [],
          recentActivities: [],
        }
      }

      // Orders
      orders.forEach(o => {
        const rep = o.sales_rep?.trim()
        if (!rep) return
        ensureRep(rep)
        const r = reps[rep]

        if (o.order_date >= monthStart.slice(0, 10)) {
          r.ordersMTD++
          r.revenueMTD += parseFloat(o.subtotal || 0)
        }
        if (o.order_date >= weekStart.slice(0, 10)) r.ordersWTD++

        if (!r.lastOrderDate || o.order_date > r.lastOrderDate) r.lastOrderDate = o.order_date
        if (r.recentOrders.length < 5) r.recentOrders.push(o)
      })

      // Activities
      activities.forEach(a => {
        const rep = a.profiles?.rep_id?.trim() || a.profiles?.full_name?.trim()
        if (!rep) return
        ensureRep(rep)
        const r = reps[rep]

        const aDate = a.activity_date?.slice(0, 10)
        if (!r.lastActivityDate || aDate > r.lastActivityDate) r.lastActivityDate = aDate
        if (r.recentActivities.length < 10) r.recentActivities.push(a)

        const isThisWeek  = aDate >= weekStart.slice(0, 10)
        const isThisMonth = aDate >= monthStart.slice(0, 10)

        if (a.activity_type === 'meeting') {
          if (isThisWeek)  r.meetingsWTD++
          if (isThisMonth) r.meetingsMTD++
        }
        if (a.activity_type === 'sample_book') {
          if (isThisWeek)  r.sampleBooksWTD++
          if (isThisMonth) r.sampleBooksMTD++
        }
      })

      // New accounts this week/month per rep
      newAccounts.forEach(c => {
        const rep = c.sales_rep?.trim()
        if (!rep) return
        ensureRep(rep)
        const r = reps[rep]
        const cDate = c.created_at?.slice(0, 10)
        if (cDate >= weekStart.slice(0, 10))  r.newAccountsWTD++
        if (cDate >= monthStart.slice(0, 10)) r.newAccountsMTD++
      })

      // Filter out test/system reps and sort
      const repList = Object.values(reps)
        .filter(r => r.name !== 'Unknown' && r.name !== 'david')
        .sort((a, b) => b.ordersMTD - a.ordersMTD)

      setRepStats(repList)
    } catch (err) {
      console.error('RepActivity error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Sort reps
  const sortedReps = [...repStats].sort((a, b) => {
    if (sortBy === 'revenue_mtd') return b.revenueMTD - a.revenueMTD
    return b.ordersMTD - a.ordersMTD
  })

  // Risk reps — no activity in last 3 days or missing on all 3 targets
  const riskReps = repStats.filter(r => {
    const daysSinceActivity = r.lastActivityDate ? daysAgo(r.lastActivityDate) : 999
    const missingTargets = [
      r.meetingsWTD < TARGETS.meetings * 0.5,
      r.sampleBooksWTD < TARGETS.sample_books * 0.5,
      r.newAccountsWTD < TARGETS.new_accounts * 0.5,
    ].filter(Boolean).length
    return daysSinceActivity > 3 || missingTargets >= 2
  })

  const selectedRep = selRep ? repStats.find(r => r.name === selRep) : null

  const TYPE_ICONS = { call: '📞', email: '✉️', note: '📝', meeting: '🤝', sample_book: '📚' }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/reports')} className="btn-ghost text-sm">← Reports</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Sales Rep Activity</h2>
      </div>

      {/* ── Rep Ranking ─────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
          <div className="text-xs font-bold text-stone-400 uppercase tracking-wide">Rep Ranking — Month to Date</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400">Sort by</span>
            <button
              onClick={() => setSortBy('orders_mtd')}
              className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-all ${
                sortBy === 'orders_mtd' ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200'
              }`}
            >Orders</button>
            <button
              onClick={() => setSortBy('revenue_mtd')}
              className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-all ${
                sortBy === 'revenue_mtd' ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200'
              }`}
            >Revenue</button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-stone-400">Loading...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase w-8">#</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Rep</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Orders WTD</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Orders MTD</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Revenue MTD</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Meetings</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Sample Books</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">New Accts</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {sortedReps.map((rep, i) => {
                const daysSinceAct = rep.lastActivityDate ? daysAgo(rep.lastActivityDate) : 999
                const isRisk = daysSinceAct > 3
                return (
                  <tr
                    key={rep.name}
                    onClick={() => setSelRep(selRep === rep.name ? null : rep.name)}
                    className={`border-b border-stone-50 cursor-pointer transition-colors ${
                      selRep === rep.name ? 'bg-brand-gold/5 border-brand-gold/20' : 'hover:bg-stone-50'
                    } ${i === sortedReps.length - 1 ? 'border-b-0' : ''}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center">
                        <RankBadge rank={i + 1} />
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-dark flex items-center justify-center flex-shrink-0">
                          <span className="text-brand-gold text-xs font-bold">{rep.name.charAt(0)}</span>
                        </div>
                        <span className="text-sm font-semibold text-stone-700">{rep.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm text-stone-500">{rep.ordersWTD}</td>
                    <td className="px-5 py-3.5 text-right text-sm font-bold text-brand-light">{rep.ordersMTD}</td>
                    <td className="px-5 py-3.5 text-right text-sm text-stone-500">{fmt$(rep.revenueMTD)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-sm font-semibold ${rep.meetingsWTD >= TARGETS.meetings ? 'text-emerald-600' : rep.meetingsWTD >= TARGETS.meetings * 0.5 ? 'text-amber-500' : 'text-red-500'}`}>
                        {rep.meetingsWTD}
                      </span>
                      <span className="text-xs text-stone-300">/{TARGETS.meetings}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-sm font-semibold ${rep.sampleBooksWTD >= TARGETS.sample_books ? 'text-emerald-600' : rep.sampleBooksWTD >= TARGETS.sample_books * 0.5 ? 'text-amber-500' : 'text-red-500'}`}>
                        {rep.sampleBooksWTD}
                      </span>
                      <span className="text-xs text-stone-300">/{TARGETS.sample_books}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-sm font-semibold ${rep.newAccountsWTD >= TARGETS.new_accounts ? 'text-emerald-600' : rep.newAccountsWTD >= TARGETS.new_accounts * 0.5 ? 'text-amber-500' : 'text-red-500'}`}>
                        {rep.newAccountsWTD}
                      </span>
                      <span className="text-xs text-stone-300">/{TARGETS.new_accounts}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-xs font-semibold ${isRisk ? 'text-red-500' : 'text-stone-400'}`}>
                        {timeAgo(rep.lastActivityDate)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Risk Reps ────────────────────────────────────────────────────────── */}
      {!loading && riskReps.length > 0 && (
        <div className="card p-5 mb-6 border-red-100 bg-red-50/30">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">⚠️</span>
            <div className="text-xs font-bold text-red-600 uppercase tracking-wide">Needs Attention — Low Activity This Week</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {riskReps.map(rep => {
              const daysSinceAct = rep.lastActivityDate ? daysAgo(rep.lastActivityDate) : 999
              return (
                <div
                  key={rep.name}
                  onClick={() => setSelRep(rep.name)}
                  className="bg-white border border-red-100 rounded-xl p-4 cursor-pointer hover:border-red-300 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-brand-dark flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-gold text-xs font-bold">{rep.name.charAt(0)}</span>
                    </div>
                    <span className="text-sm font-semibold text-stone-700">{rep.name}</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    {daysSinceAct > 3 && (
                      <div className="text-red-500 font-semibold">
                        No activity in {daysSinceAct === 999 ? 'a long time' : `${daysSinceAct} days`}
                      </div>
                    )}
                    {rep.meetingsWTD < TARGETS.meetings * 0.5 && (
                      <div className="text-amber-600">Meetings: {rep.meetingsWTD}/{TARGETS.meetings} this week</div>
                    )}
                    {rep.sampleBooksWTD < TARGETS.sample_books * 0.5 && (
                      <div className="text-amber-600">Sample books: {rep.sampleBooksWTD}/{TARGETS.sample_books} this week</div>
                    )}
                    {rep.newAccountsWTD < TARGETS.new_accounts * 0.5 && (
                      <div className="text-amber-600">New accounts: {rep.newAccountsWTD}/{TARGETS.new_accounts} this week</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Rep Detail ───────────────────────────────────────────────────────── */}
      {selectedRep && (
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-dark flex items-center justify-center">
                <span className="text-brand-gold text-sm font-bold">{selectedRep.name.charAt(0)}</span>
              </div>
              <span className="font-bold text-stone-700">{selectedRep.name}</span>
              <span className="text-xs text-stone-400">— Activity vs Expectations This Week</span>
            </div>
            <button onClick={() => setSelRep(null)} className="text-xs text-stone-400 hover:text-stone-600">
              Close ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6 p-5">
            {/* Activity targets */}
            <div>
              <div className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-4">Weekly Activity Targets</div>
              <ActivityBar label="Meetings"     actual={selectedRep.meetingsWTD}    target={TARGETS.meetings}     />
              <ActivityBar label="Sample Books" actual={selectedRep.sampleBooksWTD} target={TARGETS.sample_books} />
              <ActivityBar label="New Accounts" actual={selectedRep.newAccountsWTD} target={TARGETS.new_accounts} />
            </div>

            {/* Orders + revenue */}
            <div>
              <div className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-4">Orders & Revenue</div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-stone-400 mb-1">Orders WTD</div>
                  <div className="text-2xl font-display font-bold text-stone-800">{selectedRep.ordersWTD}</div>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-stone-400 mb-1">Orders MTD</div>
                  <div className="text-2xl font-display font-bold text-brand-light">{selectedRep.ordersMTD}</div>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 text-center col-span-2">
                  <div className="text-xs text-stone-400 mb-1">Revenue MTD</div>
                  <div className="text-2xl font-display font-bold text-indigo-600">{fmt$(selectedRep.revenueMTD)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent activity feed */}
          <div className="border-t border-stone-100">
            <div className="flex gap-2 px-5 py-3 border-b border-stone-100 bg-stone-50">
              <button
                onClick={() => setTab('activity')}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                  tab === 'activity' ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200'
                }`}
              >
                Recent Activity ({selectedRep.recentActivities.length})
              </button>
              <button
                onClick={() => setTab('orders')}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                  tab === 'orders' ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200'
                }`}
              >
                Recent Orders ({selectedRep.recentOrders.length})
              </button>
            </div>

            {tab === 'activity' ? (
              <div className="divide-y divide-stone-50">
                {selectedRep.recentActivities.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-sm">No activities logged yet</div>
                ) : selectedRep.recentActivities.map(a => (
                  <div key={a.id} className="px-5 py-3 flex items-start gap-3 hover:bg-stone-50">
                    <span className="text-base mt-0.5 flex-shrink-0">{TYPE_ICONS[a.activity_type] || '📝'}</span>
                    <div className="flex-1 min-w-0">
                      {a.customers && <div className="text-xs font-semibold text-brand-light">{a.customers.account_name}</div>}
                      <div className="text-sm text-stone-700 mt-0.5">{a.subject || a.body?.slice(0, 80) || '—'}</div>
                    </div>
                    <div className="text-xs text-stone-400 flex-shrink-0">{timeAgo(a.activity_date)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Order</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Customer</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Value</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRep.recentOrders.map((o, i) => (
                    <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)}
                      className={`border-b border-stone-50 hover:bg-stone-50 cursor-pointer ${i === selectedRep.recentOrders.length - 1 ? 'border-b-0' : ''}`}>
                      <td className="px-5 py-3 font-mono text-sm font-semibold text-brand-light">#{o.order_number}</td>
                      <td className="px-5 py-3 text-sm text-stone-700">{o.customer_name}</td>
                      <td className="px-5 py-3 text-xs text-stone-500 capitalize">{o.status?.replace('_', ' ')}</td>
                      <td className="px-5 py-3 text-right text-sm text-stone-500">
                        {o.subtotal ? '$' + Number(o.subtotal).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-stone-400">
                        {o.order_date ? new Date(o.order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
