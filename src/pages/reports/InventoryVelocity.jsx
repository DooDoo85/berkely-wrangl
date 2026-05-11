import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// =====================================================================
// Inventory Velocity — simplified executive view
//
// Six columns: PART · TYPE · ON HAND · COMMITTED · AVAILABLE · DAYS SUPPLY
// Two KPI cards: STOCKOUTS · AT RISK
// One filter: part type
// Sort: at-risk first (stockout → at_risk → healthy → no-usage)
//
// Numbers come straight from the data sources:
//   on_hand    ← parts.qty_on_hand           (physical count, updated by cycle counts
//                                              + PO receipts + daily PARTS_SHIPPED/
//                                              FAUX_SHIPPED sync + fabric cut UI)
//   committed  ← parts.qty_committed         (computed every 15 min from ePIC's
//                                              committed-stock report)
//   available  ← on_hand - committed         (derived, clamped at 0 for display)
//   avg/wk     ← velocity_4mo_avg × 7        (PIC YTD Jan-Apr 2026 baseline)
//   days       ← available / velocity_4mo_avg
// =====================================================================

const PART_TYPES = [
  { value: 'all',       label: 'All Parts' },
  { value: 'fabric',    label: 'Fabric' },
  { value: 'component', label: 'Component' },
  { value: 'extrusion', label: 'Extrusion' },
  { value: 'blind',     label: 'Faux Blinds' },
]

const PART_TYPE_LABEL = {
  fabric:    'Fabric',
  component: 'Component',
  extrusion: 'Extrusion',
  blind:     'Faux',
}

const STATUS_BADGE = {
  stockout: 'bg-red-100 text-red-700',
  at_risk:  'bg-amber-100 text-amber-700',
  healthy:  'bg-emerald-50 text-emerald-700',
  no_usage: 'bg-stone-100 text-stone-500',
}

const STATUS_LABEL = {
  stockout: 'Stockout',
  at_risk:  'At Risk',
  healthy:  'Healthy',
  no_usage: 'No Usage',
}

