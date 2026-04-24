import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TYPE_ICONS = { call:'📞', email:'✉️', note:'📝', meeting:'🤝' }

function timeAgo(date) {
  if (!date) return '—'
  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return days + 'd ago'
  return new Date(date).toLocaleDateString('en-US', { month:'short', day:'numeric' })
}

export default function RepActivity() {
  const navigate  = useNavigate()
  const [repStats, setRepStats] = useState([])
  const [orders,   setOrders]   = useState([])
  const [acts,     setActs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selRep,   setSelRep]   = useState(null)
  const [tab,      setTab]      = useState('orders')

  const now       = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)
  const dow       = now.getDay()
  const monday    = new Date(now)
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  monday.setHours(0,0,0,0)
  const weekStart = monday.toISOString().slice(0,10)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [ordersRes, actsRes] = await Promise.all([
      supabase.from('orders').select('id, order_number, customer_name, status, order_date, sales_rep, subtotal, sidemark')
        .not('sales_rep', 'is', null).order('order_date', { ascending: false }).limit(500),
      supabase.from('activities').select('*, customers(account_name), profiles(full_name)')
        .order('activity_date', { ascending: false }).limit(300),
    ])

    const orders = ordersRes.data || []
    const acts   = actsRes.data  || []

    // Build rep stats
    const reps = {}
    orders.forEach(o => {
      const rep = o.sales_rep || 'Unknown'
      if (!reps[rep]) reps[rep] = { name: rep, orders: 0, ordersWTD: 0, ordersMTD: 0, totalValue: 0, recentOrder: null }
      reps[rep].orders++
      reps[rep].totalValue += parseFloat(o.subtotal || 0)
      if (o.order_date >= weekStart)  reps[rep].ordersWTD++
      if (o.order_date >= monthStart) reps[rep].ordersMTD++
      if (!reps[rep].recentOrder || o.order_date > reps[rep].recentOrder) reps[rep].recentOrder = o.order_date
    })

    acts.forEach(a => {
      const rep = a.profiles?.full_name || 'Unknown'
      if (!reps[rep]) reps[rep] = { name: rep, orders: 0, ordersWTD: 0, ordersMTD: 0, totalValue: 0, recentOrder: null }
      reps[rep].activities    = (reps[rep].activities || 0) + 1
      reps[rep].calls         = (reps[rep].calls    || 0) + (a.activity_type === 'call'    ? 1 : 0)
      reps[rep].emails        = (reps[rep].emails   || 0) + (a.activity_type === 'email'   ? 1 : 0)
      reps[rep].meetings      = (reps[rep].meetings || 0) + (a.activity_type === 'meeting' ? 1 : 0)
    })

    setRepStats(Object.values(reps).sort((a,b) => b.ordersMTD - a.ordersMTD))
    setOrders(orders)
    setActs(acts)
    setLoading(false)
  }

  const filteredOrders = selRep ? orders.filter(o => o.sales_rep === selRep) : orders
  const filteredActs   = selRep ? acts.filter(a => a.profiles?.full_name === selRep) : acts

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/reports')} className="btn-ghost text-sm">← Reports</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Sales Rep Activity</h2>
      </div>

      {/* Rep leaderboard */}
      <div className="card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-stone-100 bg-stone-50">
          <div className="text-xs font-bold text-stone-400 uppercase tracking-wide">Rep Summary — Month to Date</div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-stone-400">Loading...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Rep</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Orders WTD</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Orders MTD</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Total Value</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Activities</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Last Order</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {repStats.map((rep, i) => (
                <tr key={rep.name}
                  onClick={() => setSelRep(selRep === rep.name ? null : rep.name)}
                  className={`border-b border-stone-50 cursor-pointer transition-colors ${
                    selRep === rep.name ? 'bg-brand-gold/5 border-brand-gold/20' : 'hover:bg-stone-50'
                  } ${i === repStats.length-1 ? 'border-b-0' : ''}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-dark flex items-center justify-center flex-shrink-0">
                        <span className="text-brand-gold text-xs font-bold">{rep.name.charAt(0)}</span>
                      </div>
                      <span className="text-sm font-semibold text-stone-700">{rep.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-stone-700">{rep.ordersWTD}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-bold text-brand-light">{rep.ordersMTD}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-stone-500">
                    ${rep.totalValue.toLocaleString('en-US',{maximumFractionDigits:0})}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="text-sm text-stone-500">{rep.activities || 0}</div>
                    {(rep.calls||rep.emails||rep.meetings) ? (
                      <div className="text-xs text-stone-400 flex gap-1 justify-end">
                        {rep.calls    > 0 && <span>📞{rep.calls}</span>}
                        {rep.emails   > 0 && <span>✉️{rep.emails}</span>}
                        {rep.meetings > 0 && <span>🤝{rep.meetings}</span>}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5 text-right text-xs text-stone-400">{timeAgo(rep.recentOrder)}</td>
                  <td className="px-5 py-3.5 text-right text-stone-300 text-sm">
                    {selRep === rep.name ? '▲' : '▼'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selRep && <span className="font-semibold text-stone-700">{selRep}</span>}
            <div className="flex gap-2">
              <button onClick={() => setTab('orders')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  tab === 'orders' ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200'
                }`}>
                Orders ({filteredOrders.slice(0,100).length})
              </button>
              <button onClick={() => setTab('activities')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  tab === 'activities' ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200'
                }`}>
                Activities ({filteredActs.slice(0,100).length})
              </button>
            </div>
          </div>
          {selRep && (
            <button onClick={() => setSelRep(null)} className="text-xs text-stone-400 hover:text-stone-600">
              Clear filter ✕
            </button>
          )}
        </div>

        {tab === 'orders' ? (
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
              {filteredOrders.slice(0,50).map((o, i) => (
                <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)}
                  className={`border-b border-stone-50 hover:bg-stone-50 cursor-pointer ${i===49?'border-b-0':''}`}>
                  <td className="px-5 py-3 font-mono text-sm font-semibold text-brand-light">#{o.order_number}</td>
                  <td className="px-5 py-3 text-sm text-stone-700">{o.customer_name}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs text-stone-500 capitalize">{o.status?.replace('_',' ')}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-stone-500">
                    {o.subtotal ? '$' + Number(o.subtotal).toLocaleString('en-US',{maximumFractionDigits:0}) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-stone-400">
                    {o.order_date ? new Date(o.order_date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="divide-y divide-stone-50">
            {filteredActs.slice(0,50).map(a => (
              <div key={a.id} className="px-5 py-4 flex items-start gap-3 hover:bg-stone-50">
                <span className="text-base mt-0.5">{TYPE_ICONS[a.activity_type]}</span>
                <div className="flex-1 min-w-0">
                  {a.customers && <div className="text-xs font-semibold text-brand-light">{a.customers.account_name}</div>}
                  <div className="text-sm text-stone-700 mt-0.5">{a.subject || a.body?.slice(0,80) || '—'}</div>
                </div>
                <div className="text-xs text-stone-400 flex-shrink-0">{timeAgo(a.activity_date)}</div>
              </div>
            ))}
            {filteredActs.length === 0 && (
              <div className="p-8 text-center text-stone-400 text-sm">No activities logged yet</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
