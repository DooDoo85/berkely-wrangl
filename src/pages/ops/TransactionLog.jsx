import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TYPE_CONFIG = {
  receive: { label: 'Receive', icon: '📥', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  commit:  { label: 'Commit',  icon: '✂️', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  adjust:  { label: 'Adjust',  icon: '⚖️', color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  return:  { label: 'Return',  icon: '↩️', color: 'text-purple-700',  bg: 'bg-purple-50',  border: 'border-purple-200'  },
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff/60000), hrs = Math.floor(diff/3600000), days = Math.floor(diff/86400000)
  if (mins < 60) return mins + 'm ago'
  if (hrs < 24)  return hrs + 'h ago'
  if (days < 7)  return days + 'd ago'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TransactionLog() {
  const navigate  = useNavigate()
  const [txns,    setTxns]    = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')
  const [search,  setSearch]  = useState('')

  useEffect(() => { fetchTxns() }, [filter])

  async function fetchTxns() {
    setLoading(true)
    let q = supabase
      .from('inventory_transactions')
      .select(`*,
        parts(name, unit_of_measure, part_type),
        orders(order_number, customer_name),
        containers(name),
        profiles(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(150)

    if (filter !== 'all') q = q.eq('transaction_type', filter)
    const { data } = await q
    setTxns(data || [])
    setLoading(false)
  }

  const filtered = txns.filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      t.parts?.name?.toLowerCase().includes(s) ||
      t.orders?.order_number?.toLowerCase().includes(s) ||
      t.orders?.customer_name?.toLowerCase().includes(s) ||
      t.reason?.toLowerCase().includes(s) ||
      t.notes?.toLowerCase().includes(s)
    )
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/ops')} className="btn-ghost text-sm">← Ops</button>
          <h2 className="text-2xl font-display font-bold text-stone-800">Transaction Log</h2>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1">
          {['all', 'receive', 'commit', 'adjust'].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                filter === t ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
              }`}>
              {t !== 'all' && TYPE_CONFIG[t]?.icon} {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Search part, order, notes..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input max-w-xs" />
      </div>

      {/* Log */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-stone-400">Loading transactions...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-stone-600 font-semibold mb-1">No transactions yet</div>
            <div className="text-stone-400 text-sm">Receive, commit, or adjust inventory to see history here</div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Type</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Part</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Ref</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Qty</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">By</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const cfg = TYPE_CONFIG[t.transaction_type] || TYPE_CONFIG.adjust
                const isNeg = t.quantity < 0
                return (
                  <tr key={t.id} className={`border-b border-stone-50 ${i === filtered.length-1 ? 'border-b-0' : ''}`}>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-sm font-medium text-stone-700">{t.parts?.name || '—'}</div>
                      {t.notes && <div className="text-xs text-stone-400 mt-0.5">{t.notes}</div>}
                      {t.reason && <div className="text-xs text-stone-400 mt-0.5">{t.reason}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      {t.orders && (
                        <button onClick={() => navigate(`/orders/${t.order_id}`)}
                          className="text-xs font-semibold text-brand-light hover:text-brand-mid">
                          Order #{t.orders.order_number}
                        </button>
                      )}
                      {t.containers && (
                        <span className="text-xs text-stone-500">{t.containers.name}</span>
                      )}
                      {!t.orders && !t.containers && <span className="text-stone-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-sm font-bold ${isNeg ? 'text-red-500' : 'text-emerald-600'}`}>
                        {isNeg ? '' : '+'}{t.quantity} {t.parts?.unit_of_measure || ''}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-stone-400">{t.profiles?.full_name?.split(' ')[0] || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-xs text-stone-400">{timeAgo(t.created_at)}</span>
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
