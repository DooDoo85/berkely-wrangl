import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function KPI({ label, value, sub, accent, loading }) {
  return (
    <div className="card p-5 text-center">
      <div className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase mb-3">{label}</div>
      <div className={`text-4xl font-display font-bold mb-1.5 ${accent || 'text-stone-800'}`}>
        {loading ? <span className="text-stone-200">—</span> : value}
      </div>
      {sub && <div className="text-xs text-stone-400">{sub}</div>}
    </div>
  )
}

export default function ProductionDashboard() {
  const navigate  = useNavigate()
  const [data,    setData]    = useState({})
  const [recent,  setRecent]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const now      = new Date()
    const dow      = now.getDay()
    const monday   = new Date(now)
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
    monday.setHours(0,0,0,0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const wtdStr   = monday.toISOString().slice(0,10)
    const mtdStr   = monthStart.toISOString().slice(0,10)

    const [wtdRes, mtdRes, inProdRes, printedRes, recentRes] = await Promise.all([
      supabase.from('orders').select('id',{count:'exact',head:true})
        .in('status',['complete','invoiced']).gte('order_date', wtdStr),
      supabase.from('orders').select('id',{count:'exact',head:true})
        .in('status',['complete','invoiced']).gte('order_date', mtdStr),
      supabase.from('orders').select('id',{count:'exact',head:true})
        .eq('status','in_production'),
      supabase.from('orders').select('id',{count:'exact',head:true})
        .eq('status','printed'),
      supabase.from('orders').select('id, order_number, customer_name, status, order_date, sales_rep, sidemark')
        .in('status',['complete','invoiced'])
        .order('order_date',{ascending:false})
        .limit(15),
    ])

    setData({
      wtd:        wtdRes.count    || 0,
      mtd:        mtdRes.count    || 0,
      inProd:     inProdRes.count || 0,
      printed:    printedRes.count || 0,
    })
    setRecent(recentRes.data || [])
    setLoading(false)
  }

  const today = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/reports')} className="btn-ghost text-sm">← Reports</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Production Dashboard</h2>
      </div>
      <p className="text-stone-400 text-sm mb-6 ml-1">{today}</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPI label="Shipped WTD"       value={data.wtd}     sub="This week"        accent="text-emerald-600" loading={loading} />
        <KPI label="Shipped MTD"       value={data.mtd}     sub="This month"       accent="text-emerald-700" loading={loading} />
        <KPI label="In Production"     value={data.inProd}  sub="Active now"       accent="text-purple-600"  loading={loading} />
        <KPI label="Printed / Queued"  value={data.printed} sub="Awaiting production" accent="text-amber-600" loading={loading} />
      </div>

      {/* Pipeline bar */}
      <div className="card p-5 mb-6">
        <div className="text-xs font-bold tracking-widest text-stone-400 uppercase mb-4">Production Pipeline</div>
        <div className="flex items-center gap-2">
          {[
            { label: 'Submitted',     key: 'submitted',     color: 'bg-blue-400' },
            { label: 'Printed',       key: 'printed',       color: 'bg-amber-400' },
            { label: 'In Production', key: 'in_production', color: 'bg-purple-500' },
            { label: 'Complete',      key: 'complete',      color: 'bg-emerald-500' },
          ].map(s => (
            <button key={s.key} onClick={() => navigate(`/orders?status=${s.key}`)}
              className="flex-1 text-center group">
              <div className={`h-8 rounded-lg ${s.color} opacity-80 group-hover:opacity-100 transition-opacity flex items-center justify-center`}>
                <span className="text-white text-xs font-bold">
                  {s.key === 'submitted'     ? data.submitted  || '—' :
                   s.key === 'printed'       ? data.printed    || '—' :
                   s.key === 'in_production' ? data.inProd     || '—' :
                   s.key === 'complete'      ? data.wtd        || '—' : '—'}
                </span>
              </div>
              <div className="text-xs text-stone-400 mt-1">{s.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent shipped */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
          <div className="text-xs font-bold text-stone-400 uppercase tracking-wide">Recently Shipped / Completed</div>
          <button onClick={() => navigate('/orders')} className="text-xs text-brand-gold font-semibold">View all →</button>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">No completed orders yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Order</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Rep</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Date</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o,i) => (
                <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)}
                  className={`border-b border-stone-50 hover:bg-stone-50 cursor-pointer ${i===recent.length-1?'border-b-0':''}`}>
                  <td className="px-5 py-3 font-mono text-sm font-semibold text-brand-light">#{o.order_number}</td>
                  <td className="px-5 py-3 text-sm text-stone-700">{o.customer_name}</td>
                  <td className="px-5 py-3 text-xs text-stone-400">{o.sales_rep?.split(' ')[0] || '—'}</td>
                  <td className="px-5 py-3 text-xs text-stone-400">
                    {o.order_date ? new Date(o.order_date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      o.status === 'complete' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-teal-50 text-teal-700 border-teal-200'
                    }`}>{o.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
