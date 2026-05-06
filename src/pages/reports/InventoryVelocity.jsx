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

export default function InventoryVelocity() {
  const navigate = useNavigate()
  const [windowKey, setWindowKey] = useState('30')
  const [partType, setPartType]   = useState('all')
  const [sortBy, setSortBy]       = useState('days_supply')
  const [data, setData]           = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => { load() }, [windowKey, partType])

  async function load() {
    setLoading(true)
    const days   = TIME_WINDOWS[windowKey].days
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()

    // Fetch parts
    let partsQuery = supabase.from('parts')
      .select('id, name, part_type, vendor, qty_on_hand, qty_committed, unit_of_measure, reorder_level')
      .eq('active', true)
    if (partType !== 'all') partsQuery = partsQuery.eq('part_type', partType)
    const { data: parts } = await partsQuery

    // Fetch outflow transactions in window
    const { data: txns } = await supabase.from('inventory_transactions')
      .select('part_id, transaction_type, quantity, created_at')
      .gte('created_at', cutoff)
      .neq('transaction_type', 'receive')

    // Sum outflow per part (everything that isn't a receive; positive adjusts skipped)
    const outflowMap = {}
    ;(txns || []).forEach(t => {
      const qty = Number(t.quantity) || 0
      if (t.transaction_type === 'adjust' && qty > 0) return
      const used = Math.abs(qty)
      outflowMap[t.part_id] = (outflowMap[t.part_id] || 0) + used
    })

    const rows = (parts || []).map(p => {
      const used        = outflowMap[p.id] || 0
      const avgPerDay   = used / days
      const onHand      = Number(p.qty_on_hand || 0)
      const committed   = Number(p.qty_committed || 0)
      const available   = onHand - committed
      const daysSupply  = avgPerDay > 0 ? available / avgPerDay : Infinity

      let status
      if (onHand <= 0)               status = 'stockout'
      else if (used === 0)           status = 'no_usage'
      else if (daysSupply < 7)       status = 'at_risk'
      else                           status = 'healthy'

      return {
        ...p,
        on_hand:     onHand,
        committed,
        available,
        used,
        avg_per_day: avgPerDay,
        days_supply: daysSupply,
        status,
      }
    })

    setData(rows)
    setLoading(false)
  }

  // Sorting
  const SORT_ORDER = { stockout: 0, at_risk: 1, healthy: 2, no_usage: 3 }
  const sorted = [...data].sort((a, b) => {
    if (sortBy === 'velocity') return b.avg_per_day - a.avg_per_day
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
    stockouts: data.filter(r => r.status === 'stockout').length,
    at_risk:   data.filter(r => r.status === 'at_risk').length,
    no_usage:  data.filter(r => r.status === 'no_usage').length,
  }

  // CSV export
  function exportCSV() {
    const winLabel = TIME_WINDOWS[windowKey].label
    const headers = ['Part Name', 'Type', 'Vendor', 'On Hand', 'Committed', 'Available', `Used (${winLabel})`, 'Avg/Day', 'Days Supply', 'Status']
    const rows = sorted.map(r => [
      r.name,
      PART_TYPE_LABEL[r.part_type] || r.part_type,
      r.vendor || '',
      r.on_hand,
      r.committed,
      r.available,
      r.used,
      r.avg_per_day.toFixed(2),
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Inventory Velocity</h2>
          <p className="text-sm text-stone-500 mt-1">Usage rate, days of supply, and reorder alerts across all parts</p>
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
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">Stockouts</p>
          <p className="text-3xl font-bold text-red-900 mt-1 tabular-nums">{loading ? '—' : stats.stockouts}</p>
          <p className="text-xs text-red-700 mt-1">No on-hand stock</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">At Risk</p>
          <p className="text-3xl font-bold text-amber-900 mt-1 tabular-nums">{loading ? '—' : stats.at_risk}</p>
          <p className="text-xs text-amber-700 mt-1">&lt;7 days of supply</p>
        </div>
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-stone-700 uppercase tracking-wider">No Usage</p>
          <p className="text-3xl font-bold text-stone-900 mt-1 tabular-nums">{loading ? '—' : stats.no_usage}</p>
          <p className="text-xs text-stone-600 mt-1">No movement in window</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Part</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Type</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">On Hand</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Committed</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Available</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Used ({windowKey}d)</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Avg/Day</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Days Supply</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-stone-400">Loading…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-stone-400">No parts match filters</td></tr>
              ) : sorted.map(row => {
                const cfg = STATUS_CONFIG[row.status]
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
                      {row.used.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-stone-500">
                      {row.avg_per_day > 0 ? row.avg_per_day.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.status === 'stockout' ? (
                        <span className="text-red-700 font-semibold">0</span>
                      ) : row.avg_per_day === 0 ? (
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
        Click any row to view the part's transaction history. "Used" counts all outflow transactions (cuts, consumption, adjustments) in the selected window.
      </p>
    </div>
  )
}
