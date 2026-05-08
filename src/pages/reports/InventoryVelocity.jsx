import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TIME_WINDOWS = {
  '7':  { label: 'Last 7 days',  days: 7  },
  '30': { label: 'Last 30 days', days: 30 },
  '90': { label: 'Last 90 days', days: 90 },
}

const PART_TYPES = [
  { value: 'all',       label: 'All Parts' },
  { value: 'fabric',    label: 'Fabric' },
  { value: 'component', label: 'Component' },
  { value: 'extrusion', label: 'Extrusion' },
  { value: 'blind',     label: 'Faux Blinds' },
]

const SOURCE_FILTERS = [
  { value: 'all',          label: 'All sources' },
  { value: 'wrangl',       label: 'Wrangl velocity only' },
  { value: 'pic_baseline', label: 'Priming on PIC only' },
  { value: 'baselined',    label: 'Has any baseline' },
]

const STATUS_CONFIG = {
  stockout:  { label: 'Stockout',   bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700' },
  at_risk:   { label: 'At Risk',    bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700' },
  healthy:   { label: 'Healthy',    bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200',badge: 'bg-emerald-100 text-emerald-700' },
  no_usage:  { label: 'No Usage',   bg: 'bg-stone-50',  text: 'text-stone-600',  border: 'border-stone-200',  badge: 'bg-stone-100 text-stone-600' },
}

const PART_TYPE_LABEL = {
  fabric:    'Fabric',
  component: 'Component',
  extrusion: 'Extrusion',
  blind:     'Faux',
}

const TIER_BADGE = {
  A: 'bg-amber-100 text-amber-800 border border-amber-200',
  B: 'bg-stone-100 text-stone-700 border border-stone-200',
  C: 'bg-stone-50  text-stone-500 border border-stone-200',
}

const SOURCE_BADGE = {
  wrangl:       { label: 'WRANGL',  cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  pic_baseline: { label: 'PIC',     cls: 'bg-amber-50  text-amber-700  border border-amber-200' },
  none:         { label: '—',       cls: 'bg-stone-50  text-stone-400  border border-stone-200' },
}

export default function InventoryVelocity() {
  const navigate = useNavigate()
  const [windowKey, setWindowKey]       = useState('30')
  const [partType, setPartType]         = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortBy, setSortBy]             = useState('days_supply')
  const [data, setData]                 = useState([])
  const [loading, setLoading]           = useState(true)

  useEffect(() => { load() }, [windowKey, partType])

  async function load() {
    setLoading(true)
    const days   = TIME_WINDOWS[windowKey].days
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()

    // Pull from the effective-velocity view: gives us parts + velocity columns
    // + the engine's per-part decision (wrangl vs pic_baseline) in one shot.
    let velocityQuery = supabase
      .from('v_part_effective_velocity')
      .select(`
        part_id, name, part_type, vendor, vendor_part_number,
        qty_on_hand, qty_committed, qty_available,
        velocity_3mo_avg, pic_baseline_velocity, velocity_cv, velocity_tier,
        wrangl_velocity_30d, wrangl_velocity_90d, wrangl_txn_count_90d,
        wrangl_first_seen, wrangl_data_sufficient,
        effective_velocity, velocity_source, velocity_trend_pct
      `)
    if (partType !== 'all') velocityQuery = velocityQuery.eq('part_type', partType)
    const { data: vparts } = await velocityQuery

    // Window-scoped outflow (kept so the user can still see burn rate at 7/90d)
    const { data: txns } = await supabase
      .from('inventory_transactions')
      .select('part_id, transaction_type, quantity, created_at')
      .gte('created_at', cutoff)
      .neq('transaction_type', 'receive')

    const outflowMap = {}
    ;(txns || []).forEach(t => {
      const qty = Number(t.quantity) || 0
      if (t.transaction_type === 'adjust' && qty > 0) return
      outflowMap[t.part_id] = (outflowMap[t.part_id] || 0) + Math.abs(qty)
    })

    const rows = (vparts || []).map(p => {
      const used        = outflowMap[p.part_id] || 0
      const winAvg      = used / days
      const onHand      = Number(p.qty_on_hand || 0)
      const committed   = Number(p.qty_committed || 0)
      const available   = Number(p.qty_available || 0)

      // Engine velocity is the source of truth for "days of supply"
      const effVel      = Number(p.effective_velocity || 0)
      const daysSupply  = effVel > 0 ? available / effVel : Infinity

      let status
      if (onHand <= 0)            status = 'stockout'
      else if (effVel <= 0
            && used === 0)        status = 'no_usage'
      else if (daysSupply < 7)    status = 'at_risk'
      else                        status = 'healthy'

      return {
        ...p,
        id:          p.part_id,    // keep .id for navigate(`/inventory/${id}`)
        on_hand:     onHand,
        committed,
        available,
        used,
        avg_per_day: winAvg,
        days_supply: daysSupply,
        status,
      }
    })

    setData(rows)
    setLoading(false)
  }

  // Source filter (client-side; keeps load() simple)
  const sourceFiltered = data.filter(r => {
    if (sourceFilter === 'all')          return true
    if (sourceFilter === 'wrangl')       return r.velocity_source === 'wrangl'
    if (sourceFilter === 'pic_baseline') return r.velocity_source === 'pic_baseline'
    if (sourceFilter === 'baselined')    return r.velocity_source !== 'none'
    return true
  })

  // Sorting
  const SORT_ORDER = { stockout: 0, at_risk: 1, healthy: 2, no_usage: 3 }
  const sorted = [...sourceFiltered].sort((a, b) => {
    if (sortBy === 'velocity') return (b.effective_velocity || 0) - (a.effective_velocity || 0)
    if (sortBy === 'days_supply') {
      if (SORT_ORDER[a.status] !== SORT_ORDER[b.status]) return SORT_ORDER[a.status] - SORT_ORDER[b.status]
      const aDays = isFinite(a.days_supply) ? a.days_supply : Number.MAX_VALUE
      const bDays = isFinite(b.days_supply) ? b.days_supply : Number.MAX_VALUE
      return aDays - bDays
    }
    return a.name.localeCompare(b.name)
  })

  // Summary stats
  const stats = {
    stockouts: sourceFiltered.filter(r => r.status === 'stockout').length,
    at_risk:   sourceFiltered.filter(r => r.status === 'at_risk').length,
    no_usage:  sourceFiltered.filter(r => r.status === 'no_usage').length,
    on_wrangl: data.filter(r => r.velocity_source === 'wrangl').length,
    on_pic:    data.filter(r => r.velocity_source === 'pic_baseline').length,
    no_base:   data.filter(r => r.velocity_source === 'none').length,
    total:     data.length,
  }

  // CSV export
  function exportCSV() {
    const winLabel = TIME_WINDOWS[windowKey].label
    const headers = [
      'Part Name','Type','Vendor','Tier','On Hand','Committed','Available',
      `Used (${winLabel})`,'Win Avg/Day',
      'Wrangl 30d/Wk','PIC Baseline/Wk','Effective/Wk','Source','Trend %',
      'Days Supply','Status',
    ]
    const rows = sorted.map(r => [
      r.name,
      PART_TYPE_LABEL[r.part_type] || r.part_type,
      r.vendor || '',
      r.velocity_tier || '',
      r.on_hand,
      r.committed,
      r.available,
      r.used,
      r.avg_per_day.toFixed(2),
      (Number(r.wrangl_velocity_30d || 0) * 7).toFixed(2),
      (Number(r.pic_baseline_velocity || 0) * 7).toFixed(2),
      (Number(r.effective_velocity   || 0) * 7).toFixed(2),
      r.velocity_source || 'none',
      r.velocity_trend_pct == null ? '' : r.velocity_trend_pct,
      isFinite(r.days_supply) ? Math.round(r.days_supply) : '∞',
      STATUS_CONFIG[r.status]?.label || r.status,
    ])
    const csv = [headers, ...rows].map(row =>
      row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const filterPart = partType === 'all' ? 'all' : partType
    const today = new Date().toISOString().slice(0, 10)
    a.download = `inventory-velocity-${filterPart}-${windowKey}d-${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Trend renderer
  function renderTrend(pct) {
    if (pct == null) return <span className="text-stone-300">—</span>
    if (pct >= 5)    return <span className="text-emerald-700 font-medium">▲ +{pct}%</span>
    if (pct <= -5)   return <span className="text-red-700 font-medium">▼ {pct}%</span>
    return <span className="text-stone-500">— flat</span>
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Inventory Velocity</h2>
          <p className="text-sm text-stone-500 mt-1">
            Wrangl burn rate vs PIC baseline · the engine uses whichever is more reliable per part
          </p>
        </div>
      </div>

      {/* Filter / sort row */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select value={windowKey} onChange={e => setWindowKey(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
          {Object.entries(TIME_WINDOWS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={partType} onChange={e => setPartType(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
          {PART_TYPES.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
          {SOURCE_FILTERS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
          <option value="days_supply">Sort: At risk first</option>
          <option value="velocity">Sort: Highest velocity</option>
          <option value="name">Sort: Name</option>
        </select>
        <button onClick={exportCSV}
          className="ml-auto px-4 py-2 bg-stone-700 hover:bg-stone-800 text-white text-sm font-medium rounded-lg transition-colors">
          📥 Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">Stockouts</p>
          <p className="text-3xl font-bold text-red-900 mt-1 tabular-nums">{loading ? '—' : stats.stockouts}</p>
          <p className="text-xs text-red-700 mt-1">No on-hand stock</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">At Risk</p>
          <p className="text-3xl font-bold text-amber-900 mt-1 tabular-nums">{loading ? '—' : stats.at_risk}</p>
          <p className="text-xs text-amber-700 mt-1">&lt;7 days at engine velocity</p>
        </div>
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-stone-700 uppercase tracking-wider">No Usage</p>
          <p className="text-3xl font-bold text-stone-900 mt-1 tabular-nums">{loading ? '—' : stats.no_usage}</p>
          <p className="text-xs text-stone-600 mt-1">No movement, no baseline</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Baselined</p>
          <p className="text-3xl font-bold text-emerald-900 mt-1 tabular-nums">
            {loading ? '—' : `${stats.on_wrangl + stats.on_pic} / ${stats.total}`}
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            {loading ? '' : `${stats.on_wrangl} on Wrangl · ${stats.on_pic} priming on PIC`}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left  px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Part</th>
                <th className="text-left  px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Type</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Tier</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">On Hand</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Committed</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Available</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Used ({windowKey}d)</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Win/d</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Wrangl 30d/wk</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">PIC Base/wk</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Effective/wk</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Src</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Trend</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Days Supply</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={15} className="px-4 py-12 text-center text-stone-400">Loading…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={15} className="px-4 py-12 text-center text-stone-400">No parts match filters</td></tr>
              ) : sorted.map(row => {
                const cfg     = STATUS_CONFIG[row.status]
                const tier    = row.velocity_tier
                const srcKey  = row.velocity_source || 'none'
                const srcCfg  = SOURCE_BADGE[srcKey]
                return (
                  <tr key={row.id} onClick={() => navigate(`/inventory/${row.id}`)}
                    className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5 font-medium text-stone-800 min-w-[200px]">
                      {row.name}
                      {row.vendor && <div className="text-[11px] text-stone-400">{row.vendor}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-stone-600 text-xs">
                      {PART_TYPE_LABEL[row.part_type] || row.part_type}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {tier ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_BADGE[tier]}`}>{tier}</span>
                      ) : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-stone-800">{row.on_hand.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-stone-500">{row.committed.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-stone-800">{row.available.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-stone-700">{row.used.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-stone-500">
                      {row.avg_per_day > 0 ? row.avg_per_day.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-stone-700">
                      {row.wrangl_velocity_30d > 0 ? (Number(row.wrangl_velocity_30d) * 7).toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-stone-700">
                      {row.pic_baseline_velocity > 0 ? (Number(row.pic_baseline_velocity) * 7).toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-stone-900">
                      {row.effective_velocity > 0 ? (Number(row.effective_velocity) * 7).toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${srcCfg.cls}`}>
                        {srcCfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs whitespace-nowrap">
                      {renderTrend(row.velocity_trend_pct)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.status === 'stockout' ? (
                        <span className="text-red-700 font-semibold">0</span>
                      ) : row.effective_velocity <= 0 ? (
                        <span className="text-stone-400">—</span>
                      ) : (
                        <span className={row.days_supply < 7 ? 'text-amber-700 font-semibold' : 'text-stone-700'}>
                          {Math.round(row.days_supply)}d
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-stone-400 mt-3">
        Click any row to view the part's transaction history.
        <strong className="text-stone-500"> Win/d</strong> is your selected window's daily burn rate.
        <strong className="text-stone-500"> Wrangl 30d/wk</strong> is the rolling 30-day rate from inventory transactions, shown weekly.
        <strong className="text-stone-500"> PIC Base/wk</strong> is the one-time Jan-Apr 2026 PIC baseline, shown weekly.
        <strong className="text-stone-500"> Effective/wk</strong> is the velocity the engine is using right now —
        Wrangl once a part has &gt;30 days of history and ≥3 consumption transactions in the last 90 days, otherwise PIC.
        <strong className="text-stone-500"> Days Supply</strong> is computed off the daily effective velocity.
      </p>
    </div>
  )
}
