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

function ComingSoonCard({ icon, title, description }) {
  return (
    <div className="card p-5 border-dashed opacity-50">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm font-semibold text-stone-600 mb-1">{title}</div>
      <div className="text-xs text-stone-400">{description}</div>
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
    const [customersRes, activeRes, prospectRes] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('active', true),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'prospect').eq('active', true),
    ])
    setStats({ total: customersRes.count || 0, active: activeRes.count || 0, prospect: prospectRes.count || 0 })
    setLoading(false)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-stone-800">{greeting}, {name} {emoji}</h2>
        <p className="text-stone-400 text-sm mt-1">Here's what's happening at Berkely Distribution today.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Customers" value={stats.total} sub={`${stats.active} active accounts`} loading={loading} onClick={() => navigate('/customers')} />
        <StatCard label="Prospects" value={stats.prospect} sub="In pipeline" accent="text-blue-600" loading={loading} onClick={() => navigate('/customers')} />
        <StatCard label="Open Orders" value="—" sub="Coming Phase 2" accent="text-stone-300" />
        <StatCard label="Low Stock" value="—" sub="Coming Phase 4" accent="text-stone-300" />
      </div>
      <div className="card p-5 mb-6">
        <div className="text-xs font-bold tracking-widest text-stone-400 uppercase mb-3">Quick Actions</div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => navigate('/customers/new')} className="btn-primary text-sm">+ New Customer</button>
          <button onClick={() => navigate('/customers')} className="btn-ghost text-sm">View All Customers</button>
        </div>
      </div>
      <div>
        <div className="text-xs font-bold tracking-widest text-stone-400 uppercase mb-3">Coming Next</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <ComingSoonCard icon="≡" title="Orders" description="Full order management — Phase 2" />
          <ComingSoonCard icon="◈" title="Activities" description="Calls, notes, follow-ups — Phase 3" />
          <ComingSoonCard icon="▦" title="Inventory" description="Parts and stock tracking — Phase 4" />
          <ComingSoonCard icon="▤" title="Pipeline" description="Sales pipeline and KPIs — Phase 5" />
          <ComingSoonCard icon="▣" title="Reports" description="Executive dashboards — Phase 6" />
          <ComingSoonCard icon="⟳" title="ePIC Sync" description="Bi-directional sync — Phase 7" />
        </div>
      </div>
    </div>
  )
}
