import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_CONFIG = {
  draft:         { label: 'Draft',         color: 'bg-stone-400',  text: 'text-stone-600',  light: 'bg-stone-50  border-stone-200'  },
  submitted:     { label: 'Submitted',     color: 'bg-blue-500',   text: 'text-blue-700',   light: 'bg-blue-50   border-blue-200'   },
  printed:       { label: 'Printed',       color: 'bg-amber-500',  text: 'text-amber-700',  light: 'bg-amber-50  border-amber-200'  },
  in_production: { label: 'In Production', color: 'bg-purple-500', text: 'text-purple-700', light: 'bg-purple-50 border-purple-200' },
  complete:      { label: 'Complete',      color: 'bg-emerald-500',text: 'text-emerald-700',light: 'bg-emerald-50 border-emerald-200'},
  invoiced:      { label: 'Invoiced',      color: 'bg-teal-500',   text: 'text-teal-700',   light: 'bg-teal-50   border-teal-200'   },
  cancelled:     { label: 'Cancelled',     color: 'bg-red-400',    text: 'text-red-600',    light: 'bg-red-50    border-red-200'    },
}

const STUCK_DAYS = 5

function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export default function OrderStatusDashboard() {
  const navigate  = useNavigate()
  const [counts,  setCounts]  = useState({})
  const [stuck,   setStuck]   = useState([])
  const [loading, setLoading] = useState(true)
  const [total,   setTotal]   = useState(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [allRes, stuckRes] = await Promise.all([
      supabase.from('orders').select('status'),
      supabase.from('orders')
        .select('id, order_number, customer_name, status, order_date, sales_rep, sidemark')
        .not('status', 'in', '("complete","invoiced","cancelled")')
        .lte('order_date', new Date(Date.now() - STUCK_DAYS * 86400000).toISOString().slice(0,10))
        .order('order_date', { ascending: true })
        .limit(50),
    ])

    const c = {}
    allRes.data?.forEach(o => { c[o.status] = (c[o.status] || 0) + 1 })
    setCounts(c)
    setTotal(allRes.data?.length || 0)
    setStuck(stuckRes.data || [])
    setLoading(false)
  }

  const activeStatuses = ['submitted','printed','in_production']
  const activeTotal = activeStatuses.reduce((s,k) => s + (counts[k]||0), 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/reports')} className="btn-ghost text-sm">← Reports</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Order Status</h2>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => navigate(`/orders?status=${key}`)}
            className={`card p-4 text-left border hover:shadow-md transition-all cursor-pointer ${cfg.light}`}>
            <div className={`text-2xl font-display font-bold mb-1 ${cfg.text}`}>
              {loading ? '—' : (counts[key] || 0)}
            </div>
            <div className="text-xs font-semibold text-stone-500">{cfg.label}</div>
            {total > 0 && counts[key] > 0 && (
              <div className="text-xs text-stone-400 mt-1">
                {Math.round((counts[key]/total)*100)}% of total
              </div>
            )}
          </button>
        ))}
        <div className="card p-4 border bg-brand-dark/5 border-brand-dark/20">
          <div className="text-2xl font-display font-bold mb-1 text-brand-dark">
            {loading ? '—' : total}
          </div>
          <div className="text-xs font-semibold text-stone-500">Total Orders</div>
          <div className="text-xs text-stone-400 mt-1">{activeTotal} active</div>
        </div>
      </div>

      {/* Visual bar */}
      <div className="card p-5 mb-6">
        <div className="text-xs font-bold tracking-widest text-stone-400 uppercase mb-3">Status Distribution</div>
        <div className="flex h-6 rounded-lg overflow-hidden gap-0.5">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const pct = total > 0 ? ((counts[key]||0)/total)*100 : 0
            if (pct < 1) return null
            return (
              <div key={key} className={`${cfg.color} flex items-center justify-center transition-all`}
                style={{ width: `${pct}%` }} title={`${cfg.label}: ${counts[key]||0}`}>
                {pct > 8 && <span className="text-white text-xs font-bold">{counts[key]||0}</span>}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            counts[key] > 0 && (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${cfg.color}`}></div>
                <span className="text-xs text-stone-500">{cfg.label} ({counts[key]})</span>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Stuck orders */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 bg-amber-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-600">⚠️</span>
            <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">
              Stuck Orders — {STUCK_DAYS}+ Days in Same Status
            </div>
          </div>
          <span className="text-xs font-bold text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
            {stuck.length} orders
          </span>
        </div>

        {stuck.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-2xl mb-2">✅</div>
            <div className="text-stone-600 font-semibold text-sm">No stuck orders</div>
            <div className="text-stone-400 text-xs mt-1">All active orders are moving through the pipeline</div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Order</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Rep</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Days</th>
              </tr>
            </thead>
            <tbody>
              {stuck.map((o, i) => {
                const days = daysSince(o.order_date)
                const cfg  = STATUS_CONFIG[o.status] || STATUS_CONFIG.submitted
                return (
                  <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)}
                    className={`border-b border-stone-50 hover:bg-stone-50 cursor-pointer ${i===stuck.length-1?'border-b-0':''}`}>
                    <td className="px-5 py-3 font-mono text-sm font-semibold text-brand-light">#{o.order_number}</td>
                    <td className="px-5 py-3">
                      <div className="text-sm text-stone-700">{o.customer_name}</div>
                      {o.sidemark && <div className="text-xs text-stone-400">{o.sidemark}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.light} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-stone-400">{o.sales_rep?.split(' ')[0] || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-sm font-bold ${days > 10 ? 'text-red-500' : 'text-amber-600'}`}>
                        {days}d
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
