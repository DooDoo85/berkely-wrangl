import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'

// ── COO Cockpit ──────────────────────────────────────────────────────────────
// A private operations cockpit. KPI strip + live order flow on top, trend/health
// panels below. Every tile backed by real data shows live numbers; tiles whose
// data isn't captured yet show as honest "not tracked" placeholders that double
// as an instrumentation roadmap. Charts are inline SVG (no chart library).
//
// Gated to a single user (COO). Reuses Wrangl's Supabase data + auth.

const usd = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n))
const num = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US').format(n))

// Statuses that mean an order is still "in flight" (not a finished sale, not a quote)
const OPEN_STATUSES = ['printed', 'po_sent', 'credit_ok', 'credit_hold', 'in_production', 'on_hold']

// Warm palette (matches the Wrangl theme used across the app)
const C_SAGE = '#6f9e7e'
const C_AMBER = '#d9a441'
const C_CLAY = '#c2682f'
const C_RED = '#b3503e'
const C_ACCENT = '#c2682f' // chart line accent
// Age ramp for the printed pipeline — fresh → old, shared by both lines
// (lines are separated into their own sections, so color encodes age only).
const AGE = ['#6f9e7e', '#d9a441', '#c2682f', '#b3503e'] // 0–3 / 4–7 / 8–14 / 15+

function startOfWeekISO() {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1)) // Monday
  return d.toISOString().slice(0, 10)
}
function startOfMonthISO() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
function isoDaysAgo(n) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// Build a Mon→today per-line series from daily_shipments rows
function buildWeekSeries(shipRows, weekStart, todayISO) {
  const start = new Date(weekStart + 'T00:00:00')
  const today = new Date(todayISO + 'T00:00:00')
  const days = []
  for (let dt = new Date(start); dt <= today; dt.setDate(dt.getDate() + 1)) {
    days.push(dt.toISOString().slice(0, 10))
  }
  const idx = Object.fromEntries(days.map((d, i) => [d, i]))
  const faux = days.map(() => 0)
  const roller = days.map(() => 0)
  ;(shipRows ?? []).forEach((r) => {
    const i = idx[r.ship_date]
    if (i == null) return
    if (r.product_line === 'faux') faux[i] += r.units_shipped || 0
    else if (r.product_line === 'roller') roller[i] += r.units_shipped || 0
  })
  const labels = days.map((d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }))
  return { labels, faux, roller }
}

// ── Inline SVG icon set ──
function Icon({ name, className = 'w-4 h-4' }) {
  const p = {
    backlog: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    truck: <><path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></>,
    alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
    inbox: <><path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5" /></>,
    gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>,
    dollar: <><path d="M12 3v18" /><path d="M16 7c0-2-2-3-4-3s-4 1-4 3 2 3 4 3 4 1 4 3-2 3-4 3-4-1-4-3" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
    printer: <><path d="M7 8V4h10v4M7 18H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2" /><rect x="7" y="14" width="10" height="6" rx="1" /></>,
    package: <><path d="M12 3l8 4v10l-8 4-8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>,
    refresh: <><path d="M20 11A8 8 0 105.6 6.6M20 4v4h-4" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {p[name] || null}
    </svg>
  )
}

// ── KPI card (top strip) — number + tinted icon badge ──
function KpiCard({ icon, tint, label, value, sub, tone = 'normal' }) {
  const toneColor =
    tone === 'good' ? 'text-emerald-700' :
    tone === 'warn' ? 'text-amber-700' :
    tone === 'bad'  ? 'text-red-700' : 'text-ink-strong'
  return (
    <div className="card !rounded-xl ring-1 ring-stone-200/80 shadow-none p-3.5 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">{label}</p>
        <p className={`font-display font-bold text-[26px] leading-none ${toneColor}`}>{value}</p>
        {sub && <p className="text-[11px] text-ink-muted mt-1.5 truncate">{sub}</p>}
      </div>
      <div className={`shrink-0 w-8 h-8 rounded-full grid place-items-center ${tint}`}>
        <Icon name={icon} />
      </div>
    </div>
  )
}