export default function InventoryVelocity() {
  const navigate = useNavigate()
  const [partType, setPartType] = useState('all')
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { load() }, [partType])

  async function load() {
    setLoading(true)

    // Pull from the effective-velocity view (gives us parts + computed available
    // + velocity numbers in one query).
    let query = supabase
      .from('v_part_effective_velocity')
      .select(`
        part_id, name, part_type, vendor,
        qty_on_hand, qty_committed, qty_available,
        pic_baseline_velocity, effective_velocity
      `)
    if (partType !== 'all') query = query.eq('part_type', partType)

    const { data: parts } = await query

    const rows = (parts || []).map(p => {
      const onHand    = Number(p.qty_on_hand    || 0)
      const committed = Number(p.qty_committed  || 0)
      const available = Number(p.qty_available  || 0)
      const dailyVel  = Number(p.effective_velocity || 0)
      const weeklyVel = dailyVel * 7
      const daysSupply = dailyVel > 0 ? available / dailyVel : Infinity

      let status
      if (onHand <= 0)         status = 'stockout'
      else if (dailyVel <= 0)  status = 'no_usage'
      else if (daysSupply < 7) status = 'at_risk'
      else                     status = 'healthy'

      return {
        id:          p.part_id,
        name:        p.name,
        part_type:   p.part_type,
        vendor:      p.vendor,
        on_hand:     onHand,
        committed,
        available,
        weekly_velocity: weeklyVel,
        days_supply: daysSupply,
        status,
      }
    })

    setData(rows)
    setLoading(false)
  }

  // Sort: stockout → at_risk → healthy → no_usage; within each group, by days supply ascending
  const SORT_ORDER = { stockout: 0, at_risk: 1, healthy: 2, no_usage: 3 }
  const sorted = [...data].sort((a, b) => {
    if (SORT_ORDER[a.status] !== SORT_ORDER[b.status]) return SORT_ORDER[a.status] - SORT_ORDER[b.status]
    const aDays = isFinite(a.days_supply) ? a.days_supply : Number.MAX_VALUE
    const bDays = isFinite(b.days_supply) ? b.days_supply : Number.MAX_VALUE
    return aDays - bDays
  })

  // Summary
  const stockouts = data.filter(r => r.status === 'stockout').length
  const atRisk    = data.filter(r => r.status === 'at_risk').length

  // CSV export
  function exportCSV() {
    const headers = ['Part', 'Type', 'On Hand', 'Committed', 'Available', 'Avg/Wk', 'Days Supply', 'Status']
    const rows = sorted.map(r => [
      r.name,
      PART_TYPE_LABEL[r.part_type] || r.part_type,
      r.on_hand,
      r.committed,
      r.available,
      r.weekly_velocity > 0 ? r.weekly_velocity.toFixed(1) : '',
      isFinite(r.days_supply) ? Math.round(r.days_supply) : '',
      STATUS_LABEL[r.status],
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(v => {
        const s = String(v ?? '')
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
      }).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const today = new Date().toISOString().slice(0, 10)
    a.download = `inventory-${partType}-${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Inventory</h2>
          <p className="text-sm text-stone-500 mt-1">
            On hand, committed, available — and weeks of supply at current velocity
          </p>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select value={partType} onChange={e => setPartType(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
          {PART_TYPES.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <button onClick={exportCSV}
          className="ml-auto px-4 py-2 bg-stone-700 hover:bg-stone-800 text-white text-sm font-medium rounded-lg transition-colors">
          📥 Export CSV
        </button>
      </div>

      {/* Summary cards — just two, action-oriented */}
      <div className="grid grid-cols-2 gap-4 mb-6 max-w-md">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">Stockouts</p>
          <p className="text-3xl font-bold text-red-900 mt-1 tabular-nums">{loading ? '—' : stockouts}</p>
          <p className="text-xs text-red-700 mt-1">No on-hand stock</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">At Risk</p>
          <p className="text-3xl font-bold text-amber-900 mt-1 tabular-nums">{loading ? '—' : atRisk}</p>
          <p className="text-xs text-amber-700 mt-1">&lt; 7 days of supply</p>
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
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">On Hand</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Committed</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Available</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Avg/Wk</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Days Supply</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-stone-400">Loading…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-stone-400">No parts match filters</td></tr>
              ) : sorted.map(row => (
                <tr key={row.id} onClick={() => navigate(`/inventory/${row.id}`)}
                  className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer transition-colors">
                  <td className="px-4 py-2.5 font-medium text-stone-800 min-w-[200px]">
                    {row.name}
                    {row.vendor && <div className="text-[11px] text-stone-400">{row.vendor}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-stone-600 text-xs">
                    {PART_TYPE_LABEL[row.part_type] || row.part_type}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-stone-800">
                    {row.on_hand.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-stone-500">
                    {row.committed.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-stone-800">
                    {row.available.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-stone-700">
                    {row.weekly_velocity > 0 ? row.weekly_velocity.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.status === 'stockout' ? (
                      <span className="text-red-700 font-semibold">0</span>
                    ) : row.weekly_velocity <= 0 ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      <span className={row.days_supply < 7 ? 'text-amber-700 font-semibold' : 'text-stone-700'}>
                        {Math.round(row.days_supply)}d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[row.status]}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-stone-400 mt-3">
        <strong className="text-stone-500">On Hand</strong> = physical inventory (cycle counts, PO receipts, daily shipped reports, fabric cuts).
        {' '}<strong className="text-stone-500">Committed</strong> = reserved for open orders (live from ePIC every 15 min).
        {' '}<strong className="text-stone-500">Available</strong> = On Hand minus Committed.
        {' '}<strong className="text-stone-500">Avg/Wk</strong> = PIC YTD baseline (Jan-Apr 2026); will improve as Wrangl tracks more consumption.
        {' '}<strong className="text-stone-500">Days Supply</strong> = Available ÷ daily velocity.
        Click any row for transaction history.
      </p>
    </div>
  )
}
