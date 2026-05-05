import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ProductionHome() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    stuckOrders: [], productionLoad: {}, activeCount: 0,
    lowStock: [], outStock: [],
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // WIP data — stuck orders + production load
      const { data: wipData } = await supabase
        .from('roller_wip')
        .select('*')
        .order('days_in_status', { ascending: false })

      const stuckOrders = (wipData ?? [])
        .filter(w => ['CREDIT OK', 'PO SENT', 'PRINTED'].includes(w.order_status) && (w.days_in_status ?? 0) > 5)
        .sort((a, b) => (b.days_in_status ?? 0) - (a.days_in_status ?? 0))
        .slice(0, 8)

      const productionLoad = (wipData ?? []).reduce((acc, w) => {
        acc[w.order_status] = (acc[w.order_status] ?? 0) + 1
        return acc
      }, {})

      const activeCount = (wipData ?? []).length

      // Low/out of stock alerts — fabrics and extrusions only
      const { data: parts } = await supabase
        .from('parts')
        .select('id, name, part_type, qty_on_hand, reorder_level')
        .eq('active', true)
        .in('part_type', ['fabric', 'extrusion', 'component'])
        .order('qty_on_hand', { ascending: true })
        .limit(500)

      const outStock = (parts ?? []).filter(p => (p.qty_on_hand ?? 0) <= 0).slice(0, 5)
      const lowStock = (parts ?? []).filter(p =>
        p.qty_on_hand > 0 && p.reorder_level && p.qty_on_hand <= p.reorder_level
      ).slice(0, 5)

      setData({ stuckOrders, productionLoad, activeCount, lowStock, outStock })
    } catch (err) {
      console.error('ProductionHome:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const TYPE_LABEL = { fabric: 'Fabric', component: 'Component', extrusion: 'Extrusion' }

  if (loading) return <div className="p-8 text-stone-400 text-sm">Loading...</div>

  const stuckTotal = data.stuckOrders.length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header + Start Production */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-stone-800">Production</h1>
          <p className="text-sm text-stone-400 mt-0.5">
            {data.activeCount} orders in the pipeline
          </p>
        </div>
        <button
          onClick={() => navigate('/ops/production')}
          className="flex items-center gap-2 px-6 py-3 bg-brand-dark text-white font-semibold rounded-xl hover:bg-brand-dark/90 transition-colors text-sm"
        >
          ▶ Start Production
        </button>
      </div>

      {/* ── Stuck Orders + Production Load ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Stuck Orders */}
        <div className={`rounded-xl border ${stuckTotal > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-stone-200'} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-bold ${stuckTotal > 0 ? 'text-red-700' : 'text-stone-800'}`}>Stuck Orders</h3>
              {stuckTotal > 0 && (
                <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {stuckTotal} flagged
                </span>
              )}
            </div>
          </div>
          {stuckTotal === 0 ? (
            <p className="text-sm text-stone-400 text-center py-4">All clear ✓</p>
          ) : (
            <div className="space-y-1">
              {data.stuckOrders.map(o => (
                <div key={o.wo}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-red-100/40 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{o.order_no}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{o.customer ?? '—'} · {o.order_status?.toLowerCase()}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    (o.days_in_status ?? 0) >= 8 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    Day {o.days_in_status ?? 0}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Production Load */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-stone-800">Production Load</h3>
            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wide">
              {data.activeCount} active
            </span>
          </div>
          {[
            { label: 'Credit OK', key: 'CREDIT OK', color: 'bg-emerald-500' },
            { label: 'PO Sent',   key: 'PO SENT',   color: 'bg-cyan-500'    },
            { label: 'Printed',   key: 'PRINTED',    color: 'bg-amber-500'   },
          ].map(({ label, key, color }) => {
            const count = data.productionLoad[key] ?? 0
            const pct = data.activeCount > 0 ? (count / data.activeCount) * 100 : 0
            return (
              <div key={key} className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-stone-600">{label}</span>
                  <span className="text-sm font-bold text-stone-800">{count}</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-2">
                  <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Inventory Alerts ──────────────────────────────────────────── */}
      {(data.outStock.length > 0 || data.lowStock.length > 0) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Out of Stock */}
          {data.outStock.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-red-700">Out of Stock</h3>
                <button onClick={() => navigate('/inventory')} className="text-xs text-red-600 hover:text-red-800">
                  View all →
                </button>
              </div>
              <div className="space-y-2">
                {data.outStock.map(p => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-xs text-stone-700 truncate flex-1 mr-2">{p.name}</span>
                    <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
                      {TYPE_LABEL[p.part_type] || p.part_type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low Stock */}
          {data.lowStock.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-amber-700">Low Stock</h3>
                <button onClick={() => navigate('/inventory')} className="text-xs text-amber-600 hover:text-amber-800">
                  View all →
                </button>
              </div>
              <div className="space-y-2">
                {data.lowStock.map(p => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-xs text-stone-700 truncate flex-1 mr-2">{p.name}</span>
                    <span className="text-xs font-mono font-semibold text-amber-700">
                      {Math.floor(p.qty_on_hand).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quick Links ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <button onClick={() => navigate('/ops/production')}
          className="card p-4 text-left border-2 border-stone-200 hover:border-amber-400 hover:bg-amber-50 transition-all">
          <div className="text-2xl mb-2">▶️</div>
          <div className="text-sm font-bold text-stone-800">Start Production</div>
          <div className="text-xs text-stone-400 mt-0.5">Look up order, cut fabric</div>
        </button>
        <button onClick={() => navigate('/orders/on-hold')}
          className="card p-4 text-left border-2 border-stone-200 hover:border-red-300 hover:bg-red-50 transition-all">
          <div className="text-2xl mb-2">⏸️</div>
          <div className="text-sm font-bold text-stone-800">Orders on Hold</div>
          <div className="text-xs text-stone-400 mt-0.5">Review and release holds</div>
        </button>
        <button onClick={() => navigate('/purchasing/queue')}
          className="card p-4 text-left border-2 border-stone-200 hover:border-purple-300 hover:bg-purple-50 transition-all">
          <div className="text-2xl mb-2">🛒</div>
          <div className="text-sm font-bold text-stone-800">Reorder Queue</div>
          <div className="text-xs text-stone-400 mt-0.5">Add items to reorder</div>
        </button>
      </div>
    </div>
  )
}
