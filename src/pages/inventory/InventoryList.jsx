import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AddToReorderModal from '../../components/AddToReorderModal'

// =====================================================================
// InventoryList — unified view for all part types
//
// Behaviors per partType:
//   • component   → category subtabs (Motors, Clutches, Brackets…)
//                   sourced from parts.category column
//   • fabric      → grouped by family with visual section dividers
//                   family extracted from name pattern
//   • blind       → flat list; size filter handled via search box
//   • extrusion   → flat list (existing behavior)
//   • (no prop)   → all parts; type tabs visible
//
// Shared across all views:
//   • Alerts pill in header → filters to stockouts + low-stock
//   • Hover-only reorder buttons
//   • OUT/LOW badges
//   • Color-coded Committed/Available
// =====================================================================

const TYPE_CONFIG = {
  fabric:    { label: 'Fabrics',    icon: '🧻', color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  component: { label: 'Components', icon: '⚙️', color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  extrusion: { label: 'Extrusions', icon: '📏', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  blind:     { label: 'Faux Blinds',icon: '🪟', color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200' },
}

// Category order matches ShadeTrack — most-used first
const COMPONENT_CATEGORY_ORDER = [
  'Motors',
  'Clutches',
  'Brackets',
  'Bracket Covers',
  'End Caps',
  'Hem Bar',
  'Spline & Tape',
  'Springs',
  'Chain & Hardware',
  'Power & Cables',
  'Remotes & Controls',
  'Adapters & Plugs',
  'Cassette Hardware',
  'Uncategorized',
]

// Extract fabric family from name patterns like:
//   "Bordeaux BO - Beige"           → "Bordeaux"
//   "La Rochelle LF - Beige"        → "La Rochelle"
//   "Le Mans 3% - Black"            → "Le Mans"
//   "Lorient 1% - White/Gray"       → "Lorient"
function extractFabricFamily(name) {
  if (!name) return 'Other'
  const m = name.match(/^(.+?)\s+(BO|LF|TS|\d+%)\s+-\s+/i)
  if (m) return m[1].trim()
  const dash = name.indexOf(' - ')
  if (dash > 0) return name.substring(0, dash).trim()
  return name
}

function StockBadge({ qty, reorder }) {
  if (qty === null || qty === undefined) return <span className="text-stone-300 text-xs">—</span>
  if (qty <= 0) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">OUT</span>
  if (reorder && qty <= reorder) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">LOW</span>
  return <span className="text-sm font-semibold text-stone-700">{Math.ceil(Number(qty)).toLocaleString()}</span>
}

export default function InventoryList({ partType }) {
  const navigate = useNavigate()
  const [parts, setParts]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [type, setType]                 = useState(partType || 'all')
  const [search, setSearch]             = useState('')
  const [counts, setCounts]             = useState({})
  const [category, setCategory]         = useState('all')      // component subtab
  const [alertsOnly, setAlertsOnly]     = useState(false)
  const [reorderPart, setReorderPart]   = useState(null)

  const locked = !!partType

  useEffect(() => { if (partType) setType(partType) }, [partType])
  useEffect(() => {
    setCategory('all')           // reset subtab when switching types
    fetchParts()
  }, [type])

  async function fetchParts() {
    setLoading(true)
    let query = supabase
      .from('parts')
      .select('*')
      .eq('active', true)
      .order('name')
      .limit(1000)

    if (type !== 'all') query = query.eq('part_type', type)

    const { data } = await query
    setParts(data || [])

    const { data: all } = await supabase.from('parts').select('part_type').eq('active', true)
    const c = { all: all?.length || 0 }
    all?.forEach(p => { c[p.part_type] = (c[p.part_type] || 0) + 1 })
    setCounts(c)
    setLoading(false)
  }

  // ─── Derived: category counts (component subtabs) ────────────────────────
  const categoryCounts = useMemo(() => {
    if (type !== 'component') return {}
    const counts = { all: parts.length }
    for (const p of parts) {
      const cat = p.category || 'Uncategorized'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [parts, type])

  // ─── Filtering pipeline ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = parts

    // Category subtab (components only)
    if (type === 'component' && category !== 'all') {
      rows = rows.filter(p => (p.category || 'Uncategorized') === category)
    }

    // Alerts filter
    if (alertsOnly) {
      rows = rows.filter(p =>
        p.qty_on_hand <= 0 ||
        (p.reorder_level && p.qty_on_hand <= p.reorder_level)
      )
    }

    // Search
    if (search) {
      const s = search.toLowerCase()
      rows = rows.filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.vendor_id?.toLowerCase().includes(s) ||
        p.vendor_part_name?.toLowerCase().includes(s) ||
        p.vendor?.toLowerCase().includes(s)
      )
    }

    return rows
  }, [parts, type, category, alertsOnly, search])

  // ─── Fabric grouping (insert family dividers) ────────────────────────────
  const renderRows = useMemo(() => {
    if (type !== 'fabric') {
      return filtered.map(p => ({ kind: 'row', part: p }))
    }
    // Sort by family then name, inject divider rows
    const sorted = [...filtered].sort((a, b) => {
      const fa = extractFabricFamily(a.name)
      const fb = extractFabricFamily(b.name)
      if (fa !== fb) return fa.localeCompare(fb)
      return a.name.localeCompare(b.name)
    })
    const out = []
    let lastFamily = null
    for (const p of sorted) {
      const fam = extractFabricFamily(p.name)
      if (fam !== lastFamily) {
        out.push({ kind: 'divider', family: fam, count: sorted.filter(x => extractFabricFamily(x.name) === fam).length })
        lastFamily = fam
      }
      out.push({ kind: 'row', part: p })
    }
    return out
  }, [filtered, type])

  // ─── Alert counts (for header pill) ──────────────────────────────────────
  const alertCount = useMemo(() => {
    let base = parts
    if (type === 'component' && category !== 'all') {
      base = parts.filter(p => (p.category || 'Uncategorized') === category)
    }
    return base.filter(p =>
      p.qty_on_hand <= 0 ||
      (p.reorder_level && p.qty_on_hand <= p.reorder_level)
    ).length
  }, [parts, type, category])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-stone-800">
            {locked ? (TYPE_CONFIG[partType]?.label || 'Inventory') : 'Inventory'}
          </h2>
          <p className="text-stone-400 text-sm mt-0.5">
            {locked ? (counts[partType] || 0) : (counts.all || 0)} parts tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <button
              onClick={() => setAlertsOnly(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                alertsOnly
                  ? 'bg-red-600 text-white border-red-700 hover:bg-red-700'
                  : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
              }`}
            >
              ⚠ {alertCount} Alert{alertCount === 1 ? '' : 's'}
              {alertsOnly && <span className="opacity-70">· clear</span>}
            </button>
          )}
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

      {/* Type tabs — hidden when locked to a specific type */}
      {!locked && (
        <div className="flex gap-2 mb-4 flex-wrap">
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
      )}

      {/* Category subtabs — only when viewing components */}
      {type === 'component' && (
        <div className="flex gap-1.5 mb-4 flex-wrap pb-3 border-b border-stone-100">
          <CategoryTab
            label="All"
            count={categoryCounts.all || 0}
            active={category === 'all'}
            onClick={() => setCategory('all')}
          />
          {COMPONENT_CATEGORY_ORDER.map(cat => (
            categoryCounts[cat] > 0 && (
              <CategoryTab
                key={cat}
                label={cat}
                count={categoryCounts[cat]}
                active={category === cat}
                onClick={() => setCategory(cat)}
              />
            )
          ))}
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder={
            type === 'blind' ? 'Filter by size (e.g. 36 x 84)...' :
            'Search by name, vendor ID, part name...'
          }
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-md"
        />
      </div>

      {/* Active filter chips */}
      {(alertsOnly || (type === 'component' && category !== 'all')) && (
        <div className="flex items-center gap-2 mb-3 text-xs text-stone-500">
          <span>Showing:</span>
          {alertsOnly && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 rounded-full">
              Alerts only
              <button onClick={() => setAlertsOnly(false)} className="ml-1 hover:text-red-900">×</button>
            </span>
          )}
          {type === 'component' && category !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
              {category}
              <button onClick={() => setCategory('all')} className="ml-1 hover:text-blue-900">×</button>
            </span>
          )}
          <span className="text-stone-400">· {filtered.length} part{filtered.length === 1 ? '' : 's'}</span>
        </div>
      )}

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
                {!locked && <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Type</th>}
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">On Hand</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Committed</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Available</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {renderRows.map((item, i) => {
                if (item.kind === 'divider') {
                  return (
                    <tr key={`div-${item.family}`} className="bg-stone-50 border-y border-stone-200">
                      <td colSpan={locked ? 7 : 8} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-stone-700 uppercase tracking-wider">{item.family}</span>
                          <span className="text-[10px] text-stone-400">· {item.count} color{item.count === 1 ? '' : 's'}</span>
                        </div>
                      </td>
                    </tr>
                  )
                }

                const p = item.part
                const cfg = TYPE_CONFIG[p.part_type] || TYPE_CONFIG.component
                const committed = parseFloat(p.qty_committed) || 0
                const available = (parseFloat(p.qty_on_hand) || 0) - committed
                return (
                  <tr
                    key={p.id}
                    className={`group border-b border-stone-50 transition-colors hover:bg-stone-50 ${
                      p.qty_on_hand <= 0 ? 'opacity-70' : ''
                    }`}
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
                        : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-4 py-3 cursor-pointer text-stone-500" onClick={() => navigate(`/inventory/${p.id}`)}>
                      {p.vendor || '—'}
                    </td>
                    {!locked && (
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/inventory/${p.id}`)}>
                        <span className={`inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right cursor-pointer" onClick={() => navigate(`/inventory/${p.id}`)}>
                      <StockBadge qty={p.qty_on_hand} reorder={p.reorder_level} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {committed > 0
                        ? <span className="font-semibold text-amber-600">{Math.ceil(committed).toLocaleString()}</span>
                        : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {committed > 0
                        ? <span className={`font-semibold ${available <= 0 ? 'text-red-600' : available <= 10 ? 'text-amber-600' : 'text-green-700'}`}>
                            {Math.ceil(available).toLocaleString()}
                          </span>
                        : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); setReorderPart(p) }}
                          className="opacity-0 group-hover:opacity-100 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-100 transition-opacity whitespace-nowrap"
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

// ─── Subcomponents ─────────────────────────────────────────────────────────
function CategoryTab({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all whitespace-nowrap ${
        active
          ? 'bg-blue-600 text-white border-blue-700'
          : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300 hover:bg-stone-50'
      }`}
    >
      {label} <span className={`ml-1 ${active ? 'opacity-80' : 'opacity-50'}`}>({count})</span>
    </button>
  )
}
