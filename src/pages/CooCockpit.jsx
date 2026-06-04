import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'

// ── COO Cockpit ──────────────────────────────────────────────────────────────
// A private operations cockpit. Alerts/exceptions on top (what needs attention
// now), trend/health metrics below. Tiles backed by real data show live numbers;
// tiles whose data isn't captured yet show as honest "not tracked" placeholders
// that double as an instrumentation roadmap.
//
// Gated to a single user (COO). Reuses Wrangl's Supabase data + auth.

const usd = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n))
const num = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US').format(n))

// Statuses that mean an order is still "in flight" (not a finished sale, not a quote)
const OPEN_STATUSES = ['printed', 'po_sent', 'credit_ok', 'credit_hold', 'in_production', 'on_hold']

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

// ── A live metric tile ──
function Tile({ label, value, sub, tone = 'normal', alert = false }) {
  const toneColor =
    tone === 'good' ? 'text-emerald-700' :
    tone === 'warn' ? 'text-amber-700' :
    tone === 'bad'  ? 'text-red-700' : 'text-ink-strong'
  return (
    <div className={`card !rounded-lg ring-1 shadow-none p-3 md:p-4 ${alert ? 'ring-amber-300 bg-amber-50/30' : 'ring-stone-200'}`}>
      <p className="text-[11px] uppercase tracking-wide text-ink-muted mb-1">{label}</p>
      <p className={`font-display font-bold text-2xl md:text-[28px] leading-none ${toneColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-muted mt-1.5">{sub}</p>}
    </div>
  )
}

// ── A "not yet tracked" placeholder tile — honest about the gap ──
function GapTile({ label, needs }) {
  return (
    <div className="card !rounded-lg ring-1 ring-dashed ring-stone-300 shadow-none p-3 md:p-4 bg-stone-50/40">
      <p className="text-[11px] uppercase tracking-wide text-ink-muted mb-1">{label}</p>
      <p className="font-display font-semibold text-lg text-ink-muted leading-none">Not yet tracked</p>
      <p className="text-[11px] text-ink-muted mt-1.5">Needs: {needs}</p>
    </div>
  )
}

export default function CooCockpit() {
  const { profile } = useAuth()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

      // In production right now
      const { count: inProd } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_production')

      // Shipped this week (units) — from daily_shipments (both product lines)
      const { data: shipRows } = await supabase.from('daily_shipments')
        .select('units_shipped, ship_date, product_line')
        .gte('ship_date', weekStart)
      const shippedUnitsWeek = (shipRows ?? []).reduce((s, r) => s + (r.units_shipped || 0), 0)
      // today's output
      const shippedToday = (shipRows ?? []).filter(r => r.ship_date === today)
        .reduce((s, r) => s + (r.units_shipped || 0), 0)

      // Gross margin % — from product_line_sales (YTD sales) vs loaded cost.
      // We have sales; cost here uses a blended loaded-cost ratio if available.
      const { data: pls } = await supabase.from('product_line_sales').select('*')
      const salesYTD = (pls ?? []).reduce((s, r) => s + (Number(r.sales_ytd) || 0), 0)

      // Remakes (first-pass-yield proxy: failures) — last 30 days count
      let remakeCount = null
      try {
        const { count } = await supabase.from('remakes')
          .select('remake_wo', { count: 'exact', head: true })
          .gte('remake_date', isoDaysAgo(30))
        remakeCount = count
      } catch { remakeCount = null }

      // ── LABOR — per-line cost + per-line efficiency (since go-live) ──
      // Cost: v_labor_summary since go-live (2026-04-06).
      // Efficiency: per-line units ÷ per-line labor hours, BOTH since go-live.
      //   Units = backfill (Apr 6–May 31, ePIC completion report, correctly
      //   tagged) + daily_shipments (Jun 1 onward). This is the correct
      //   per-line count — orders.product_line undercounts roller, so we use
      //   the backfill+daily bridge instead.
      const LABOR_GO_LIVE = '2026-04-06'
      const DAILY_SHIP_START = '2026-06-01'  // daily_shipments owns this date forward
      const labor = {
        faux:   { hours: 0, cost: 0, units: 0 },
        roller: { hours: 0, cost: 0, units: 0 },
      }
      try {
        // Labor hours + cost since go-live (per line) — same window as units
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
        // Units part 1: backfill (Apr 6 – May 31)
        const { data: bf } = await supabase
          .from('labor_unit_backfill')
          .select('product_line, units')
        ;(bf ?? []).forEach(r => {
          if (r.product_line === 'faux')   labor.faux.units   += Number(r.units) || 0
          if (r.product_line === 'roller') labor.roller.units += Number(r.units) || 0
        })
        // Units part 2: daily_shipments from June 1 onward (no overlap with backfill)
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
        holdRows: holdRows ?? [], creditHold, inProd,
        shippedUnitsWeek, shippedToday,
        salesYTD, remakeCount,
        labor,
        fauxEff: eff(labor.faux),
        rollerEff: eff(labor.roller),
      })
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-page">
      <div className="max-w-screen-xl mx-auto p-3 md:p-4 pb-12">

        <div className="mb-4">
          <h1 className="font-display font-bold text-ink-strong text-xl md:text-2xl">COO Cockpit</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Operations at a glance · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="card p-10 text-center text-ink-muted text-sm !rounded-lg ring-1 ring-stone-200 shadow-none">Loading cockpit…</div>
        ) : !d ? null : (
          <div className="space-y-5">

            {/* ── NEEDS ATTENTION (alerts) ── */}
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted mb-2">Needs attention</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <Tile label="On Hold" value={num(d.holdRows.length)} sub="orders halted" tone={d.holdRows.length > 0 ? 'warn' : 'good'} alert={d.holdRows.length > 0} />
                <Tile label="Credit Hold" value={num(d.creditHold)} sub="awaiting credit" tone={d.creditHold > 0 ? 'warn' : 'good'} alert={d.creditHold > 0} />
                <Tile label="In Production" value={num(d.inProd)} sub="active on floor" />
                <Tile label="Open Backlog" value={num(d.backlog)} sub="orders in flight" />
              </div>
            </div>

            {/* ── TODAY / THIS WEEK (output) ── */}
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted mb-2">Output</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <Tile label="Shipped Today" value={num(d.shippedToday)} sub="units (all lines)" />
                <Tile label="Shipped This Week" value={num(d.shippedUnitsWeek)} sub="units to date" />
                <Tile label="Orders Received (wk)" value={num(d.rcvWeek)} sub={`${num(d.rcvMonth)} this month`} />
                <Tile label="Daily Production Output" value={num(d.shippedToday)} sub="shipped-units proxy" />
              </div>
            </div>

            {/* ── FINANCIAL & QUALITY ── */}
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted mb-2">Financial & quality</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <Tile label="Sales YTD" value={usd(d.salesYTD)} sub="from product-line sales" />
                <Tile label="Remakes (30d)" value={d.remakeCount == null ? '—' : num(d.remakeCount)} sub="quality failures" tone={d.remakeCount > 0 ? 'warn' : 'normal'} />
                <GapTile label="Gross Margin %" needs="cost feed wired to sales (use loaded cost)" />
                <GapTile label="First Pass Yield %" needs="total production count vs. remakes" />
              </div>
            </div>

            {/* ── LABOR ── */}
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted mb-2">Labor · since go-live (Apr 6)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <Tile label="Faux Labor Cost" value={usd(d.labor?.faux.cost)} sub={`${num(Math.round(d.labor?.faux.hours || 0))} hrs`} />
                <Tile label="Faux Units/Hour" value={d.fauxEff == null ? '—' : d.fauxEff.toFixed(1)} sub={`${num(d.labor?.faux.units || 0)} units`} />
                <Tile label="Roller Labor Cost" value={usd(d.labor?.roller.cost)} sub={`${num(Math.round(d.labor?.roller.hours || 0))} hrs`} />
                <Tile label="Roller Units/Hour" value={d.rollerEff == null ? '—' : d.rollerEff.toFixed(1)} sub={`${num(d.labor?.roller.units || 0)} units`} />
              </div>
            </div>

            {/* ── NOT YET TRACKED (instrumentation roadmap) ── */}
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted mb-2">Not yet tracked — instrumentation gaps</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <GapTile label="On-Time Delivery %" needs="requested_ship_date populated from ePIC" />
                <GapTile label="Past Due Orders" needs="requested/promised ship date from ePIC" />
                <GapTile label="Material Stockouts" needs="on-hand vs. demand stockout events" />
              </div>
            </div>

            {/* ── HOLD DETAIL ── */}
            {d.holdRows.length > 0 && (
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted mb-2">Orders on hold</p>
                <div className="card !rounded-lg ring-1 ring-stone-200 shadow-none overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-stone-50/60">
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-ink-muted border-b border-stone-200">
                        <th className="px-4 py-2">Order</th>
                        <th className="px-4 py-2">Customer</th>
                        <th className="px-4 py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.holdRows.map((h, i) => (
                        <tr key={i} className="border-b border-stone-100 last:border-0">
                          <td className="px-4 py-2 text-[12px] font-mono text-ink-mid">{h.order_number || '—'}</td>
                          <td className="px-4 py-2 text-[13px] text-ink-strong">{h.customer_name || '—'}</td>
                          <td className="px-4 py-2 text-[12px] text-ink-muted">{h.hold_reason || h.hold_status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
