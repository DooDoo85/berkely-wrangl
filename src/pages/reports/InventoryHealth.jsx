import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TYPE_CONFIG = {
  fabric:    { label: 'Fabric',     icon: '🧻' },
  component: { label: 'Component',  icon: '⚙️' },
  extrusion: { label: 'Extrusion',  icon: '📏' },
  blind:     { label: 'Faux Blind', icon: '🪟' },
}

export default function InventoryHealth() {
  const navigate  = useNavigate()
  const [out,     setOut]     = useState([])
  const [low,     setLow]     = useState([])
  const [counts,  setCounts]  = useState({})
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('out')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [outRes, lowRes, allRes] = await Promise.all([
      supabase.from('parts').select('id, name, part_type, vendor, vendor_id, qty_on_hand, reorder_level, unit_of_measure')
        .eq('active', true).eq('qty_on_hand', 0).order('part_type').order('name'),
      supabase.from('parts').select('id, name, part_type, vendor, vendor_id, qty_on_hand, reorder_level, unit_of_measure')
        .eq('active', true).gt('qty_on_hand', 0).not('reorder_level', 'is', null).order('part_type').order('name'),
      supabase.from('parts').select('part_type, qty_on_hand, reorder_level').eq('active', true),
    ])

    const lowFiltered = (lowRes.data || []).filter(p => p.qty_on_hand <= p.reorder_level)
    setOut(outRes.data || [])
    setLow(lowFiltered)

    // Counts by type
    const c = { total: 0, out: 0, low: 0, healthy: 0 }
    const types = {}
    allRes.data?.forEach(p => {
      c.total++
      if (p.qty_on_hand <= 0)                                    { c.out++;     }
      else if (p.reorder_level && p.qty_on_hand <= p.reorder_level) { c.low++;  }
      else                                                           { c.healthy++; }
      types[p.part_type] = (types[p.part_type] || { total:0, out:0, low:0 })
      types[p.part_type].total++
      if (p.qty_on_hand <= 0) types[p.part_type].out++
      else if (p.reorder_level && p.qty_on_hand <= p.reorder_level) types[p.part_type].low++
    })
    setCounts({ ...c, types })
    setLoading(false)
  }

  const displayList = tab === 'out' ? out : low

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/reports')} className="btn-ghost text-sm">← Reports</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Inventory Health</h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card p-4 text-center">
          <div className="text-3xl font-display font-bold text-stone-800 mb-1">{loading ? '—' : counts.total}</div>
          <div className="text-xs text-stone-400 font-semibold uppercase tracking-wide">Total Parts</div>
        </div>
        <div className="card p-4 text-center bg-emerald-50 border-emerald-200">
          <div className="text-3xl font-display font-bold text-emerald-600 mb-1">{loading ? '—' : counts.healthy}</div>
          <div className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Healthy</div>
        </div>
        <div className="card p-4 text-center bg-amber-50 border-amber-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setTab('low')}>
          <div className="text-3xl font-display font-bold text-amber-600 mb-1">{loading ? '—' : counts.low}</div>
          <div className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Low Stock</div>
        </div>
        <div className="card p-4 text-center bg-red-50 border-red-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setTab('out')}>
          <div className="text-3xl font-display font-bold text-red-500 mb-1">{loading ? '—' : counts.out}</div>
          <div className="text-xs text-red-500 font-semibold uppercase tracking-wide">Out of Stock</div>
        </div>
      </div>

      {/* By type breakdown */}
      {counts.types && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
            const t = counts.types?.[key] || { total: 0, out: 0, low: 0 }
            return (
              <div key={key} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span>{cfg.icon}</span>
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">{cfg.label}</span>
                </div>
                <div className="text-lg font-display font-bold text-stone-700">{t.total}</div>
                <div className="text-xs text-stone-400 mt-1 space-y-0.5">
                  {t.out > 0 && <div className="text-red-500">{t.out} out of stock</div>}
                  {t.low > 0 && <div className="text-amber-500">{t.low} low stock</div>}
                  {t.out === 0 && t.low === 0 && <div className="text-emerald-500">All healthy</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tab list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={() => setTab('out')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                tab === 'out' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-stone-500 border-stone-200'
              }`}>
              Out of Stock ({out.length})
            </button>
            <button onClick={() => setTab('low')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                tab === 'low' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-stone-500 border-stone-200'
              }`}>
              Low Stock ({low.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-stone-400">Loading...</div>
        ) : displayList.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-2xl mb-2">✅</div>
            <div className="text-stone-600 font-semibold text-sm">
              {tab === 'out' ? 'No out of stock items' : 'No low stock items'}
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Part</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Type</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Vendor</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">On Hand</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Reorder At</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((p, i) => {
                const cfg = TYPE_CONFIG[p.part_type] || TYPE_CONFIG.component
                return (
                  <tr key={p.id} onClick={() => navigate(`/inventory/${p.id}`)}
                    className={`border-b border-stone-50 hover:bg-stone-50 cursor-pointer ${i===displayList.length-1?'border-b-0':''}`}>
                    <td className="px-5 py-3.5">
                      <div className="text-sm font-medium text-stone-800">{p.name}</div>
                      {p.vendor_id && <div className="text-xs font-mono text-stone-400 mt-0.5">{p.vendor_id}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-stone-500">{cfg.icon} {cfg.label}</td>
                    <td className="px-5 py-3.5 text-sm text-stone-500">{p.vendor || '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-sm font-bold ${p.qty_on_hand <= 0 ? 'text-red-500' : 'text-amber-600'}`}>
                        {p.qty_on_hand} {p.unit_of_measure}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-stone-400">
                      {p.reorder_level || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button onClick={e => { e.stopPropagation(); navigate('/ops/receive') }}
                        className="text-xs font-semibold text-brand-gold hover:text-amber-600">
                        Receive →
                      </button>
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
