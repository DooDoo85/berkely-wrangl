import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../components/AuthProvider'
import { supabase } from '../lib/supabase'

function StatCard({ label, value, sub, accent, onClick, loading }) {
  return (
    <div onClick={onClick} className={`card p-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150' : ''}`}>
      <div className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase mb-3">{label}</div>
      <div className={`text-3xl font-display font-bold mb-1.5 ${accent || 'text-stone-800'}`}>
        {loading ? <span className="text-stone-200">—</span> : value}
      </div>
      {sub && <div className="text-xs text-stone-400">{sub}</div>}
    </div>
  )
}

const TYPE_ICONS = { call:'📞', email:'✉️', note:'📝', meeting:'🤝' }

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff/60000), hrs = Math.floor(diff/3600000), days = Math.floor(diff/86400000)
  if (mins < 60) return mins+'m ago'
  if (hrs < 24)  return hrs+'h ago'
  if (days < 7)  return days+'d ago'
  return new Date(date).toLocaleDateString('en-US',{month:'short',day:'numeric'})
}

export default function Home() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const hour        = new Date().getHours()
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name        = profile?.full_name?.split(' ')[0] || profile?.email?.split('@')[0] || 'there'
  const emoji       = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙'
  const [stats,     setStats]     = useState({})
  const [followUps, setFollowUps] = useState([])
  const [recent,    setRecent]    = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const today = new Date().toISOString().slice(0,10)
    const [custRes, ordersRes, activeRes, printedRes, lowStockRes, containersRes, followUpRes, recentRes] = await Promise.all([
      supabase.from('customers').select('id',{count:'exact',head:true}).eq('active',true),
      supabase.from('orders').select('id',{count:'exact',head:true}),
      supabase.from('orders').select('id',{count:'exact',head:true}).in('status',['submitted','printed','in_production']),
      supabase.from('orders').select('id',{count:'exact',head:true}).eq('status','printed'),
      supabase.from('parts').select('id',{count:'exact',head:true}).eq('qty_on_hand',0).eq('active',true),
      supabase.from('containers').select('id',{count:'exact',head:true}).eq('status','in_transit').eq('active',true),
      supabase.from('activities').select('*, customers(account_name), orders(order_number)')
        .lte('follow_up_date', today).eq('completed', false).order('follow_up_date').limit(5),
      supabase.from('activities').select('*, customers(account_name), orders(order_number), profiles(full_name)')
        .order('activity_date',{ascending:false}).limit(5),
    ])
    setStats({
      customers:    custRes.count    || 0,
      totalOrders:  ordersRes.count  || 0,
      activeOrders: activeRes.count  || 0,
      printed:      printedRes.count || 0,
      outOfStock:   lowStockRes.count || 0,
      containers:   containersRes.count || 0,
    })
    setFollowUps(followUpRes.data || [])
    setRecent(recentRes.data || [])
    setLoading(false)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-stone-800">{greeting}, {name} {emoji}</h2>
        <p className="text-stone-400 text-sm mt-1">Here's what's happening at Berkely Distribution today.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Customers"    value={stats.customers}    sub="Active accounts"   loading={loading} onClick={() => navigate('/customers')} />
        <StatCard label="Active Orders" value={stats.activeOrders} sub="In progress"      accent="text-amber-600" loading={loading} onClick={() => navigate('/orders')} />
        <StatCard label="Out of Stock"  value={stats.outOfStock}   sub="Parts at zero qty" accent={stats.outOfStock > 0 ? "text-red-500" : "text-emerald-600"} loading={loading} onClick={() => navigate('/inventory')} />
        <StatCard label="Containers"    value={stats.containers}   sub="In transit"        accent="text-blue-600" loading={loading} onClick={() => navigate('/inventory/containers')} />
      </div>

      <div className="grid grid-cols-3 gap-5 mb-6">
        {/* Follow-ups */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-bold tracking-widest text-stone-400 uppercase">Follow-ups Due</div>
            <button onClick={() => navigate('/activities')} className="text-xs text-brand-gold font-semibold">View all</button>
          </div>
          {followUps.length === 0 ? (
            <div className="text-center py-4 text-stone-400 text-sm">No follow-ups due 🎉</div>
          ) : (
            <div className="space-y-2">
              {followUps.map(a => (
                <div key={a.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-stone-50 cursor-pointer" onClick={() => navigate('/activities')}>
                  <span className="text-sm mt-0.5">{TYPE_ICONS[a.activity_type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-stone-700 truncate">{a.subject || a.body?.slice(0,40) || 'Follow up'}</div>
                    <div className="text-xs text-stone-400">{a.customers?.account_name || 'General'}</div>
                  </div>
                  <div className="text-xs text-amber-600 font-semibold whitespace-nowrap">
                    {new Date(a.follow_up_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-bold tracking-widest text-stone-400 uppercase">Recent Activity</div>
            <button onClick={() => navigate('/activities')} className="text-xs text-brand-gold font-semibold">View all →</button>
          </div>
          {recent.length === 0 ? (
            <div className="text-center py-6 text-stone-400 text-sm">No activities yet — log your first one!</div>
          ) : (
            <div className="space-y-3">
              {recent.map((a, i) => (
                <div key={a.id} className={`flex items-start gap-3 py-2 ${i < recent.length-1 ? 'border-b border-stone-50' : ''}`}>
                  <span className="text-base mt-0.5 flex-shrink-0">{TYPE_ICONS[a.activity_type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.customers && <span className="text-xs font-semibold text-brand-light">{a.customers.account_name}</span>}
                      {a.orders && <span className="text-xs text-stone-400">Order #{a.orders.order_number}</span>}
                    </div>
                    <div className="text-sm text-stone-600 truncate mt-0.5">{a.subject || a.body?.slice(0,60) || '—'}</div>
                  </div>
                  <div className="text-xs text-stone-400 flex-shrink-0">{timeAgo(a.activity_date)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="card p-5">
        <div className="text-xs font-bold tracking-widest text-stone-400 uppercase mb-3">Quick Actions</div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => navigate('/activities')} className="btn-primary text-sm">+ Log Activity</button>
          <button onClick={() => navigate('/orders/new')} className="btn-ghost text-sm">+ New Order</button>
          <button onClick={() => navigate('/customers/new')} className="btn-ghost text-sm">+ New Customer</button>
          <button onClick={() => navigate('/inventory')} className="btn-ghost text-sm">View Inventory</button>
        </div>
      </div>
    </div>
  )
}