// ── Order-flow stage ──
function Stage({ icon, tint, label, value, sub }) {
  return (
    <div className="flex flex-col items-center text-center px-1 flex-1 min-w-[72px]">
      <div className={`w-12 h-12 rounded-full grid place-items-center mb-2 ${tint}`}>
        <Icon name={icon} className="w-5 h-5" />
      </div>
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="font-display font-bold text-2xl text-ink-strong leading-none mt-1">{value}</p>
      {sub && <p className="text-[10px] text-ink-muted mt-1">{sub}</p>}
    </div>
  )
}
function FlowArrow() {
  return (
    <div className="text-stone-300 shrink-0 self-center pb-5">
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </div>
  )
}

// ── Sparkline (area + line + endpoint dot) ──
function Sparkline({ values, labels, color = C_ACCENT }) {
  const w = 260, h = 64, pad = 6
  const n = values.length
  const max = Math.max(1, ...values)
  const xs = (i) => (n <= 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (n - 1))
  const ys = (v) => h - pad - (v / max) * (h - 2 * pad - 6)
  const pts = values.map((v, i) => [xs(i), ys(v)])
  const lineD = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const areaD = `${lineD} L ${xs(n - 1).toFixed(1)} ${h - pad} L ${xs(0).toFixed(1)} ${h - pad} Z`
  const gid = `spark-${color.replace('#', '')}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <path d={lineD} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === n - 1 ? 3.2 : 2} fill={color} />
      ))}
    </svg>
  )
}

// ── Donut (backlog aging) ──
function Donut({ segments, size = 140 }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const sw = Math.round(size * 0.143)
  const cx = size / 2, cy = size / 2
  const r = size / 2 - sw / 2 - 8
  const C = 2 * Math.PI * r
  let offset = 0
  const valueClass = size >= 140 ? 'text-2xl' : 'text-xl'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#efe9df" strokeWidth={sw} />
        {total > 0 && segments.map((s, i) => {
          const frac = s.value / total
          const dash = frac * C
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={s.color} strokeWidth={sw}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} />
          )
          offset += dash
          return el
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className={`font-display font-bold ${valueClass} text-ink-strong leading-none`}>{num(total)}</p>
          <p className="text-[10px] uppercase tracking-wide text-ink-muted mt-0.5">orders</p>
        </div>
      </div>
    </div>
  )
}

// ── Standard live tile ──
function Tile({ label, value, sub, tone = 'normal', alert = false, onClick }) {
  const toneColor =
    tone === 'good' ? 'text-emerald-700' :
    tone === 'warn' ? 'text-amber-700' :
    tone === 'bad'  ? 'text-red-700' : 'text-ink-strong'
  return (
    <div
      onClick={onClick}
      className={`card !rounded-xl ring-1 shadow-none p-3.5 ${alert ? 'ring-amber-300 bg-amber-50/30' : 'ring-stone-200/80'} ${onClick ? 'cursor-pointer hover:ring-stone-300 transition-shadow' : ''}`}
    >
      <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">{label}</p>
      <p className={`font-display font-bold text-[26px] leading-none ${toneColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-muted mt-1.5">{sub}</p>}
    </div>
  )
}

// ── "Not yet tracked" placeholder — honest about the gap ──
function GapTile({ label, needs }) {
  return (
    <div className="card !rounded-xl ring-1 ring-dashed ring-stone-300 shadow-none p-3.5 bg-stone-50/40">
      <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">{label}</p>
      <p className="font-display font-semibold text-lg text-ink-muted leading-none">Not yet tracked</p>
      <p className="text-[11px] text-ink-muted mt-1.5">Needs: {needs}</p>
    </div>
  )
}

// ── Section label ──
function SectionLabel({ children }) {
  return <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted mb-2">{children}</p>
}

