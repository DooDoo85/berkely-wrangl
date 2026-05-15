import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}
function startOfWeek() {
  const d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
  return d.toISOString();
}
function startOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString();
}
function fmt$(n) {
  if (!n) return "$0";
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n/1000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
function fmt$Full(n) {
  if (!n) return "$0";
  return `$${Math.round(n).toLocaleString()}`;
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

function Sparkline({ data = [], color = "#7c3aed", fillColor = "#ede9fe" }) {
  if (!data.length) return <div className="h-10" />;
  // Sqrt scaling — compresses outliers and expands small variations.
  // A $100 day shows at sqrt(100)/sqrt(20000) ≈ 7%, vs raw ratio of 0.5% — much more visible.
  const sqrtData = data.map(v => Math.sqrt(Math.max(0, v)));
  const max = Math.max(...sqrtData, 1);
  const w = 280, h = 40;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = sqrtData.map((sv, i) => {
    const x = i * step;
    const y = h - (sv / max) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = points.join(" ");
  const fillPath = `${linePath} ${w},${h} 0,${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-10">
      <polyline points={fillPath} fill={fillColor} stroke="none" opacity="0.85" />
      <polyline points={linePath} fill="none" stroke={color} strokeWidth="1.25" />
    </svg>
  );
}

// ─── Hero card (Roller / Faux with sparkline) ───────────────────────────────

function HeroCard({ label, accent, fill, data, sparkData, creditOkCount, printedCount, loading, onClick }) {
  return (
    <div onClick={onClick}
      className="card card-hover p-4 md:p-6 cursor-pointer">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
          <span className="text-sm font-medium text-ink-strong truncate">{label}</span>
        </div>
        <span className="text-xs text-ink-muted flex-shrink-0 ml-2">View →</span>
      </div>

      {/* Dollar amount: stack WTD label below on mobile (was inline-baseline) */}
      <div className="mb-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl md:text-3xl font-medium text-ink-strong tabular-nums">
            {loading ? "—" : fmt$Full(data.sales_wtd)}
          </span>
          <span className="text-xs text-ink-muted">WTD</span>
        </div>
        <span className="text-xs text-ink-muted tabular-nums">
          {loading ? "" : `${(data.units_wtd ?? 0).toLocaleString()} units`}
        </span>
      </div>

      <div className="mb-4">
        <Sparkline data={sparkData} color={accent} fillColor={fill} />
      </div>

      {/* Stats row — 2x2 on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
        <div>
          <p className="text-[10px] text-ink-muted uppercase tracking-wide">MTD</p>
          <p className="text-sm font-medium text-ink-strong tabular-nums mt-0.5">
            {loading ? "—" : fmt$(data.sales_mtd)}
          </p>
          <p className="text-[10px] text-ink-muted tabular-nums mt-0.5">
            {loading ? "" : `${(data.units_mtd ?? 0).toLocaleString()} units`}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-ink-muted uppercase tracking-wide">YTD</p>
          <p className="text-sm font-medium text-ink-strong tabular-nums mt-0.5">
            {loading ? "—" : fmt$(data.sales_ytd)}
          </p>
          <p className="text-[10px] text-ink-muted tabular-nums mt-0.5">
            {loading ? "" : `${(data.units_ytd ?? 0).toLocaleString()} units`}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-ink-muted uppercase tracking-wide">Credit OK</p>
          <p className="text-sm font-medium text-ink-strong tabular-nums mt-0.5">
            {loading ? "—" : creditOkCount}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-ink-muted uppercase tracking-wide">Printed</p>
          <p className="text-sm font-medium text-ink-strong tabular-nums mt-0.5">
            {loading ? "—" : printedCount}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline tile ──────────────────────────────────────────────────────────

function PipelineTile({ label, value, sub, accent, onClick }) {
  const clickable = !!onClick;
  const accentStyle = accent ? { borderTop: `2px solid ${accent}` } : {};
  return (
    <div onClick={onClick} style={accentStyle}
      className={`card px-3 py-3 md:px-4 md:py-3.5 ${clickable ? "cursor-pointer card-hover" : ""}`}>
      <p className="text-[10px] font-medium text-ink-mid uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-medium text-ink-strong tabular-nums mt-1.5">{value}</p>
      {sub && <p className="text-xs text-ink-mid mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Daily Sales chart ──────────────────────────────────────────────────────

function DailySalesChart({ data = [] }) {
  if (!data.length) return <div className="h-32 flex items-center justify-center text-sm text-ink-muted">No data</div>;
  // Sqrt scaling — compresses outliers, expands small days
  const sqrtSales = data.map(d => Math.sqrt(Math.max(0, d.sales)));
  const maxSqrt = Math.max(...sqrtSales, 1);
  const SEG = {
    roller: '#b85d3a',  // accent clay (matches roller tile)
    faux:   '#c2913a',  // accent gold (matches faux tile)
    other:  '#8c7758',  // muted brown
  };
  return (
    <div className="px-1">
      <div className="flex items-end gap-3 h-36 mb-2">
        {data.map((d, i) => {
          const pct = maxSqrt > 0 ? (sqrtSales[i] / maxSqrt) * 100 : 0;
          const isToday = i === data.length - 1;
          const hasData = d.sales > 0;
          // Within the bar, split into three segments proportional to product line
          const segs = hasData ? [
            { key: 'roller', amt: d.roller, color: SEG.roller },
            { key: 'faux',   amt: d.faux,   color: SEG.faux },
            { key: 'other',  amt: d.other,  color: SEG.other },
          ].filter(s => s.amt > 0) : [];
          return (
            <div key={i} className="flex-1 group relative flex flex-col items-stretch justify-end"
              style={{ height: `${Math.max(pct, hasData ? 6 : 0)}%`, minHeight: hasData ? '4px' : '0' }}>
              {hasData && (
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-ink-strong text-ink-inverse text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                  <div>{fmt$(d.sales)} · {d.orders} orders</div>
                  {d.roller > 0 && <div>Roller: {fmt$(d.roller)}</div>}
                  {d.faux   > 0 && <div>Faux: {fmt$(d.faux)}</div>}
                  {d.other  > 0 && <div>Other: {fmt$(d.other)}</div>}
                </div>
              )}
              <div className="flex flex-col-reverse w-full h-full rounded-t overflow-hidden transition-all"
                style={{ opacity: isToday ? 1 : 0.9 }}>
                {segs.map(s => {
                  const segPct = (s.amt / d.sales) * 100;
                  return (
                    <div key={s.key}
                      style={{ height: `${segPct}%`, background: s.color }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mb-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[11px] text-ink-strong font-semibold tabular-nums">
            {d.sales > 0 ? fmt$(d.sales) : '—'}
          </div>
        ))}
      </div>
      <div className="flex gap-3 mb-3">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-ink-mid font-medium">
            {i === data.length - 1 ? "Today" : d.label}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-ink-mid">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: SEG.roller }} />Roller
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: SEG.faux }} />Faux
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: SEG.other }} />Other
        </span>
      </div>
    </div>
  );
}

// ─── Production Flow — Started vs Invoiced per day (grid readout) ──────────────────

function ProductionFlowChart({ data = [] }) {
  if (!data.length) return <div className="h-32 flex items-center justify-center text-sm text-ink-muted">No data</div>;

  // Week totals
  const totalStartedOrders   = data.reduce((s, d) => s + (d.started || 0), 0);
  const totalStartedUnits    = data.reduce((s, d) => s + (d.started_units || 0), 0);
  const totalInvoicedOrders  = data.reduce((s, d) => s + (d.invoiced || 0), 0);
  const totalInvoicedUnits   = data.reduce((s, d) => s + (d.invoiced_units || 0), 0);

  // Net WIP delta: positive = invoicing faster than starting (queue draining)
  const netDelta = totalInvoicedOrders - totalStartedOrders;

  return (
    <div className="space-y-4">
      {/* Week totals — two pills */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(194,145,58,0.10)' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#c2913a' }} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Started</div>
            <div className="text-base font-bold text-ink-strong tabular-nums leading-tight">{totalStartedOrders} <span className="text-xs text-ink-muted font-medium">orders</span></div>
            <div className="text-[10px] text-ink-mid tabular-nums">{totalStartedUnits.toLocaleString()} units</div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(91,140,90,0.10)' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#5b8c5a' }} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Invoiced</div>
            <div className="text-base font-bold text-ink-strong tabular-nums leading-tight">{totalInvoicedOrders} <span className="text-xs text-ink-muted font-medium">orders</span></div>
            <div className="text-[10px] text-ink-mid tabular-nums">{totalInvoicedUnits.toLocaleString()} units</div>
          </div>
        </div>
      </div>

      {/* Per-day grid */}
      <div className="border-t pt-3" style={{ borderColor: 'var(--surface-border)' }}>
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-ink-muted">
              <th className="text-left font-medium text-[10px] uppercase tracking-wider pb-1.5">Day</th>
              {data.map((d, i) => (
                <th key={i} className="text-right font-medium text-[10px] uppercase tracking-wider pb-1.5">
                  {i === data.length - 1 ? 'Today' : d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-ink-mid py-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#c2913a' }} />
                Started
              </td>
              {data.map((d, i) => (
                <td key={i} className="text-right py-1.5 text-ink-strong">
                  {d.started > 0 ? (
                    <span><span className="font-semibold">{d.started}</span> <span className="text-ink-muted">· {d.started_units.toLocaleString()}u</span></span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className="text-ink-mid py-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#5b8c5a' }} />
                Invoiced
              </td>
              {data.map((d, i) => (
                <td key={i} className="text-right py-1.5 text-ink-strong">
                  {d.invoiced > 0 ? (
                    <span><span className="font-semibold">{d.invoiced}</span> <span className="text-ink-muted">· {d.invoiced_units.toLocaleString()}u</span></span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Net flow indicator */}
      <div className="border-t pt-3 text-[11px] text-ink-mid" style={{ borderColor: 'var(--surface-border)' }}>
        {netDelta > 0 ? (
          <span>Net flow: <span className="text-status-healthy font-semibold">+{netDelta} draining</span> · invoicing faster than starting</span>
        ) : netDelta < 0 ? (
          <span>Net flow: <span className="text-status-warning font-semibold">{netDelta} building</span> · starting faster than invoicing</span>
        ) : (
          <span>Net flow: <span className="font-semibold">balanced</span></span>
        )}
      </div>
    </div>
  );
}

// ─── Top Customers list ─────────────────────────────────────────────────────

function TopCustomersList({ customers = [], loading, onCustomerClick }) {
  if (loading) {
    return <div className="text-sm text-ink-muted text-center py-6">Loading…</div>;
  }
  if (!customers.length) {
    return <div className="text-sm text-ink-muted text-center py-6">No customer activity this week</div>;
  }
  const maxSales = Math.max(...customers.map(c => c.sales), 1);
  return (
    <div className="space-y-3">
      {customers.map((c) => {
        const pct = Math.round((c.sales / maxSales) * 100);
        return (
          <div key={c.name} onClick={() => onCustomerClick?.(c.name)}
            className="cursor-pointer group">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-sm text-ink-strong group-hover:text-ink-strong truncate pr-2">
                {c.name}
              </span>
              <span className="text-sm font-medium text-ink-strong tabular-nums whitespace-nowrap">
                {fmt$Full(c.sales)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-[#e6dcc8] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#b85d3a' }} />
              </div>
              <span className="text-[10px] text-ink-muted tabular-nums whitespace-nowrap w-16 text-right">
                {c.orders} order{c.orders !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function ExecutiveHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(new Date());
  const [wipModal, setWipModal] = useState(null);
  const [creditOkModal, setCreditOkModal] = useState(false);
  const [fauxPrintedModal, setFauxPrintedModal] = useState(false);
  const [inProductionModal, setInProductionModal] = useState(false);
  const [creditOkRows, setCreditOkRows] = useState([]);
  const [data, setData] = useState({
    stuckOrders: [], avgDays: null, repOrders: [],
    overdueOrders: [],
    faux: {}, roller: {},
    fauxSpark: [], rollerSpark: [],
    wip: { creditOK: [], printed: [] },
    creditOk: { count: 0, total: 0 },
    creditOkRoller: { count: 0, total: 0 },
    creditOkFaux: { count: 0, total: 0 },
    printedTotal: { count: 0, units: 0 },
    fauxPrintedTotal: { count: 0, units: 0 },
    inProductionCount: 0,
    inProductionUnits: 0,
    topCustomers: [],
    dailySales: [],
    productionFlow: [],
    todayEntered: 0, todayShipped: 0, todaySales: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart  = startOfWeek();
      const weekStartDate = weekStart.slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      // ── In Production count + units ───────────────────────────────────
      // PIC's flow is Printed → Invoiced (no in-between). Rene's "Start Production"
      // button in Wrangl creates this middle stage by setting wrangl_status only.
      // So wrangl_status is the sole source of truth here.
      const { data: inProductionRows } = await supabase.from("orders")
        .select("total_units")
        .eq("wrangl_status", "in_production");
      const inProductionCount = (inProductionRows ?? []).length;
      const inProductionUnits = (inProductionRows ?? []).reduce((s, r) => s + (r.total_units || 0), 0);

      // ── Avg days printed → invoiced (last 90 days) ───────────────────
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const { data: printedHistory } = await supabase
        .from('order_status_history')
        .select('order_number, status_date')
        .eq('to_status', 'printed')
        .gte('status_date', ninetyDaysAgo);
      const { data: invoicedHistory } = await supabase
        .from('order_status_history')
        .select('order_number, status_date')
        .eq('to_status', 'invoiced')
        .gte('status_date', ninetyDaysAgo);

      let avgDays = null;
      if (printedHistory?.length && invoicedHistory?.length) {
        const printedMap = {};
        printedHistory.forEach(r => {
          if (!printedMap[r.order_number] || r.status_date < printedMap[r.order_number]) {
            printedMap[r.order_number] = r.status_date;
          }
        });
        const invoicedMap = {};
        invoicedHistory.forEach(r => {
          if (!invoicedMap[r.order_number] || r.status_date > invoicedMap[r.order_number]) {
            invoicedMap[r.order_number] = r.status_date;
          }
        });
        const deltas = [];
        for (const [orderNo, printedDate] of Object.entries(printedMap)) {
          const invoicedDate = invoicedMap[orderNo];
          if (invoicedDate && invoicedDate >= printedDate) {
            const days = Math.round((new Date(invoicedDate) - new Date(printedDate)) / 86400000);
            if (days >= 0 && days <= 60) deltas.push(days);
          }
        }
        if (deltas.length >= 3) {
          avgDays = (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1);
        }
      }

      // ── Roller WIP ────────────────────────────────────────────────────
      const { data: wipData } = await supabase.from("roller_wip").select("*").order("days_in_status", { ascending: false });
      const creditOK = (wipData ?? []).filter(r => r.order_status === "CREDIT OK");
      const printed  = (wipData ?? []).filter(r => r.order_status === "PRINTED");

      // ── Orders on Hold ──────────────────────────────────────────────────
      // Filters by hold_reason (not status) to capture both flavors:
      //   • status='on_hold' + reason set → full hold (e.g., Pete)
      //   • status=printed/in_production + reason set → operational hold (e.g., Rene waiting on parts)
      // Exclude invoiced/cancelled — once shipped/closed, the hold is historical.
      const { data: heldOrders } = await supabase.from("orders")
        .select("id, order_number, customer_name, status, hold_reason, hold_note, wrangl_status_set_at, updated_at")
        .not("hold_reason", "is", null)
        .not("status", "in", "(invoiced,cancelled)");
      const stuckOrders = (heldOrders ?? []).map(o => {
        const holdDate = o.wrangl_status_set_at || o.updated_at;
        const days = holdDate ? daysSince(holdDate) : 0;
        return {
          key: `held-${o.id}`,
          order_id: o.id,
          order_no: o.order_number,
          customer: o.customer_name,
          status_label: o.status,
          days,
          hold_reason: o.hold_reason,
        };
      }).sort((a, b) => b.days - a.days).slice(0, 5);

      // ── Overdue / Stuck Orders calculated after trulyIdleOrders loads below ──

      // ── Credit OK / HOLD ──────────────────────────────────────────────
      const { data: creditOkRowsData } = await supabase
        .from("credit_ok_orders")
        .select("order_no, salesperson, customer_name, order_amount, entered_date, order_status, product_line")
        .order("entered_date", { ascending: false });
      const creditAll = (creditOkRowsData ?? []).filter(r => r.order_status === 'CREDIT OK');
      const creditOk = {
        count: creditAll.length,
        total: creditAll.reduce((s, r) => s + Number(r.order_amount || 0), 0),
      };
      const creditOkRoller = { count: creditAll.filter(r => r.product_line === 'roller').length };
      const creditOkFaux   = { count: creditAll.filter(r => r.product_line === 'faux').length };
      setCreditOkRows(creditOkRowsData ?? []);

      // ── Truly Printed (idle, ready for Rene to start) ─────────────────
      // Source of truth for both PRINTED tiles + Stuck Orders. Uses Wrangl's
      // status column (not epic_status) so we filter out:
      //   • orders Rene has flipped to in_production (status='in_production')
      //   • orders Wrangl knows are shipped but PIC hasn't caught up (status='invoiced')
      //   • orders with any hold_reason (handled by Orders on Hold widget)
      const { data: trulyIdleOrders } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, sidemark, total_units, order_amount, product_line, epic_status_date")
        .eq("status", "printed")
        .is("wrangl_status", null)
        .is("hold_reason", null)
        .order("epic_status_date", { ascending: false });
      const idleRoller = (trulyIdleOrders ?? []).filter(r => r.product_line === 'roller');
      const idleFaux   = (trulyIdleOrders ?? []).filter(r => r.product_line === 'faux');

      const printedTotal = {
        count: idleRoller.length,
        units: idleRoller.reduce((s, r) => s + (r.total_units || 0), 0),
      };
      const fauxPrintedTotal = {
        count: idleFaux.length,
        units: idleFaux.reduce((s, r) => s + (r.total_units || 0), 0),
      };

      // ── Overdue / Stuck Orders (truly idle roller, past SLA) ──────────
      // Now derived from idleRoller (orders table) instead of roller_wip.
      // Only flags orders that are TRULY waiting on Rene — excludes:
      //   • in_production (Rene's already cutting)
      //   • on_hold (blocked by parts, tracked separately)
      //   • status='invoiced' (Wrangl knows shipped but PIC stale)
      // Per-customer SLA overrides: Blindster=2d, others default to 5d.
      const { data: slaRows } = await supabase
        .from("customers")
        .select("account_name, sla_print_to_ship_days")
        .not("sla_print_to_ship_days", "is", null);
      const slaMap = {};
      (slaRows ?? []).forEach(r => {
        if (r.account_name) slaMap[r.account_name.toUpperCase()] = Number(r.sla_print_to_ship_days);
      });
      const DEFAULT_PRINT_SLA = 5;
      const calcCalendarDays = (dateStr) => {
        if (!dateStr) return 0;
        const start = new Date(dateStr);
        const end = new Date();
        return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
      };
      const overdueOrders = idleRoller
        .map(r => {
          const customerKey = (r.customer_name || '').toUpperCase();
          const slaDays = slaMap[customerKey] ?? DEFAULT_PRINT_SLA;
          const daysInStatus = calcCalendarDays(r.epic_status_date);
          const daysOver = daysInStatus - slaDays;
          return {
            key: `overdue-${r.id || r.order_number}`,
            order_id: r.id,
            order_no: r.order_number,
            customer: r.customer_name,
            sidemark: r.sidemark,
            days_in_status: daysInStatus,
            sla_days: slaDays,
            days_over: daysOver,
            total_units: r.total_units,
            total_sales: r.order_amount,
          };
        })
        .filter(r => r.days_over > 0)
        .sort((a, b) => b.days_over - a.days_over)
        .slice(0, 5);

      // ── Product line sales ────────────────────────────────────────────
      const { data: productLines } = await supabase.from("product_line_sales").select("*");
      const faux   = (productLines ?? []).find(p => p.product_line === "Faux Wood Blinds") ?? {};
      const roller = (productLines ?? []).find(p => p.product_line === "Roller Shades") ?? {};

      // ── Team — orders invoiced this week ──────────────────────────────
      // sales_rep is null on most invoiced orders (ePIC processor doesn't populate it).
      // Fallback chain: orders.sales_rep → credit_ok_orders.salesperson (recent) → customers.sales_rep (always)
      const { data: invoicedRows } = await supabase.from("orders")
        .select("order_number, customer_name, sales_rep")
        .eq("status", "invoiced").gte("epic_status_date", weekStartDate);

      // Build rep lookup from credit_ok_orders snapshot (recent passers-through)
      const repByOrderNo = {};
      (creditOkRowsData ?? []).forEach(r => {
        if (r.order_no && r.salesperson) repByOrderNo[r.order_no] = r.salesperson;
      });

      // Build rep lookup from customers table (most reliable)
      const customerNames = [...new Set((invoicedRows ?? []).map(r => r.customer_name).filter(Boolean))];
      const repByCustomer = {};
      if (customerNames.length) {
        const { data: customerRows } = await supabase.from("customers")
          .select("account_name, sales_rep")
          .in("account_name", customerNames);
        (customerRows ?? []).forEach(c => {
          if (c.account_name && c.sales_rep) repByCustomer[c.account_name] = c.sales_rep;
        });
      }

      const repMap = {};
      (invoicedRows ?? []).forEach(r => {
        const name = (r.sales_rep || repByOrderNo[r.order_number] || repByCustomer[r.customer_name] || "").trim();
        if (name) repMap[name] = (repMap[name] ?? 0) + 1;
      });
      const repOrders = Object.entries(repMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // ── Daily sales — last 5 business days, status != quote ──────────
      // Walk back from today, skip Sat/Sun, until we have 5 weekdays.
      const businessDays = [];
      const cur = new Date();
      cur.setHours(0, 0, 0, 0);
      while (businessDays.length < 5) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
          businessDays.unshift(new Date(cur)); // prepend so oldest is first
        }
        cur.setDate(cur.getDate() - 1);
      }
      const earliestBizDay = businessDays[0].toISOString().slice(0, 10);
      const { data: dailySalesRows } = await supabase
        .from("orders")
        .select("order_date, order_amount, product_line")
        .gte("order_date", earliestBizDay)
        .neq("status", "quote")
        .not("order_date", "is", null);

      // Bucket by day + product line so the chart can render stacked bars.
      // product_line normalized into roller/faux/other (anything else lumped).
      const salesByDay = {};
      (dailySalesRows ?? []).forEach(r => {
        const d = r.order_date;
        const amt = Number(r.order_amount || 0);
        const line = (r.product_line || '').toLowerCase();
        const seg = line === 'roller' ? 'roller' : line === 'faux' ? 'faux' : 'other';
        salesByDay[d] = salesByDay[d] || { orders: 0, sales: 0, roller: 0, faux: 0, other: 0 };
        salesByDay[d].orders++;
        salesByDay[d].sales += amt;
        salesByDay[d][seg] += amt;
      });
      const dailySales = businessDays.map(d => {
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { weekday: "short" });
        const bucket = salesByDay[key] || { orders: 0, sales: 0, roller: 0, faux: 0, other: 0 };
        return {
          label,
          orders: bucket.orders,
          sales: bucket.sales,
          roller: bucket.roller,
          faux: bucket.faux,
          other: bucket.other,
        };
      });

      // ── Production Flow — last 5 business days ────────────────────────
      // Two metrics per day:
      //   • Started: orders Rene flipped to in_production that day (wrangl_status_set_at)
      //   • Invoiced: orders PIC marked invoiced that day (epic_status_date + status='invoiced')
      // Units summed for each, surfaced under the bars.
      const [startedRowsRes, invoicedFlowRes] = await Promise.all([
        supabase.from("orders")
          .select("wrangl_status_set_at, total_units")
          .eq("wrangl_status", "in_production")
          .gte("wrangl_status_set_at", earliestBizDay),
        supabase.from("orders")
          .select("epic_status_date, total_units")
          .eq("status", "invoiced")
          .gte("epic_status_date", earliestBizDay),
      ]);

      const flowByDay = {};
      businessDays.forEach(d => {
        const key = d.toISOString().slice(0, 10);
        flowByDay[key] = { started: 0, started_units: 0, invoiced: 0, invoiced_units: 0 };
      });
      (startedRowsRes.data ?? []).forEach(r => {
        if (!r.wrangl_status_set_at) return;
        const key = r.wrangl_status_set_at.slice(0, 10);
        if (flowByDay[key]) {
          flowByDay[key].started++;
          flowByDay[key].started_units += Number(r.total_units || 0);
        }
      });
      (invoicedFlowRes.data ?? []).forEach(r => {
        if (!r.epic_status_date) return;
        const key = r.epic_status_date;
        if (flowByDay[key]) {
          flowByDay[key].invoiced++;
          flowByDay[key].invoiced_units += Number(r.total_units || 0);
        }
      });
      const productionFlow = businessDays.map(d => {
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { weekday: "short" });
        const b = flowByDay[key];
        return {
          label,
          started: b.started,
          started_units: b.started_units,
          invoiced: b.invoiced,
          invoiced_units: b.invoiced_units,
        };
      });

      // ── Sparklines (30 days, by product line) ─────────────────────────
      const thirtyDaysAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const { data: sparkRows } = await supabase
        .from("orders")
        .select("order_date, order_amount, product_line")
        .gte("order_date", thirtyDaysAgo)
        .neq("status", "quote")
        .not("order_date", "is", null);
      const fauxSparkMap = {};
      const rollerSparkMap = {};
      (sparkRows ?? []).forEach(r => {
        const amt = Number(r.order_amount || 0);
        if (r.product_line === 'faux') fauxSparkMap[r.order_date] = (fauxSparkMap[r.order_date] || 0) + amt;
        if (r.product_line === 'roller') rollerSparkMap[r.order_date] = (rollerSparkMap[r.order_date] || 0) + amt;
      });
      const fauxSpark = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (29 - i));
        return fauxSparkMap[d.toISOString().slice(0, 10)] || 0;
      });
      const rollerSpark = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (29 - i));
        return rollerSparkMap[d.toISOString().slice(0, 10)] || 0;
      });

      // ── Top customers this week ───────────────────────────────────────
      const { data: weekOrders } = await supabase
        .from("orders")
        .select("customer_name, order_amount")
        .gte("order_date", weekStartDate)
        .neq("status", "quote")
        .not("customer_name", "is", null);
      const customerMap = {};
      (weekOrders ?? []).forEach(r => {
        const name = r.customer_name?.trim();
        if (!name) return;
        customerMap[name] = customerMap[name] || { name, sales: 0, orders: 0 };
        customerMap[name].orders++;
        customerMap[name].sales += Number(r.order_amount || 0);
      });
      const topCustomers = Object.values(customerMap)
        .sort((a, b) => b.sales - a.sales || b.orders - a.orders)
        .slice(0, 5);

      // ── Today snapshot ────────────────────────────────────────────────
      const { count: todayEntered } = await supabase.from("orders")
        .select("*", { count: "exact", head: true })
        .eq("order_date", today)
        .neq("status", "quote");
      const { count: todayShipped } = await supabase.from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "invoiced")
        .gte("epic_status_date", today);
      const todaySales = (salesByDay[today]?.sales) || 0;

      // Map idleRoller into roller_wip modal column shape (order_no, customer, etc.)
      // so the existing PRINTED modal renders the same 7 truly-idle rows the tile shows.
      const printedForModal = idleRoller.map(r => ({
        id: r.id,
        order_no: r.order_number,
        customer: r.customer_name,
        sidemark: r.sidemark,
        days_in_status: calcCalendarDays(r.epic_status_date),
        total_units: r.total_units,
        total_sales: r.order_amount,
        order_status: 'PRINTED',
      }));

      setData({
        stuckOrders, avgDays, repOrders, faux, roller,
        overdueOrders,
        fauxSpark, rollerSpark,
        wip: { creditOK, printed: printedForModal },
        creditOk, creditOkRoller, creditOkFaux,
        printedTotal, fauxPrintedTotal,
        inProductionCount: inProductionCount ?? 0,
        inProductionUnits: inProductionUnits ?? 0,
        topCustomers, dailySales, productionFlow,
        todayEntered: todayEntered ?? 0,
        todayShipped: todayShipped ?? 0,
        todaySales,
      });
      setRefreshedAt(new Date());
    } catch(err) { console.error("ExecutiveHome:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stuckTotal = data.stuckOrders?.length ?? 0;
  const overdueTotal = data.overdueOrders?.length ?? 0;
  const wipKey = s => s === "CREDIT OK" ? "creditOK" : "printed";

  const ROLLER_ACCENT = "#b85d3a";  // accent-clay
  const ROLLER_FILL   = "#f0d8c8";  // accent-clay-soft
  const FAUX_ACCENT   = "#d4a574";  // accent-gold
  const FAUX_FILL     = "#f5e8d4";  // accent-gold-soft

  return (
    <div className="min-h-full">
      <div className="max-w-screen-xl mx-auto p-3 md:p-8">

        {/* ── Header — stacks on mobile so Refresh isn't crammed ────────── */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5 md:mb-6">
          <div>
            <h1 className="font-display text-2xl md:text-4xl">Business Overview</h1>
            <p className="text-sm text-ink-mid mt-1">
              {loading ? "Loading…" : (
                <>
                  {data.todayEntered} order{data.todayEntered !== 1 ? 's' : ''} entered today
                  {data.todayShipped > 0 && <> · {data.todayShipped} shipped</>}
                  {data.todaySales > 0 && <> · {fmt$(data.todaySales)} in sales</>}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center justify-between md:flex-col md:items-end md:text-right md:pt-1">
            <div className="text-xs text-ink-muted md:mb-1.5">
              Updated {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <button onClick={load} disabled={loading}
              className="btn-ghost text-xs px-3 py-1.5">
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* ── Hero Row ── stacks on mobile so cards aren't cramped ─────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 mb-4">
          <HeroCard
            label="Roller Shades"
            accent={ROLLER_ACCENT}
            fill={ROLLER_FILL}
            data={data.roller}
            sparkData={data.rollerSpark}
            creditOkCount={data.creditOkRoller.count}
            printedCount={data.printedTotal.count}
            loading={loading}
            onClick={() => navigate("/orders?product=roller")}
          />
          <HeroCard
            label="Faux Wood Blinds"
            accent={FAUX_ACCENT}
            fill={FAUX_FILL}
            data={data.faux}
            sparkData={data.fauxSpark}
            creditOkCount={data.creditOkFaux.count}
            printedCount={data.fauxPrintedTotal.count}
            loading={loading}
            onClick={() => navigate("/orders?product=faux")}
          />
        </div>

        {/* ── Pipeline Strip — horizontal scroll on mobile, 5-col grid on desktop ─ */}
        <div className="md:grid md:grid-cols-5 md:gap-3 mb-4
                        flex gap-3 overflow-x-auto pb-2 -mx-3 px-3 md:overflow-visible md:mx-0 md:pb-0
                        snap-x snap-mandatory md:snap-none
                        [&>*]:flex-shrink-0 [&>*]:w-[44%] sm:[&>*]:w-[30%] md:[&>*]:w-auto
                        [&>*]:snap-start">
          <PipelineTile
            label="Credit OK"
            value={loading ? "—" : data.creditOk.count}
            sub={data.creditOk.total > 0 ? `${fmt$(data.creditOk.total)} pending` : null}
            onClick={() => setCreditOkModal(true)}
          />
          <PipelineTile
            label="Printed · Roller"
            value={loading ? "—" : data.printedTotal.count}
            sub={data.printedTotal.units > 0 ? `${data.printedTotal.units.toLocaleString()} units` : null}
            accent={ROLLER_ACCENT}
            onClick={() => setWipModal("PRINTED")}
          />
          <PipelineTile
            label="Printed · Faux"
            value={loading ? "—" : data.fauxPrintedTotal.count}
            sub={data.fauxPrintedTotal.units > 0 ? `${data.fauxPrintedTotal.units.toLocaleString()} units` : null}
            accent={FAUX_ACCENT}
            onClick={() => setFauxPrintedModal(true)}
          />
          <PipelineTile
            label="In Production"
            value={loading ? "—" : data.inProductionCount}
            sub={data.inProductionUnits > 0 ? `${data.inProductionUnits.toLocaleString()} units` : (data.inProductionCount > 0 ? "cutting now" : null)}
            onClick={() => setInProductionModal(true)}
          />
          <PipelineTile
            label="Avg P→Inv"
            value={loading ? "—" : (data.avgDays !== null ? `${data.avgDays}d` : "—")}
            sub="90-day rolling"
          />
        </div>

        {/* ── Action Zone: Orders on Hold + Stuck Orders ─ stacks on mobile ─ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Orders on Hold */}
          <div className="card-priority p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-ink-strong">Orders on Hold</h3>
                {stuckTotal > 0 && (
                  <span className="pill-warning">
                    {stuckTotal} on hold
                  </span>
                )}
              </div>
              <button onClick={() => navigate("/orders/on-hold")}
                className="text-xs text-ink-muted hover:text-ink-mid">View all →</button>
            </div>
            {stuckTotal === 0 ? (
              <p className="text-sm text-ink-muted text-center py-6">No orders on hold ✓</p>
            ) : (
              <div className="space-y-1">
                {data.stuckOrders.map(o => {
                  const statusDisplay = (o.status_label || '').replace(/_/g, ' ');
                  return (
                    <div key={o.key} onClick={() => navigate(`/orders/${o.order_id}`)}
                      className="flex items-center justify-between py-2 cursor-pointer hover:bg-surface-page/40 rounded-lg px-2 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-ink-strong">#{o.order_no}</p>
                          {statusDisplay && (
                            <span className="text-[10px] font-medium text-ink-muted bg-surface-page/60 px-1.5 py-0.5 rounded uppercase tracking-wide">
                              {statusDisplay}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-mid mt-0.5 truncate">
                          {o.customer ?? "—"}
                          {o.hold_reason && (
                            <span className="text-ink-muted"> · {o.hold_reason}</span>
                          )}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-2 whitespace-nowrap ${
                        o.days >= 8 ? "bg-status-critical-soft text-status-critical" :
                        o.days >= 3 ? "bg-status-warning-soft text-status-warning" :
                                      "bg-surface-page text-ink-mid"
                      }`}>
                        {o.days}d
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stuck Orders (printed, past SLA) */}
          <div className="card-priority p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-ink-strong">Stuck Orders</h3>
                {overdueTotal > 0 && (
                  <span className="pill-critical">
                    {overdueTotal} past SLA
                  </span>
                )}
              </div>
              <button onClick={() => setWipModal("PRINTED")}
                className="text-xs text-ink-muted hover:text-ink-mid">View all →</button>
            </div>
            {overdueTotal === 0 ? (
              <p className="text-sm text-ink-muted text-center py-6">All printed orders within SLA ✓</p>
            ) : (
              <div className="space-y-1">
                {data.overdueOrders.map(o => (
                  <div key={o.key} onClick={() => navigate(`/orders/${o.order_id}`)}
                    className="flex items-center justify-between py-2 cursor-pointer hover:bg-surface-page/40 rounded-lg px-2 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-ink-strong">#{o.order_no}</p>
                        <span className="text-[10px] font-medium text-ink-muted bg-surface-page/60 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          PRINTED
                        </span>
                      </div>
                      <p className="text-xs text-ink-mid mt-0.5 truncate">
                        {o.customer ?? "—"}
                        {o.sidemark && (
                          <span className="text-ink-muted"> · {o.sidemark}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 whitespace-nowrap">
                      <span className="text-[10px] text-ink-muted">SLA {o.sla_days}d</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        o.days_over >= 5 ? "bg-status-critical-soft text-status-critical" :
                                            "bg-status-warning-soft text-status-warning"
                      }`}>
                        {o.days_in_status}d · +{o.days_over}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Flow Zone: Daily Sales + Production Flow ─ stacks on mobile ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Daily Sales — stacked by product line */}
          <div className="card-priority p-4 md:p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-sm font-medium text-ink-strong">Daily Sales · Last 5 Business Days</h3>
              <span className="text-xs text-ink-muted">orders entered, ex. quotes</span>
            </div>
            <DailySalesChart data={data.dailySales} />
          </div>

          {/* Production Flow — started vs invoiced per day */}
          <div className="card-priority p-4 md:p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-sm font-medium text-ink-strong">Production Flow · Last 5 Business Days</h3>
              <span className="text-xs text-ink-muted">started vs invoiced</span>
            </div>
            <ProductionFlowChart data={data.productionFlow} />
          </div>
        </div>

      </div>

      {/* ── WIP Modal ─────────────────────────────────────────────────── */}
      {wipModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">Roller Shades — {wipModal}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(data.wip?.[wipKey(wipModal)] ?? []).length} orders ·{" "}
                  {(data.wip?.[wipKey(wipModal)] ?? []).reduce((s, r) => s + (r.total_units || 0), 0).toLocaleString()} units
                </p>
              </div>
              <button onClick={() => setWipModal(null)}
                className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Order","Customer","Sidemark","Days","Units","Value"].map(h => (
                      <th key={h} className={`px-5 py-3 text-xs font-bold text-gray-500 uppercase ${["Order","Customer","Sidemark"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.wip?.[wipKey(wipModal)] ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-sm font-semibold text-blue-600">#{r.order_no}</td>
                      <td className="px-5 py-3 text-sm text-gray-700">{r.customer}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{r.sidemark}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.days_in_status > 5 ? "bg-red-100 text-red-600" :
                          r.days_in_status > 2 ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"}`}>
                          {r.days_in_status}d
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-gray-700">{r.total_units}</td>
                      <td className="px-5 py-3 text-right text-sm text-gray-500">
                        ${Number(r.total_sales).toLocaleString("en-US",{maximumFractionDigits:0})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Credit OK Modal ─────────────────────────────────────────────── */}
      {creditOkModal && (() => {
        const filtered = creditOkRows.filter(r =>
          r.order_status === 'CREDIT OK' &&
          (creditOkModal === true || r.product_line === creditOkModal)
        );
        const lineLabel = creditOkModal === 'faux' ? 'Faux' : creditOkModal === 'roller' ? 'Roller' : 'All';
        const totalAmt = filtered.reduce((s, r) => s + Number(r.order_amount || 0), 0);
        return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">Credit OK Orders · {lineLabel}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {filtered.length} orders · ${totalAmt.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                </p>
              </div>
              <button onClick={() => setCreditOkModal(false)}
                className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-left">Order</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-left">Customer</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-left">Salesperson</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-right">Date</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">No orders</td></tr>
                  ) : filtered.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-sm font-semibold text-blue-600">#{r.order_no}</td>
                      <td className="px-5 py-3 text-sm text-gray-700">{r.customer_name}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{r.salesperson}</td>
                      <td className="px-5 py-3 text-right text-xs text-gray-500">
                        {r.entered_date ? new Date(r.entered_date + "T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        ${Number(r.order_amount).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )})()}

      {/* ── Faux Printed Modal ──────────────────────────────────────────── */}
      {fauxPrintedModal && <FauxPrintedModal onClose={() => setFauxPrintedModal(false)} />}
      {inProductionModal && <InProductionModal onClose={() => setInProductionModal(false)} />}
    </div>
  );
}

// ─── Faux Printed Modal ─────────────────────────────────────────────────────

function FauxPrintedModal({ onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('order_number, customer_name, sidemark, total_units, order_amount, epic_status_date')
        .eq('status', 'printed')
        .eq('product_line', 'faux')
        .order('epic_status_date', { ascending: false })
      setRows(data || [])
      setLoading(false)
    })()
  }, [])

  const totalUnits = rows.reduce((s, r) => s + (r.total_units || 0), 0)

  const daysSinceFn = (dateStr) => {
    if (!dateStr) return null
    const start = new Date(dateStr)
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    let days = 0
    const cur = new Date(start)
    cur.setDate(cur.getDate() + 1)
    while (cur <= end) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6) days++
      cur.setDate(cur.getDate() + 1)
    }
    return days
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Printed · Faux Wood</h3>
            <p className="text-xs text-gray-500 mt-0.5">{rows.length} orders · {totalUnits.toLocaleString()} units</p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                {["Order","Customer","Sidemark","Days","Units","Value"].map(h => (
                  <th key={h} className={`px-5 py-3 text-xs font-bold text-gray-500 uppercase ${["Order","Customer","Sidemark"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">No printed faux orders</td></tr>
              ) : rows.map((r, i) => {
                const days = daysSinceFn(r.epic_status_date)
                return (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-sm font-semibold text-blue-600">#{r.order_number}</td>
                    <td className="px-5 py-3 text-sm text-gray-700">{r.customer_name}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{r.sidemark || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      {days !== null ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          days > 5 ? "bg-red-100 text-red-600" :
                          days > 2 ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"}`}>
                          {days}d
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-semibold text-gray-700">{r.total_units || 0}</td>
                    <td className="px-5 py-3 text-right text-sm text-gray-500">
                      ${Number(r.order_amount || 0).toLocaleString("en-US",{maximumFractionDigits:0})}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function InProductionModal({ onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    (async () => {
      // PIC has no in_production state — Rene's "Start Production" flips wrangl_status only.
      // wrangl_status_set_at is when Rene started; this is the timer for days-in-production.
      const { data } = await supabase
        .from('orders')
        .select('order_number, customer_name, sidemark, total_units, order_amount, product_line, wrangl_status_set_at')
        .eq('wrangl_status', 'in_production')
        .order('wrangl_status_set_at', { ascending: false })
      setRows(data || [])
      setLoading(false)
    })()
  }, [])

  const totalUnits = rows.reduce((s, r) => s + (r.total_units || 0), 0)

  // Business-day calculation (skips weekends)
  const daysSinceFn = (dateStr) => {
    if (!dateStr) return null
    const start = new Date(dateStr)
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    let days = 0
    const cur = new Date(start)
    cur.setDate(cur.getDate() + 1)
    while (cur <= end) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6) days++
      cur.setDate(cur.getDate() + 1)
    }
    return days
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">In Production</h3>
            <p className="text-xs text-gray-500 mt-0.5">{rows.length} orders · {totalUnits.toLocaleString()} units</p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                {["Order","Customer","Sidemark","Line","Days","Units","Value"].map(h => (
                  <th key={h} className={`px-5 py-3 text-xs font-bold text-gray-500 uppercase ${["Order","Customer","Sidemark","Line"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">No orders in production</td></tr>
              ) : rows.map((r, i) => {
                const days = daysSinceFn(r.wrangl_status_set_at)
                return (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-sm font-semibold text-blue-600">#{r.order_number}</td>
                    <td className="px-5 py-3 text-sm text-gray-700">{r.customer_name}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{r.sidemark || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500 uppercase">{r.product_line || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      {days !== null ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          days > 10 ? "bg-red-100 text-red-600" :
                          days > 5  ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"}`}>
                          {days}d
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-semibold text-gray-700">{r.total_units || 0}</td>
                    <td className="px-5 py-3 text-right text-sm text-gray-500">
                      ${Number(r.order_amount || 0).toLocaleString("en-US",{maximumFractionDigits:0})}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
