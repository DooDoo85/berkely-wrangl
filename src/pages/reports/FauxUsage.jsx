import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// =====================================================================
// Faux Usage Dashboard (executive mode)
//
// One row per faux blind size with:
//   - On Hand / Committed / Available
//   - Avg/Wk usage (4-month rolling baseline)
//   - Up to 4 upcoming container ETAs as shared columns
//   - Wks Supply at current usage
//   - Status: stockout / at_risk (< 4 wks) / healthy
// =====================================================================

const AT_RISK_WEEKS = 4

const SORT_ORDER = { stockout: 0, at_risk: 1, healthy: 2 }

const STATUS_PILL = {
  stockout: 'pill-critical',
  at_risk:  'pill-warning',
  healthy:  'pill-healthy',
}

const STATUS_LABEL = {
  stockout: 'Stockout',
  at_risk:  'At Risk',
  healthy:  'Healthy',
}

export default function FauxUsage() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState([])
  const [kpis, setKpis]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: viewRows }, { data: pls }] = await Promise.all([
      supabase
        .from('v_faux_blind_inventory')
        .select(`
          part_id, size, qty_on_hand, qty_committed, qty_available,
          velocity_per_day, avg_per_week, total_incoming, eta_breakdown,
          wks_supply_on_hand, wks_supply_with_incoming, status
        `),
      supabase
        .from('product_line_sales')
        .select('units_ytd, sales_ytd, updated_at')
        .eq('product_line', 'Faux Wood Blinds')
        .maybeSingle(),
    ])

    const parsed = (viewRows || []).map(r => ({
      id:                       r.part_id,
      size:                     r.size,
      qty_on_hand:              Number(r.qty_on_hand)    || 0,
      qty_committed:            Number(r.qty_committed)  || 0,
      qty_available:            Number(r.qty_available)  || 0,
      avg_per_week:             Number(r.avg_per_week)   || 0,
      total_incoming:           Number(r.total_incoming) || 0,
      eta_breakdown:            r.eta_breakdown          || [],
      wks_supply_on_hand:       r.wks_supply_on_hand,
      wks_supply_with_incoming: r.wks_supply_with_incoming,
      status:                   r.status,
    }))

    setRows(parsed)
    setKpis({
      units_ytd: Number(pls?.units_ytd || 0),
      sales_ytd: Number(pls?.sales_ytd || 0),
      updated_at: pls?.updated_at || null,
      on_hand:  parsed.reduce((s, r) => s + r.qty_on_hand,    0),
      incoming: parsed.reduce((s, r) => s + r.total_incoming, 0),
      at_risk:  parsed.filter(r => r.status === 'stockout' || r.status === 'at_risk').length,
    })
    setLoading(false)
  }

  // ─── Derived ──────────────────────────────────────────────────────────
  const upcomingEtas = useMemo(() => {
    const dates = new Set()
    for (const r of rows) {
      for (const item of (r.eta_breakdown || [])) {
        if (item?.eta) dates.add(item.eta)
      }
    }
    return [...dates].sort().slice(0, 4)
  }, [rows])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? rows.filter(r => r.size.toLowerCase().includes(q))
      : rows
    return [...filtered].sort((a, b) => {
      if (SORT_ORDER[a.status] !== SORT_ORDER[b.status])
        return SORT_ORDER[a.status] - SORT_ORDER[b.status]
      return b.avg_per_week - a.avg_per_week
    })
  }, [rows, search])

  // ─── Helpers ──────────────────────────────────────────────────────────
  function formatEta(isoDate) {
    if (!isoDate) return ''
    const d = new Date(isoDate + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function qtyForEta(row, eta) {
    if (!row.eta_breakdown) return null
    const total = row.eta_breakdown
      .filter(it => it.eta === eta)
      .reduce((s, it) => s + Number(it.qty || 0), 0)
    return total > 0 ? total : null
  }

  function isPastEta(isoDate) {
    if (!isoDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return new Date(isoDate + 'T00:00:00') < today
  }

  function formatUpdated(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function exportCSV() {
    const today = new Date().toISOString().slice(0, 10)
    const headers = [
      'Size', 'Avg/Wk', 'On Hand', 'Committed', 'Available',
      ...upcomingEtas.map(e => `ETA ${formatEta(e)}`),
      'Total Incoming', 'Wks Supply', 'Status',
    ]
    const csvRows = visibleRows.map(r => [
      r.size,
      r.avg_per_week > 0 ? r.avg_per_week.toFixed(1) : '',
      Math.round(r.qty_on_hand),
      Math.round(r.qty_committed),
      Math.round(r.qty_available),
      ...upcomingEtas.map(e => {
        const q = qtyForEta(r, e)
        return q != null ? Math.round(q) : ''
      }),
      Math.round(r.total_incoming),
      r.wks_supply_on_hand ?? '',
      STATUS_LABEL[r.status],
    ])
    const csv = [headers, ...csvRows]
      .map(row => row.map(v => {
        const s = String(v ?? '')
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
      }).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `faux-usage-${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const fmt      = n => Math.round(Number(n || 0)).toLocaleString()
  const fmtMoney = n => `$${Math.round(Number(n || 0) / 1000).toLocaleString()}K`

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1>Faux Usage Dashboard</h1>
          <p className="text-sm text-ink-muted mt-1">
            Stock, incoming containers, and weeks of supply at current usage
            {kpis?.updated_at && (
              <span className="text-ink-muted"> · YTD updated {formatUpdated(kpis.updated_at)}</span>
            )}
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="YTD Sold"
          value={loading ? '—' : fmt(kpis?.units_ytd)}
          subtext={loading || !kpis ? 'units' : `${fmtMoney(kpis.sales_ytd)} · units`}
          accent="gold"
        />
        <KpiCard
          label="On Hand"
          value={loading ? '—' : fmt(kpis?.on_hand)}
          subtext="units"
          accent="healthy"
        />
        <KpiCard
          label="Incoming"
          value={loading ? '—' : fmt(kpis?.incoming)}
          subtext="across active containers"
          accent="info"
        />
        <KpiCard
          label="At Risk"
          value={loading ? '—' : fmt(kpis?.at_risk)}
          subtext={`< ${AT_RISK_WEEKS} wks supply`}
          accent="critical"
          priority={kpis?.at_risk > 0}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by size (e.g. 36 x 84)..."
          className="input flex-1 max-w-md"
        />
        <button onClick={exportCSV} className="btn-primary ml-auto text-sm">
          📥 Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-page/40 border-b border-surface-border">
              <tr>
                <Th align="left">Size</Th>
                <Th>Avg/Wk</Th>
                <Th>On Hand</Th>
                <Th>Committed</Th>
                <Th>Available</Th>
                {upcomingEtas.map(eta => (
                  <th key={eta}
                      className="text-right px-3 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">
                    <div>ETA</div>
                    <div className={`mt-0.5 normal-case font-semibold ${isPastEta(eta) ? 'text-status-critical' : 'text-ink-mid'}`}>
                      {formatEta(eta)}{isPastEta(eta) ? ' ⚠' : ''}
                    </div>
                  </th>
                ))}
                <Th>Wks Supply</Th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7 + upcomingEtas.length} className="px-4 py-12 text-center text-ink-muted">Loading…</td></tr>
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={7 + upcomingEtas.length} className="px-4 py-12 text-center text-ink-muted">No sizes match the filter</td></tr>
              ) : visibleRows.map(row => (
                <tr key={row.id} onClick={() => navigate(`/inventory/${row.id}`)}
                    className="border-b border-surface-border-soft hover:bg-surface-page/40 cursor-pointer transition-colors">
                  <td className="px-4 py-2.5 font-medium text-ink-strong whitespace-nowrap min-w-[240px]">
                    {row.size}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-mid">
                    {row.avg_per_week > 0 ? row.avg_per_week.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-strong">
                    {Math.round(row.qty_on_hand).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                    {row.qty_committed > 0 ? Math.round(row.qty_committed).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-ink-strong">
                    {Math.round(row.qty_available).toLocaleString()}
                  </td>

                  {upcomingEtas.map(eta => {
                    const qty = qtyForEta(row, eta)
                    return (
                      <td key={eta} className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {qty != null
                          ? <span className={isPastEta(eta) ? 'text-status-critical font-medium' : 'text-ink-mid'}>
                              {Math.round(qty).toLocaleString()}
                            </span>
                          : <span className="text-ink-muted">—</span>}
                      </td>
                    )
                  })}

                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.status === 'stockout' ? (
                      <span className="text-status-critical font-semibold">0</span>
                    ) : row.avg_per_week <= 0 ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      <span className={
                        row.wks_supply_on_hand < AT_RISK_WEEKS
                          ? 'text-status-warning font-semibold'
                          : 'text-ink-mid'
                      }>
                        {row.wks_supply_on_hand != null ? `${row.wks_supply_on_hand}w` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={STATUS_PILL[row.status]}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-ink-muted mt-3">
        <strong className="text-ink-mid">On Hand</strong> = physical inventory.
        {' '}<strong className="text-ink-mid">Committed</strong> = reserved for open orders (live from ePIC every 15 min).
        {' '}<strong className="text-ink-mid">Available</strong> = On Hand minus Committed.
        {' '}<strong className="text-ink-mid">Avg/Wk</strong> = 4-month rolling baseline of weekly shipments per size.
        {' '}<strong className="text-ink-mid">ETA columns</strong> = units arriving on the next 4 container dates; past-ETA containers stay visible until marked received.
        {' '}<strong className="text-ink-mid">Wks Supply</strong> = Available ÷ Avg/Wk.
        {' '}Click any size for transaction history.
      </p>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
function KpiCard({ label, value, subtext, accent, priority }) {
  // accent: 'gold' | 'healthy' | 'info' | 'critical'
  const accentMap = {
    gold:     { text: 'text-accent-gold',     value: 'text-ink-strong' },
    healthy:  { text: 'text-status-healthy',  value: 'text-ink-strong' },
    info:     { text: 'text-status-info',     value: 'text-ink-strong' },
    critical: { text: 'text-status-critical', value: 'text-ink-strong' },
  }
  const t = accentMap[accent] || accentMap.gold
  const className = priority ? 'card-priority p-4' : 'card p-4'
  return (
    <div className={className}>
      <p className={`text-[10px] font-semibold ${t.text} uppercase tracking-widest`}>{label}</p>
      <p className={`text-3xl font-bold ${t.value} mt-1 tabular-nums`}>{value}</p>
      {subtext && <p className="text-xs text-ink-muted mt-1">{subtext}</p>}
    </div>
  )
}

function Th({ children, align = 'right' }) {
  const alignCls = align === 'left' ? 'text-left' : 'text-right'
  return (
    <th className={`${alignCls} px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap`}>
      {children}
    </th>
  )
}
