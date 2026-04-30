import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AddToReorderModal from '../../components/AddToReorderModal'

const TYPE_CONFIG = {
  fabric:    { label: 'Fabrics',    icon: '🧻', color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  component: { label: 'Components', icon: '⚙️', color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  extrusion: { label: 'Extrusions', icon: '📏', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  blind:     { label: 'Faux Blinds',icon: '🪟', color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200' },
}

function StockBadge({ qty, reorder }) {
  if (qty === null || qty === undefined) return <span className="text-stone-300 text-xs">—</span>
  if (qty <= 0)                return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">OUT</span>
  if (reorder && qty <= reorder) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">LOW</span>
  return <span className="text-sm font-semibold text-stone-700">{Math.ceil(Number(qty)).toLocaleString()}</span>
}

export default function InventoryList() {
  const navigate = useNavigate()
  const [parts,   setParts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [type,    setType]    = useState('all')
  const [search,  setSearch]  = useState('')
  const [counts,  setCounts]  = useState({})
  const [reorderPart, setReorderPart] = useState(null)

  useEffect(() => { fetchParts() }, [type])

  async function fetchParts() {
    setLoading(true)
    let query = supabase
      .from('parts')
      .select('*')
      .eq('active', true)
      .order('name')
      .limit(500)

    if (type !== 'all') query = query.eq('part_type', type)

    const { data } = await query
    setParts(data || [])

    const { data: all } = await supabase.from('parts').select('part_type').eq('active', true)
    const c = { all: all?.length || 0 }
    all?.forEach(p => { c[p.part_type] = (c[p.part_type] || 0) + 1 })
    setCounts(c)
    setLoading(false)
  }

  const filtered = parts.filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      p.name?.toLowerCase().includes(s) ||
      p.vendor_id?.toLowerCase().includes(s) ||
      p.vendor_part_name?.toLowerCase().includes(s) ||
      p.vendor?.toLowerCase().includes(s)
    )
  })

  const lowStock  = filtered.filter(p => p.qty_on_hand > 0 && p.reorder_level && p.qty_on_hand <= p.reorder_level).length
  const outStock  = filtered.filter(p => p.qty_on_hand <= 0).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-stone-800">Inventory</h2>
          <p className="text-stone-400 text-sm mt-0.5">
            {counts.all || 0} parts tracked
            {outStock > 0 && <span className="text-red-500 ml-2">· {outStock} out of stock</span>}
            {lowStock > 0 && <span className="text-amber-500 ml-2">· {lowStock} low stock</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/purchasing/queue')}
            className="btn-ghost text-sm text-amber-700 border-amber-200 hover:bg-amber-50"
          >
            📦 Reorder Queue →
          </button>
          <button onClick={() => navigate('/inventory/containers')} className="btn-ghost text-sm">
            🚢 Containers →
          </button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setType('all')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
            type === 'all' ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
          }`}
        >
          All <span className="ml-1 opacity-60">{counts.all || 0}</span>
        </button>
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setType(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
              type === key
                ? `${cfg.bg} ${cfg.color} ${cfg.border}`
                : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
            }`}
          >
            <span>{cfg.icon}</span> {cfg.label}
            <span className="ml-1 opacity-60">{counts[key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, vendor ID, part name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-md"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-stone-400">Loading inventory...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">▦</div>
            <div className="text-stone-600 font-semibold mb-1">No parts found</div>
            <div className="text-stone-400 text-sm">Try a different search or filter</div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Part</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Vendor ID</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Vendor</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Type</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">On Hand</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Committed</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Available</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const cfg = TYPE_CONFIG[p.part_type] || TYPE_CONFIG.component
                const committed = parseFloat(p.qty_committed) || 0
                const available = (parseFloat(p.qty_on_hand) || 0) - committed
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-stone-50 transition-colors ${
                      i === filtered.length - 1 ? 'border-b-0' : ''
                    } ${p.qty_on_hand <= 0 ? 'opacity-60' : ''}`}
                  >
                    <td
                      className="px-4 py-3 cursor-pointer hover:text-brand-dark"
                      onClick={() => navigate(`/inventory/${p.id}`)}
                    >
                      <div className="font-medium text-stone-800">{p.name}</div>
                      {p.vendor_part_name && p.vendor_part_name !== p.name && (
                        <div className="text-stone-400 mt-0.5 truncate max-w-xs">{p.vendor_part_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/inventory/${p.id}`)}>
                      {p.vendor_id
                        ? <span className="font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">{p.vendor_id}</span>
                        : <span className="text-stone-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 cursor-pointer text-stone-500" onClick={() => navigate(`/inventory/${p.id}`)}>
                      {p.vendor || '—'}
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/inventory/${p.id}`)}>
                      <span className={`inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right cursor-pointer" onClick={() => navigate(`/inventory/${p.id}`)}>
                      <StockBadge qty={p.qty_on_hand} reorder={p.reorder_level} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {committed > 0
                        ? <span className="font-semibold text-amber-600">{Math.ceil(committed).toLocaleString()}</span>
                        : <span className="text-stone-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      {committed > 0
                        ? <span className={`font-semibold ${available <= 0 ? 'text-red-600' : available <= 10 ? 'text-amber-600' : 'text-green-700'}`}>
                            {Math.ceil(available).toLocaleString()}
                          </span>
                        : <span className="text-stone-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); setReorderPart(p) }}
                          className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
                        >
                          + Reorder
                        </button>
                        <span
                          className="text-stone-300 cursor-pointer"
                          onClick={() => navigate(`/inventory/${p.id}`)}
                        >→</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Reorder Modal */}
      {reorderPart && (
        <AddToReorderModal
          part={reorderPart}
          onClose={() => setReorderPart(null)}
          onAdded={() => setReorderPart(null)}
        />
      )}
    </div>
  )
}
