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

export default function Home() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const hour        = new Date().getHours()
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name        = profile?.full_name?.split(' ')[0] || profile?.email?.split('@')[0] || 'there'
  const emoji       = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙'
  const [stats, setStats]     = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const [custRes, ordersRes, activeOrdersRes, printedRes] = await Promise.all([
      supabase.from('customers').select('id', { count:'exact', head:true }).eq('active', true),
      supabase.from('orders').select('id', { count:'exact', head:true }),
      supabase.from('orders').select('id', { count:'exact', head:true }).in('status', ['submitted','printed','in_production']),
      supabase.from('orders').select('id', { count:'exact', head:true }).eq('status', 'printed'),
    ])
    setStats({
      customers:    custRes.count    || 0,
      totalOrders:  ordersRes.count  || 0,
      activeOrders: activeOrdersRes.count || 0,
      printed:      printedRes.count || 0,
    })
    setLoading(false)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-stone-800">{greeting}, {name} {emoji}</h2>
        <p className="text-stone-400 text-sm mt-1">Here's what's happening at Berkely Distribution today.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Customers" value={stats.customers} sub="Active accounts" loading={loading} onClick={() => navigate('/customers')} />
        <StatCard label="Total Orders" value={stats.totalOrders} sub="Last 90 days" loading={loading} onClick={() => navigate('/orders')} />
        <StatCard label="Active Orders" value={stats.activeOrders} sub="In progress" accent="text-amber-600" loading={loading} onClick={() => navigate('/orders?status=submitted')} />
        <StatCard label="Printed" value={stats.printed} sub="In production" accent="text-purple-600" loading={loading} onClick={() => navigate('/orders?status=printed')} />
      </div>

      <div className="card p-5 mb-6">
        <div className="text-xs font-bold tracking-widest text-stone-400 uppercase mb-3">Quick Actions</div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => navigate('/orders/new')} className="btn-primary text-sm">+ New Order</button>
          <button onClick={() => navigate('/customers/new')} className="btn-ghost text-sm">+ New Customer</button>
          <button onClick={() => navigate('/orders')} className="btn-ghost text-sm">View All Orders</button>
        </div>
      </div>

      <div>
        <div className="text-xs font-bold tracking-widest text-stone-400 uppercase mb-3">Coming Next</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {icon:'◈', title:'Activities', desc:'Calls, notes, follow-ups — Phase 3'},
            {icon:'▦', title:'Inventory',  desc:'Parts and stock tracking — Phase 4'},
            {icon:'▤', title:'Pipeline',   desc:'Sales pipeline and KPIs — Phase 5'},
            {icon:'▣', title:'Reports',    desc:'Executive dashboards — Phase 6'},
            {icon:'⟳', title:'ePIC Sync',  desc:'Bi-directional sync — Phase 7'},
          ].map(({icon,title,desc}) => (
            <div key={title} className="card p-5 border-dashed opacity-50">
              <div className="text-2xl mb-2">{icon}</div>
              <div className="text-sm font-semibold text-stone-600 mb-1">{title}</div>
              <div className="text-xs text-stone-400">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
