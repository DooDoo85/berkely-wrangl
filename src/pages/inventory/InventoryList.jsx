import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AddToReorderModal from '../../components/AddToReorderModal'
import FauxUsage from './FauxUsage'
import RackLocations from './RackLocations'
import TimberInventory from './TimberInventory'
import OffsiteFabric from './OffsiteFabric'

// =====================================================================
// InventoryList — operational page (page-mode = operational)
//
// Behaviors per partType:
//   • component   → category subtabs sourced from parts.category
//   • fabric      → grouped by family with visual section dividers
//   • blind       → flat list; size filter via search box
//   • extrusion   → flat list
//   • (no prop)   → all parts; type tabs visible
//
// Shared:
//   • Alerts pill in header → filters to stockouts + low-stock
//   • Hover-only reorder buttons
//   • OUT/LOW badges using semantic status pills
// =====================================================================

const TYPE_CONFIG = {
  fabric:    { label: 'Fabrics',    icon: '🧻', tone: 'gold'  },
  component: { label: 'Components', icon: '⚙️', tone: 'clay'  },
  extrusion: { label: 'Extrusions', icon: '📏', tone: 'clay'  },
  blind:     { label: 'Faux Blinds',icon: '🪟', tone: 'gold'  },
}

const COMPONENT_CATEGORY_ORDER = [
  'Motors', 'Clutches', 'Brackets', 'Bracket Covers', 'End Caps',
  'Hem Bar', 'Spline & Tape', 'Springs', 'Chain & Hardware',
  'Power & Cables', 'Remotes & Controls', 'Adapters & Plugs',
  'Cassette Hardware', 'Uncategorized',
]

function extractFabricFamily(name) {
  if (!name) return 'Other'
  const m = name.match(/^(.+?)\s+(BO|LF|TS|\d+%)\s+-\s+/i)
  if (m) return m[1].trim()
  const dash = name.indexOf(' - ')
  if (dash > 0) return name.substring(0, dash).trim()
  return name
}