export default function CooCockpit() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastLoaded, setLastLoaded] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const weekStart = startOfWeekISO()
      const monthStart = startOfMonthISO()
      const today = new Date().toISOString().slice(0, 10)

      // Orders received — this week / this month (by order_date)
      const { count: rcvWeek } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .gte('order_date', weekStart)
      const { count: rcvMonth } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .gte('order_date', monthStart)

      // Open backlog — orders in an in-flight status
      const { count: backlog } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .in('status', OPEN_STATUSES)

      // On hold — needs attention
      const { data: holdRows } = await supabase.from('orders')
        .select('order_number, customer_name, hold_reason, hold_status')
        .eq('status', 'on_hold')
      const { count: creditHold } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'credit_hold')

      // Pipeline stage counts (safe — known valid statuses)
      const { count: creditOk } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'credit_ok')
      const { count: printed } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'printed')

      // In production right now
      const { count: inProd } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_production')

      // Printed pipeline aging — orders that have been printed (Printed +
      // In Production), split BY PRODUCT LINE and bucketed by days since printed
      // (epic_status_date). Totals tie to the Printed + In-Production tiles
      // (Roller 19+10, Faux 164+0). Null print date defaults to fresh so the
      // per-line totals stay whole.
      const { data: prodRows } = await supabase.from('orders')
        .select('epic_status_date, product_line')
        .in('status', ['printed', 'in_production'])
      const today0 = new Date(); today0.setHours(0, 0, 0, 0)
      const mkB = () => ({ b0_3: 0, b4_7: 0, b8_14: 0, b15: 0, total: 0 })
      const aging = { roller: mkB(), faux: mkB() }
      ;(prodRows ?? []).forEach((r) => {
        const line = r.product_line === 'roller' ? 'roller' : (r.product_line === 'faux' ? 'faux' : null)
        if (!line) return
        let age = 0
        if (r.epic_status_date) {
          const od = new Date(r.epic_status_date + 'T00:00:00')
          if (!isNaN(od)) age = Math.max(0, Math.floor((today0 - od) / 86400000))
        }
        const b = age <= 3 ? 'b0_3' : age <= 7 ? 'b4_7' : age <= 14 ? 'b8_14' : 'b15'
        aging[line][b]++; aging[line].total++
      })

      // Shipped this week (units) — from daily_shipments (both product lines)
      const { data: shipRows } = await supabase.from('daily_shipments')
        .select('units_shipped, ship_date, product_line')
        .gte('ship_date', weekStart)
      const shippedUnitsWeek = (shipRows ?? []).reduce((s, r) => s + (r.units_shipped || 0), 0)
      const shippedToday = (shipRows ?? []).filter(r => r.ship_date === today)
        .reduce((s, r) => s + (r.units_shipped || 0), 0)
      const series = buildWeekSeries(shipRows, weekStart, today)

      // Gross margin % — sales we have; loaded cost not yet wired.
      const { data: pls } = await supabase.from('product_line_sales').select('*')
      const salesYTD = (pls ?? []).reduce((s, r) => s + (Number(r.sales_ytd) || 0), 0)

      // Remakes (quality-failure proxy) — last 30 days count
      let remakeCount = null
      try {
        const { count } = await supabase.from('remakes')
          .select('remake_wo', { count: 'exact', head: true })
          .gte('remake_date', isoDaysAgo(30))
        remakeCount = count
      } catch { remakeCount = null }

      // Freight recovery — charged vs carrier cost (v_freight_recovery view,
      // fed by the Freight Costs page imports). Null if view missing or empty.
      let freight = null
      try {
        const { data: fr } = await supabase.from('v_freight_recovery').select('*').maybeSingle()
        if (fr && (Number(fr.charged) > 0 || Number(fr.cost) > 0 || Number(fr.program_cost) > 0)) {
          freight = {
            charged: Number(fr.charged) || 0,
            cost: Number(fr.cost) || 0,
            recovery: (Number(fr.charged) || 0) - (Number(fr.cost) || 0),
            programCost: Number(fr.program_cost) || 0,
          }
        }
      } catch { freight = null }

      // ── LABOR — per-line cost + per-line efficiency (since go-live) ──
      // Cost: v_labor_summary since go-live (2026-04-06).
      // Efficiency: per-line units ÷ per-line labor hours, BOTH since go-live.
      //   Units = backfill (Apr 6–May 31, ePIC completion report, correctly
      //   tagged) + daily_shipments (Jun 1 onward). orders.product_line
      //   undercounts roller, so we use the backfill+daily bridge instead.
      const LABOR_GO_LIVE = '2026-04-06'
      const DAILY_SHIP_START = '2026-06-01'
      const labor = {
        faux:   { hours: 0, cost: 0, units: 0 },
        roller: { hours: 0, cost: 0, units: 0 },
      }
      try {
        const { data: labRows } = await supabase
          .from('v_labor_summary')
          .select('product_line, hours, labor_cost, date')
          .gte('date', LABOR_GO_LIVE)
        ;(labRows ?? []).forEach(r => {
          const pl = r.product_line === 'faux' ? 'faux' : (r.product_line === 'roller' ? 'roller' : null)
          if (!pl) return
          labor[pl].hours += Number(r.hours) || 0
          labor[pl].cost  += Number(r.labor_cost) || 0
        })
        const { data: bf } = await supabase
          .from('labor_unit_backfill')
          .select('product_line, units')
        ;(bf ?? []).forEach(r => {
          if (r.product_line === 'faux')   labor.faux.units   += Number(r.units) || 0
          if (r.product_line === 'roller') labor.roller.units += Number(r.units) || 0
        })
        const { data: ds } = await supabase
          .from('daily_shipments')
          .select('product_line, units_shipped, ship_date')
          .gte('ship_date', DAILY_SHIP_START)
        ;(ds ?? []).forEach(r => {
          if (r.product_line === 'faux')   labor.faux.units   += Number(r.units_shipped) || 0
          if (r.product_line === 'roller') labor.roller.units += Number(r.units_shipped) || 0
        })
      } catch { /* views/tables may not exist yet */ }

      const eff = (l) => l.hours > 0 ? (l.units / l.hours) : null

      setD({
        rcvWeek, rcvMonth, backlog,
        holdRows: holdRows ?? [], creditHold, creditOk, printed, inProd,
        aging, series,
        shippedUnitsWeek, shippedToday,
        salesYTD, remakeCount, freight,
        labor,
        fauxEff: eff(labor.faux),
        rollerEff: eff(labor.roller),
      })
      setLastLoaded(new Date())
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const atRisk = d ? (d.creditHold || 0) + (d.holdRows?.length || 0) : 0

  return (
    <div className="min-h-screen bg-surface-page">
      <div className="max-w-screen-xl mx-auto p-3 md:p-5 pb-12">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display font-bold text-ink-strong text-2xl md:text-3xl">COO Cockpit</h1>
            <p className="text-xs text-ink-muted mt-0.5">
              Operations at a glance · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastLoaded && (
              <span className="text-[11px] text-ink-muted hidden sm:inline">
                Updated {lastLoaded.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={load}
              className="text-xs font-medium px-3 py-1.5 rounded-lg ring-1 ring-stone-200 bg-white hover:bg-stone-50 text-ink-mid flex items-center gap-1.5 transition-colors">
              <Icon name="refresh" className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="card p-10 text-center text-ink-muted text-sm !rounded-xl ring-1 ring-stone-200 shadow-none">Loading cockpit…</div>
        ) : !d ? null : (
          <div className="space-y-6">

            {/* ── KPI STRIP ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
              <KpiCard icon="backlog" tint="bg-stone-100 text-stone-600" label="Open Backlog" value={num(d.backlog)} sub="orders in flight" />
              <KpiCard icon="truck" tint="bg-emerald-50 text-emerald-600" label="Shipped Today" value={num(d.shippedToday)} sub="units (all lines)" />
              <KpiCard icon="alert" tint="bg-red-50 text-red-600" label="Orders at Risk" value={num(atRisk)} sub="credit + holds" tone={atRisk > 0 ? 'bad' : 'good'} />
              <KpiCard icon="inbox" tint="bg-amber-50 text-amber-600" label="Received (wk)" value={num(d.rcvWeek)} sub={`${num(d.rcvMonth)} this month`} />
              <KpiCard icon="gear" tint="bg-orange-50 text-orange-600" label="In Production" value={num(d.inProd)} sub="active on floor" />
              <KpiCard icon="dollar" tint="bg-emerald-50 text-emerald-600" label="Sales YTD" value={usd(d.salesYTD)} sub="product-line sales" />
            </div>

            {/* ── PRODUCTION PERFORMANCE  +  LIVE ORDER FLOW ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              {/* Production performance */}
              <div className="card !rounded-xl ring-1 ring-stone-200/80 shadow-none p-4">
                <SectionLabel>Production performance · this week</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                  {[
                    { name: 'Roller Shades', vals: d.series.roller, units: d.labor?.roller.units, eff: d.rollerEff },
                    { name: 'Faux Wood Blinds', vals: d.series.faux, units: d.labor?.faux.units, eff: d.fauxEff },
                  ].map((line) => {
                    const wtd = (line.vals ?? []).reduce((s, v) => s + v, 0)
                    return (
                      <div key={line.name} className="rounded-lg ring-1 ring-stone-100 p-3">
                        <p className="font-display font-semibold text-ink-strong text-sm">{line.name}</p>
                        <p className="text-[11px] text-ink-muted mb-1">{num(wtd)} units shipped WTD</p>
                        <Sparkline values={line.vals && line.vals.length ? line.vals : [0]} labels={d.series.labels} />
                        <div className="flex justify-between text-[10px] text-ink-muted mt-1">
                          {(d.series.labels ?? []).map((l, i) => <span key={i}>{l}</span>)}
                        </div>
                        <p className="text-[11px] text-ink-mid mt-2">
                          Since go-live: <span className="font-semibold text-ink-strong">{line.eff == null ? '—' : line.eff.toFixed(1)}</span> units/hr
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Live order flow */}
              <div className="card !rounded-xl ring-1 ring-stone-200/80 shadow-none p-4 flex flex-col">
                <SectionLabel>Live order flow</SectionLabel>
                <div className="flex items-start justify-between gap-1 flex-1 pt-3">
                  <Stage icon="check"   tint="bg-emerald-50 text-emerald-600" label="Credit OK"     value={num(d.creditOk)} sub="orders" />
                  <FlowArrow />
                  <Stage icon="printer" tint="bg-stone-100 text-stone-600"    label="Printed"       value={num(d.printed)}  sub="orders" />
                  <FlowArrow />
                  <Stage icon="gear"    tint="bg-orange-50 text-orange-600"    label="In Production" value={num(d.inProd)}   sub="orders" />
                  <FlowArrow />
                  <Stage icon="package" tint="bg-emerald-50 text-emerald-600"  label="Shipped Today" value={num(d.shippedToday)} sub="units" />
                </div>
                <p className="text-[10px] text-ink-muted text-right mt-3">Order pipeline, left to right</p>
              </div>
            </div>

            {/* ── PRINTED PIPELINE (by line & age) ── */}
            <div className="card !rounded-xl ring-1 ring-stone-200/80 shadow-none p-5">
              <SectionLabel>Printed pipeline by line &amp; age</SectionLabel>
              <p className="text-[11px] text-ink-muted -mt-1 mb-1">Orders by days since printed</p>

              {[
                { name: 'Roller Shades', key: 'roller' },
                { name: 'Faux Wood Blinds', key: 'faux' },
              ].map((line, li) => {
                const a = d.aging[line.key]
                const buckets = [
                  { label: '0 – 3 days', v: a.b0_3, c: AGE[0] },
                  { label: '4 – 7 days', v: a.b4_7, c: AGE[1] },
                  { label: '8 – 14 days', v: a.b8_14, c: AGE[2] },
                  { label: '15+ days', v: a.b15, c: AGE[3] },
                ]
                return (
                  <div key={line.key}
                    className={`flex flex-col lg:flex-row lg:items-center gap-5 py-5 ${li > 0 ? 'border-t border-stone-200/70' : ''}`}>
                    <Donut size={120} segments={buckets.map((b) => ({ value: b.v, color: b.c }))} />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-display font-bold text-lg text-ink-strong mb-3">{line.name}</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {buckets.map((b) => {
                          const pct = a.total > 0 ? Math.round((b.v / a.total) * 100) : 0
                          return (
                            <div key={b.label} className="rounded-lg ring-1 ring-stone-200/70 bg-stone-50/60 px-3 py-2.5">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.c }} />
                                <span className="text-[11px] text-ink-mid">{b.label}</span>
                              </div>
                              <p className="font-display font-bold text-2xl text-ink-strong leading-none">{num(b.v)}</p>
                              <p className="text-[11px] mt-1.5 font-medium" style={{ color: b.c }}>{pct}%</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div className="rounded-lg bg-stone-100/70 ring-1 ring-stone-200/70 px-4 py-3 text-center shrink-0 self-stretch lg:self-center lg:w-[104px] flex flex-col justify-center">
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted leading-tight">Total orders</p>
                      <p className="font-display font-bold text-3xl text-ink-strong mt-1 leading-none">{num(a.total)}</p>
                    </div>
                  </div>
                )
              })}

              {/* shared age legend */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-4 border-t border-stone-200/70">
                {[
                  { label: '0 – 3 days', c: AGE[0] },
                  { label: '4 – 7 days', c: AGE[1] },
                  { label: '8 – 14 days', c: AGE[2] },
                  { label: '15+ days', c: AGE[3] },
                ].map((x) => (
                  <div key={x.label} className="flex items-center gap-1.5 text-[11px] text-ink-mid">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: x.c }} />
                    {x.label} since printed
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-ink-muted mt-3">Printed + in-production orders · color = days since printed (fresh → old)</p>
            </div>

            {/* ── ORDERS ON HOLD ── */}
            <div className="card !rounded-xl ring-1 ring-stone-200/80 shadow-none p-4">
                <SectionLabel>Orders needing attention</SectionLabel>
                {d.holdRows.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-700 py-6 justify-center">
                    <Icon name="check" className="w-5 h-5" />
                    No orders on hold
                    {d.creditHold > 0 && <span className="text-ink-muted">· {num(d.creditHold)} awaiting credit</span>}
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-ink-muted border-b border-stone-200">
                          <th className="px-2 py-2">Order</th>
                          <th className="px-2 py-2">Customer</th>
                          <th className="px-2 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.holdRows.map((h, i) => (
                          <tr key={i} className="border-b border-stone-100 last:border-0">
                            <td className="px-2 py-2 text-[12px] font-mono text-ink-mid">{h.order_number || '—'}</td>
                            <td className="px-2 py-2 text-[13px] text-ink-strong">{h.customer_name || '—'}</td>
                            <td className="px-2 py-2 text-[12px] text-ink-muted">{h.hold_reason || h.hold_status || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            {/* ── LABOR ── */}
            <div>
              <SectionLabel>Labor · since go-live (Apr 6)</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <Tile label="Faux Labor Cost" value={usd(d.labor?.faux.cost)} sub={`${num(Math.round(d.labor?.faux.hours || 0))} hrs`} />
                <Tile label="Faux Units/Hour" value={d.fauxEff == null ? '—' : d.fauxEff.toFixed(1)} sub={`${num(d.labor?.faux.units || 0)} units`} />
                <Tile label="Roller Labor Cost" value={usd(d.labor?.roller.cost)} sub={`${num(Math.round(d.labor?.roller.hours || 0))} hrs`} />
                <Tile label="Roller Units/Hour" value={d.rollerEff == null ? '—' : d.rollerEff.toFixed(1)} sub={`${num(d.labor?.roller.units || 0)} units`} />
              </div>
            </div>

            {/* ── FINANCIAL & QUALITY ── */}
            <div>
              <SectionLabel>Financial & quality</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <Tile label="Sales YTD" value={usd(d.salesYTD)} sub="from product-line sales" />
                {d.freight ? (
                  <Tile
                    label="Freight Margin YTD"
                    value={usd(d.freight.recovery)}
                    sub={`${usd(d.freight.charged)} assumed @ $14/unit vs ${usd(d.freight.cost)} cost${d.freight.programCost > 0 ? ` · ${usd(d.freight.programCost)} program` : ''}`}
                    tone={d.freight.recovery < 0 ? 'bad' : 'good'}
                    onClick={() => navigate('/freight')}
                  />
                ) : (
                  <GapTile label="Freight Recovery" needs="import invoices on the Freight Costs page" />
                )}
                <Tile label="Remakes (30d)" value={d.remakeCount == null ? '—' : num(d.remakeCount)} sub="quality failures" tone={d.remakeCount > 0 ? 'warn' : 'normal'} />
                <GapTile label="Gross Margin %" needs="cost feed wired to sales (use loaded cost)" />
              </div>
            </div>

            {/* ── NOT YET TRACKED (instrumentation roadmap) ── */}
            <div>
              <SectionLabel>Not yet tracked — instrumentation gaps</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <GapTile label="Avg Days to Ship" needs="printed & invoiced captured as separate dated events (today they import same-batch)" />
                <GapTile label="On-Time Delivery %" needs="requested_ship_date populated from ePIC" />
                <GapTile label="Capacity Utilization" needs="work-center capacity + hours feed" />
                <GapTile label="Material Stockouts" needs="on-hand vs. demand stockout events" />
                <GapTile label="First Pass Yield %" needs="total production count vs. remakes" />
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