// ─── Fabric rename map (display-only) ───────────────────────────────────
// Old names stay in the parts table and on existing orders / ePIC feeds —
// this only overlays the new naming on the Fabrics page. Fabrics NOT listed
// here keep their old name unchanged (we manage that stock until it runs
// out). Keyed on the full old "name - color" string, normalized the same
// way the ePIC fabric matcher does (strip accents, collapse spaces, upper).
const normFabric = (s) =>
  (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // drop accents (é → e)
    .replace(/\s+/g, ' ').trim().toUpperCase()

// [ old full name, new fabric, new color ]
const FABRIC_RENAMES = [
  ['Bordeaux LF - White',  'Coral Harbour L/F', 'Gesso'],
  ['Bordeaux LF - Beige',  'Coral Harbour L/F', 'Glaze'],
  ['Bordeaux LF - Gray',   'Coral Harbour L/F', 'Distortion'],
  ['Bordeaux LF - Shadow', 'Coral Harbour L/F', 'Vignette'],
  ['Bordeaux BO - White',  'Coral Harbour B/O', 'Dark Gesso'],
  ['Bordeaux BO - Beige',  'Coral Harbour B/O', 'Dark Glaze'],
  ['Bordeaux BO - Gray',   'Coral Harbour B/O', 'Dark Distortion'],
  ['Bordeaux BO - Shadow', 'Coral Harbour B/O', 'Dark Vignette'],
  ['La Rochelle LF - White', 'West End L/F', 'Angelic'],
  ['La Rochelle LF - Beige', 'West End L/F', 'Linen Tint'],
  ['La Rochelle LF - Taupe', 'West End L/F', 'Afterglow'],
  ['La Rochelle BO - White', 'West End B/O', 'Dark Angelic'],
  ['La Rochelle BO - Beige', 'West End B/O', 'Dark Linen Tint'],
  ['La Rochelle BO - Taupe', 'West End B/O', 'Dark Afterglow'],
  ['Versailles LF - White', 'Georgetown L/F', 'Cloudfall'],
  ['Versailles LF - Cream', 'Georgetown L/F', 'Winter Oak'],
  ['Versailles BO - White', 'Georgetown B/O', 'Dark Cloudfall'],
  ['Versailles BO - Cream', 'Georgetown B/O', 'Dark Winter Oak'],
  ['Versailles BO - Gray',  'Georgetown B/O', 'Dark Pike Lake'],
  ['Orléans 1% - Bright White', 'Solar Shade 1%', 'Snow'],
  ['Orléans 1% - White/White',  'Solar Shade 1%', 'Whtie'],
  ['Orléans 1% - White/Linen',  'Solar Shade 1%', 'Biege'],
  ['Orléans 1% - White/Gray',   'Solar Shade 1%', 'Smoke'],
  ['Orleans 1% - Tan/Tan',      'Solar Shade 1%', 'Dessert'],
  ['Orléans 1% - Gray/Gray',    'Solar Shade 1%', 'Ash'],
  ['Orléans 1% - Black/Bronze', 'Solar Shade 1%', 'Taupe'],
  ['Orléans 1% - Black/Gray',   'Solar Shade 1%', 'Graphite'],
  ['Orléans 1% - Black/Black',  'Solar Shade 1%', 'Storm'],
  ['Orléans 3% - Bright White', 'Solar Shade 3%', 'Snow'],
  ['Orléans 3% - White/White',  'Solar Shade 3%', 'Whtie'],
  ['Orléans 3% - White/Linen',  'Solar Shade 3%', 'Biege'],
  ['Orléans 3% - White/Gray',   'Solar Shade 3%', 'Smoke'],
  ['Orleans 3% - Tan/Tan',      'Solar Shade 3%', 'Dessert'],
  ['Orleans 3% - Gray/Gray',    'Solar Shade 3%', 'Ash'],
  ['Orléans 3% - Black/Bronze', 'Solar Shade 3%', 'Taupe'],
  ['Orléans 3% - Black/Gray',   'Solar Shade 3%', 'Graphite'],
  ['Orléans 3% - Black/Black',  'Solar Shade 3%', 'Storm'],
  ['Orléans 5% - Bright White', 'Solar Shade 5%', 'Snow'],
  ['Orléans 5% - White/White',  'Solar Shade 5%', 'Whtie'],
  ['Orléans 5% - White/Linen',  'Solar Shade 5%', 'Biege'],
  ['Orléans 5% - White/Gray',   'Solar Shade 5%', 'Smoke'],
  ['Orléans 5% - Tan/Tan',      'Solar Shade 5%', 'Dessert'],
  ['Orleans 5% - Gray/Gray',    'Solar Shade 5%', 'Ash'],
  ['Orléans 5% - Black/Bronze', 'Solar Shade 5%', 'Taupe'],
  ['Orléans 5% - Black/Gray',   'Solar Shade 5%', 'Graphite'],
  ['Orléans 5% - Black/Black',  'Solar Shade 5%', 'Storm'],
]
const FABRIC_MAP = new Map(
  FABRIC_RENAMES.map(([oldName, fab, color]) => [normFabric(oldName), { fab, color, newName: `${fab} - ${color}` }])
)
// Returns { newName, fab, color } if mapped, else null.
const lookupNewFabric = (oldName) => FABRIC_MAP.get(normFabric(oldName)) || null

// Family label for the divider: new fabric family if mapped, else old family.
function fabricFamilyLabel(name) {
  const mapped = lookupNewFabric(name)
  if (mapped) return { newFam: mapped.fab, oldFam: extractFabricFamily(name) }
  return { newFam: extractFabricFamily(name), oldFam: null }
}

function StockBadge({ qty, reorder }) {
  if (qty === null || qty === undefined) return <span className="text-ink-muted text-xs">—</span>
  if (qty <= 0) return <span className="pill-critical">OUT</span>
  if (reorder && qty <= reorder) return <span className="pill-warning">LOW</span>
  return <span className="text-sm font-semibold text-ink-strong tabular-nums">{Math.ceil(Number(qty)).toLocaleString()}</span>
}

// ── Faux Blinds hub — three tabs over one page ───────────────────────────
// Stock & Usage (FauxUsage dashboard) · Rack Locations · Timber Inventory.
// Each tab is a self-contained component; switching remounts (fresh fetch).
const FAUX_TABS = [
  ['stock',  'Stock & Usage'],
  ['racks',  'Rack Locations'],
  ['timber', 'Timber Inventory'],
]
const HUB_INK = '#2e2014'
const HUB_BORDER = 'rgba(92,67,42,0.14)'

function FauxBlindsHub() {
  const [tab, setTab] = useState('stock')
  return (
    <div>
      <div className="px-6 pt-4">
        <div className="inline-flex rounded-xl overflow-hidden" style={{ border: `1px solid ${HUB_BORDER}` }}>
          {FAUX_TABS.map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className="px-4 py-2 text-sm font-semibold transition-colors"
              style={tab === v
                ? { background: HUB_INK, color: '#f7f0e0' }
                : { background: '#fff', color: '#8c7758' }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {tab === 'stock'  && <FauxUsage />}
      {tab === 'racks'  && <RackLocations />}
      {tab === 'timber' && <TimberInventory />}
    </div>
  )
}

// ── Fabric hub — two tabs: the standard fabric list + Offsite Fabric ─────
const FABRIC_TABS = [
  ['stock',   'Fabric Stock'],
  ['offsite', 'Offsite Fabric'],
]

function FabricHub({ partType }) {
  const [tab, setTab] = useState('stock')
  return (
    <div>
      <div className="px-6 pt-4">
        <div className="inline-flex rounded-xl overflow-hidden" style={{ border: `1px solid ${HUB_BORDER}` }}>
          {FABRIC_TABS.map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className="px-4 py-2 text-sm font-semibold transition-colors"
              style={tab === v
                ? { background: HUB_INK, color: '#f7f0e0' }
                : { background: '#fff', color: '#8c7758' }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {tab === 'stock'   && <InventoryListBody partType={partType} />}
      {tab === 'offsite' && <OffsiteFabric />}
    </div>
  )
}

export default function InventoryList({ partType }) {
  // Faux Wood Blinds and Fabrics are hubs with tabs; everything else is the
  // plain list.
  if (partType === 'blind')  return <FauxBlindsHub />
  if (partType === 'fabric') return <FabricHub partType={partType} />
  return <InventoryListBody partType={partType} />
}

function InventoryListBody({ partType }) {
  const navigate = useNavigate()
  const [parts, setParts]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [type, setType]                 = useState(partType || 'all')
  const [search, setSearch]             = useState('')
  const [counts, setCounts]             = useState({})
  const [category, setCategory]         = useState('all')
  const [alertsOnly, setAlertsOnly]     = useState(false)
  const [reorderPart, setReorderPart]   = useState(null)

  const locked = !!partType

  useEffect(() => { if (partType) setType(partType) }, [partType])
  useEffect(() => {
    setCategory('all')
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

  const categoryCounts = useMemo(() => {
    if (type !== 'component') return {}
    const counts = { all: parts.length }
    for (const p of parts) {
      const cat = p.category || 'Uncategorized'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [parts, type])

  const filtered = useMemo(() => {
    let rows = parts

    if (type === 'component' && category !== 'all') {
      rows = rows.filter(p => (p.category || 'Uncategorized') === category)
    }

    if (alertsOnly) {
      rows = rows.filter(p =>
        p.qty_on_hand <= 0 ||
        (p.reorder_level && p.qty_on_hand <= p.reorder_level)
      )
    }

    if (search) {
      const s = search.toLowerCase()
      rows = rows.filter(p => {
        const mapped = p.part_type === 'fabric' ? lookupNewFabric(p.name) : null
        return (
          p.name?.toLowerCase().includes(s) ||
          p.vendor_id?.toLowerCase().includes(s) ||
          p.vendor_part_name?.toLowerCase().includes(s) ||
          p.vendor?.toLowerCase().includes(s) ||
          (mapped && mapped.newName.toLowerCase().includes(s))
        )
      })
    }

    return rows
  }, [parts, type, category, alertsOnly, search])

  const renderRows = useMemo(() => {
    if (type !== 'fabric') {
      return filtered.map(p => ({ kind: 'row', part: p }))
    }
    // Group by the NEW family when a fabric is mapped, else its old family,
    // so renamed colors cluster under their new fabric name.
    const famKey = (p) => fabricFamilyLabel(p.name).newFam
    const sorted = [...filtered].sort((a, b) => {
      const fa = famKey(a)
      const fb = famKey(b)
      if (fa !== fb) return fa.localeCompare(fb)
      return a.name.localeCompare(b.name)
    })
    const out = []
    let lastFamily = null
    for (const p of sorted) {
      const fam = famKey(p)
      if (fam !== lastFamily) {
        const { newFam, oldFam } = fabricFamilyLabel(p.name)
        out.push({
          kind: 'divider',
          family: newFam,
          oldFamily: oldFam,
          count: sorted.filter(x => famKey(x) === fam).length,
        })
        lastFamily = fam
      }
      out.push({ kind: 'row', part: p })
    }
    return out
  }, [filtered, type])

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
          <h1>{locked ? (TYPE_CONFIG[partType]?.label || 'Inventory') : 'Inventory'}</h1>
          <p className="text-sm text-ink-muted mt-1">
            {locked ? (counts[partType] || 0) : (counts.all || 0)} parts tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <button
              onClick={() => setAlertsOnly(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                alertsOnly
                  ? 'bg-status-critical text-ink-inverse border-status-critical'
                  : 'bg-status-critical-soft text-status-critical border-status-critical/30 hover:bg-status-critical/10'
              }`}
            >
              ⚠ {alertCount} Alert{alertCount === 1 ? '' : 's'}
              {alertsOnly && <span className="opacity-70">· clear</span>}
            </button>
          )}
          <button
            onClick={() => navigate('/purchasing/queue')}
            className="btn-ghost text-sm"
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
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              type === 'all'
                ? 'bg-ink-strong text-ink-inverse border-ink-strong'
                : 'bg-surface-card text-ink-mid border-surface-border hover:border-ink-muted'
            }`}
          >
            All <span className="ml-1 opacity-60">{counts.all || 0}</span>
          </button>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setType(key)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                type === key
                  ? `bg-accent-${cfg.tone}-soft text-accent-${cfg.tone === 'clay' ? 'clay' : 'gold'} border-accent-${cfg.tone}/40`
                  : 'bg-surface-card text-ink-mid border-surface-border hover:border-ink-muted'
              }`}
            >
              <span>{cfg.icon}</span> {cfg.label}
              <span className="ml-1 opacity-60">{counts[key] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {/* Category subtabs — components only */}
      {type === 'component' && (
        <div className="flex gap-1.5 mb-4 flex-wrap pb-3 border-b border-surface-border">
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
        <div className="flex items-center gap-2 mb-3 text-xs text-ink-mid">
          <span>Showing:</span>
          {alertsOnly && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-status-critical-soft text-status-critical rounded-full">
              Alerts only
              <button onClick={() => setAlertsOnly(false)} className="ml-1 hover:opacity-70">×</button>
            </span>
          )}
          {type === 'component' && category !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-clay-soft text-accent-clay rounded-full">
              {category}
              <button onClick={() => setCategory('all')} className="ml-1 hover:opacity-70">×</button>
            </span>
          )}
          <span className="text-ink-muted">· {filtered.length} part{filtered.length === 1 ? '' : 's'}</span>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-ink-muted">Loading inventory...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3 opacity-50">▦</div>
            <div className="text-ink-strong font-semibold mb-1">No parts found</div>
            <div className="text-ink-muted text-sm">Try a different search or filter</div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-border bg-surface-page/40">
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Part</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Vendor ID</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Vendor</th>
                {!locked && <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Type</th>}
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">On Hand</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Committed</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Available</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {renderRows.map((item) => {
                if (item.kind === 'divider') {
                  return (
                    <tr key={`div-${item.family}`} className="bg-accent-gold-soft border-t-2 border-accent-gold/50">
                      <td colSpan={locked ? 7 : 8} className="px-4 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-bold text-accent-gold uppercase tracking-wider">{item.family}</span>
                          {item.oldFamily && (
                            <span className="text-[10px] text-ink-muted normal-case tracking-normal">
                              (formerly {item.oldFamily})
                            </span>
                          )}
                          <span className="text-[10px] text-ink-muted">· {item.count} color{item.count === 1 ? '' : 's'}</span>
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
                    className={`group border-b border-surface-border-soft transition-colors hover:bg-surface-page/40 ${
                      p.qty_on_hand <= 0 ? 'opacity-70' : ''
                    }`}
                  >
                    <td
                      className="px-4 py-3 cursor-pointer hover:text-accent-clay"
                      onClick={() => navigate(`/inventory/${p.id}`)}
                    >
                      {(() => {
                        const mapped = p.part_type === 'fabric' ? lookupNewFabric(p.name) : null
                        if (mapped) {
                          return (
                            <>
                              <div className="font-medium text-ink-strong">{mapped.newName}</div>
                              <div className="text-ink-muted mt-0.5 text-[11px]">was: {p.name}</div>
                            </>
                          )
                        }
                        return (
                          <>
                            <div className="font-medium text-ink-strong">{p.name}</div>
                            {p.vendor_part_name && p.vendor_part_name !== p.name && (
                              <div className="text-ink-muted mt-0.5 truncate max-w-xs">{p.vendor_part_name}</div>
                            )}
                          </>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/inventory/${p.id}`)}>
                      {p.vendor_id
                        ? <span className="font-mono text-ink-mid bg-surface-page/60 px-1.5 py-0.5 rounded">{p.vendor_id}</span>
                        : <span className="text-ink-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 cursor-pointer text-ink-mid" onClick={() => navigate(`/inventory/${p.id}`)}>
                      {p.vendor || '—'}
                    </td>
                    {!locked && (
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/inventory/${p.id}`)}>
                        <span className={`inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-full text-[10px] bg-accent-${cfg.tone}-soft text-accent-${cfg.tone === 'clay' ? 'clay' : 'gold'} whitespace-nowrap`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right cursor-pointer tabular-nums" onClick={() => navigate(`/inventory/${p.id}`)}>
                      <StockBadge qty={p.qty_on_hand} reorder={p.reorder_level} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {committed > 0
                        ? <span className="font-semibold text-status-warning">{Math.ceil(committed).toLocaleString()}</span>
                        : <span className="text-ink-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {committed > 0
                        ? <span className={`font-semibold ${available <= 0 ? 'text-status-critical' : available <= 10 ? 'text-status-warning' : 'text-status-healthy'}`}>
                            {Math.ceil(available).toLocaleString()}
                          </span>
                        : <span className="text-ink-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); setReorderPart(p) }}
                          className="opacity-0 group-hover:opacity-100 font-semibold text-accent-clay bg-accent-clay-soft border border-accent-clay/30 px-2 py-1 rounded-lg hover:bg-accent-clay hover:text-ink-inverse transition-all whitespace-nowrap"
                        >
                          + Reorder
                        </button>
                        <span
                          className="text-ink-muted cursor-pointer"
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

function CategoryTab({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors whitespace-nowrap ${
        active
          ? 'bg-accent-clay text-ink-inverse border-accent-clay'
          : 'bg-surface-card text-ink-mid border-surface-border hover:border-ink-muted hover:bg-surface-page/40'
      }`}
    >
      {label} <span className={`ml-1 ${active ? 'opacity-80' : 'opacity-55'}`}>({count})</span>
    </button>
  )
}
