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
  // Use 90th percentile as the visual ceiling so 1-2 outlier days don't flatten the rest.
  // Anything above the 90th percentile clips to the top of the chart.
  const sorted = [...data].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const max = Math.max(p90, ...data.slice(0, 1)) || 1; // never use 0 as max
  const ceiling = Math.max(max, 1);
  const w = 280, h = 40;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data.map((v, i) => {
    const x = i * step;
    const clamped = Math.min(v, ceiling); // clip to 90th percentile
    const y = h - (clamped / ceiling) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = points.join(" ");
  const fillPath = `${linePath} ${w},${h} 0,${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-10">
      <polyline points={fillPath} fill={fillColor} stroke="none" />
      <polyline points={linePath} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Hero card (Roller / Faux with sparkline) ───────────────────────────────

function HeroCard({ label, accent, fill, data, sparkData, creditOkCount, printedCount, loading, onClick }) {
  return (
    <div onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
          <span className="text-sm font-medium text-gray-900">{label}</span>
        </div>
        <span className="text-xs text-gray-400">View orders →</span>
      </div>

      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-3xl font-medium text-gray-900 tabular-nums">
          {loading ? "—" : fmt$Full(data.sales_wtd)}
        </span>
        <span className="text-xs text-gray-400">WTD</span>
      </div>

      <div className="mb-4">
        <Sparkline data={sparkData} color={accent} fillColor={fill} />
      </div>

      <div className="grid grid-cols-4 gap-3 pt-3 border-t border-gray-100">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">MTD</p>
          <p className="text-sm font-medium text-gray-900 tabular-nums mt-0.5">
            {loading ? "—" : fmt$(data.sales_mtd)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">YTD</p>
          <p className="text-sm font-medium text-gray-900 tabular-nums mt-0.5">
            {loading ? "—" : fmt$(data.sales_ytd)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Credit OK</p>
          <p className="text-sm font-medium text-gray-900 tabular-nums mt-0.5">
            {loading ? "—" : creditOkCount}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Printed</p>
          <p className="text-sm font-medium text-gray-900 tabular-nums mt-0.5">
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
      className={`bg-gray-50 rounded-lg px-4 py-3.5 transition-colors ${clickable ? "cursor-pointer hover:bg-gray-100" : ""}`}>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-medium text-gray-900 tabular-nums mt-1.5">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Daily Sales chart ──────────────────────────────────────────────────────

function DailySalesChart({ data = [] }) {
  if (!data.length) return <div className="h-32 flex items-center justify-center text-sm text-gray-400">No data</div>;
  // 90th percentile ceiling so outlier days don't flatten the rest
  const sorted = [...data].map(d => d.sales).sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const ceiling = Math.max(p90, ...sorted.slice(0, 1), 1);
  return (
    <div className="px-1">
      <div className="flex items-end gap-2 h-32 mb-2">
        {data.map((d, i) => {
          const clamped = Math.min(d.sales, ceiling);
          const pct = ceiling > 0 ? (clamped / ceiling) * 100 : 0;
          const isToday = i === data.length - 1;
          const hasData = d.sales > 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              {hasData && (
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                  {fmt$(d.sales)} · {d.orders} orders
                </div>
              )}
              <div className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(pct, hasData ? 4 : 0)}%`,
                  background: isToday ? '#7c3aed' : hasData ? '#c4b5fd' : 'transparent',
                  minHeight: hasData ? '4px' : '0',
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-gray-400">
            {i === data.length - 1 ? "Today" : d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Top Customers list ─────────────────────────────────────────────────────

function TopCustomersList({ customers = [], loading, onCustomerClick }) {
  if (loading) {
    return <div className="text-sm text-gray-400 text-center py-6">Loading…</div>;
  }
  if (!customers.length) {
    return <div className="text-sm text-gray-400 text-center py-6">No customer activity this week</div>;
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
              <span className="text-sm text-gray-900 group-hover:text-gray-700 truncate pr-2">
                {c.name}
              </span>
              <span className="text-sm font-medium text-gray-900 tabular-nums whitespace-nowrap">
                {fmt$Full(c.sales)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap w-16 text-right">
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
  const [creditOkRows, setCreditOkRows] = useState([]);
  const [data, setData] = useState({
    stuckOrders: [], avgDays: null, repOrders: [],
    faux: {}, roller: {},
    fauxSpark: [], rollerSpark: [],
    wip: { creditOK: [], printed: [] },
    creditOk: { count: 0, total: 0 },
    creditOkRoller: { count: 0, total: 0 },
    creditOkFaux: { count: 0, total: 0 },
    printedTotal: { count: 0, units: 0 },
    fauxPrintedTotal: { count: 0, units: 0 },
    inProductionCount: 0,
    topCustomers: [],
    dailySales: [],
    todayEntered: 0, todayShipped: 0, todaySales: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart  = startOfWeek();
      const weekStartDate = weekStart.slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      // ── In Production count (status OR wrangl_status flag) ────────────
      // Rene's "Mark In Production" button only sets wrangl_status to keep ePIC sync from overwriting
      const { count: inProductionCount } = await supabase.from("orders")
        .select("*", { count: "exact", head: true })
        .or("status.eq.in_production,wrangl_status.eq.in_production");

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

      // ── Stuck orders ──────────────────────────────────────────────────
      const wipStuck = (wipData ?? [])
        .filter(w => ["CREDIT OK", "PO SENT", "PRINTED"].includes(w.order_status) && (w.days_in_status ?? 0) > 5)
        .map(w => ({
          key: `wip-${w.wo}`,
          order_no: w.order_no,
          customer: w.customer,
          status_label: w.order_status?.toLowerCase(),
          days: w.days_in_status ?? 0,
          hold_reason: null,
        }));

      const { data: heldOrders } = await supabase.from("orders")
        .select("id, order_number, customer_name, hold_reason, hold_note, wrangl_status_set_at, updated_at")
        .eq("status", "on_hold");
      const heldStuck = (heldOrders ?? []).map(o => {
        const holdDate = o.wrangl_status_set_at || o.updated_at;
        const days = holdDate ? daysSince(holdDate) : 0;
        return {
          key: `held-${o.id}`,
          order_no: o.order_number,
          customer: o.customer_name,
          status_label: 'on hold',
          days,
          hold_reason: o.hold_reason,
        };
      }).filter(o => o.days > 5);

      const stuckOrders = [...wipStuck, ...heldStuck].sort((a, b) => b.days - a.days).slice(0, 5);

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

      // ── Faux printed count ────────────────────────────────────────────
      const { data: fauxPrintedOrders } = await supabase
        .from("orders")
        .select("order_number, total_units")
        .eq("status", "printed")
        .eq("product_line", "faux");
      const fauxPrintedTotal = {
        count: (fauxPrintedOrders ?? []).length,
        units: (fauxPrintedOrders ?? []).reduce((s, r) => s + (r.total_units || 0), 0),
      };
      const printedTotal = {
        count: printed.length,
        units: printed.reduce((s, r) => s + (r.total_units || 0), 0),
      };

      // ── Product line sales ────────────────────────────────────────────
      const { data: productLines } = await supabase.from("product_line_sales").select("*");
      const faux   = (productLines ?? []).find(p => p.product_line === "Faux Wood Blinds") ?? {};
      const roller = (productLines ?? []).find(p => p.product_line === "Roller Shades") ?? {};

      // ── Team — orders invoiced this week ──────────────────────────────
      // sales_rep is null on most invoiced orders (ePIC processor doesn't populate it),
      // so we fall back to credit_ok_orders.salesperson via order_no lookup.
      const { data: invoicedRows } = await supabase.from("orders")
        .select("order_number, sales_rep")
        .eq("status", "invoiced").gte("epic_status_date", weekStartDate);

      // Build a salesperson lookup from credit_ok_orders (already loaded above)
      const repByOrderNo = {};
      (creditOkRowsData ?? []).forEach(r => {
        if (r.order_no && r.salesperson) {
          repByOrderNo[r.order_no] = r.salesperson;
        }
      });

      const repMap = {};
      (invoicedRows ?? []).forEach(r => {
        const name = (r.sales_rep || repByOrderNo[r.order_number] || "").trim();
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
        .select("order_date, order_amount")
        .gte("order_date", earliestBizDay)
        .neq("status", "quote")
        .not("order_date", "is", null);

      const salesByDay = {};
      (dailySalesRows ?? []).forEach(r => {
        const d = r.order_date;
        const amt = Number(r.order_amount || 0);
        salesByDay[d] = salesByDay[d] || { orders: 0, sales: 0 };
        salesByDay[d].orders++;
        salesByDay[d].sales += amt;
      });
      const dailySales = businessDays.map(d => {
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { weekday: "short" });
        const bucket = salesByDay[key] || { orders: 0, sales: 0 };
        return { label, orders: bucket.orders, sales: bucket.sales };
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

      setData({
        stuckOrders, avgDays, repOrders, faux, roller,
        fauxSpark, rollerSpark,
        wip: { creditOK, printed },
        creditOk, creditOkRoller, creditOkFaux,
        printedTotal, fauxPrintedTotal,
        inProductionCount: inProductionCount ?? 0,
        topCustomers, dailySales,
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
  const wipKey = s => s === "CREDIT OK" ? "creditOK" : "printed";

  const ROLLER_ACCENT = "#7c3aed";
  const ROLLER_FILL   = "#ede9fe";
  const FAUX_ACCENT   = "#d97706";
  const FAUX_FILL     = "#fef3c7";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto p-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Business Overview</h1>
            <p className="text-sm text-gray-500 mt-1">
              {loading ? "Loading…" : (
                <>
                  {data.todayEntered} order{data.todayEntered !== 1 ? 's' : ''} entered today
                  {data.todayShipped > 0 && <> · {data.todayShipped} shipped</>}
                  {data.todaySales > 0 && <> · {fmt$(data.todaySales)} in sales</>}
                </>
              )}
            </p>
          </div>
          <div className="text-right pt-1">
            <div className="text-xs text-gray-400 mb-1.5">
              Updated {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <button onClick={load} disabled={loading}
              className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all font-medium">
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* ── Hero Row ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
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

        {/* ── Pipeline Strip ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3 mb-4">
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
            sub={data.inProductionCount > 0 ? "cutting now" : null}
          />
          <PipelineTile
            label="Avg P→Inv"
            value={loading ? "—" : (data.avgDays !== null ? `${data.avgDays}d` : "—")}
            sub="90-day rolling"
          />
        </div>

        {/* ── Action Zone: Stuck Orders + Top Customers ──────────────────── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Stuck Orders */}
          <div className={`rounded-xl border ${stuckTotal > 0 ? "bg-white border-red-200" : "bg-white border-gray-200"} p-5`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-900">Stuck Orders</h3>
                {stuckTotal > 0 && (
                  <span className="text-[10px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                    {stuckTotal} flagged
                  </span>
                )}
              </div>
              <button onClick={() => navigate("/orders?filter=stuck")}
                className="text-xs text-gray-400 hover:text-gray-600">View all →</button>
            </div>
            {stuckTotal === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">All clear ✓</p>
            ) : (
              <div className="space-y-1">
                {data.stuckOrders.map(o => {
                  const isHold = o.status_label === 'on hold';
                  return (
                    <div key={o.key} onClick={() => navigate(`/orders?search=${o.order_no}`)}
                      className="flex items-center justify-between py-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">#{o.order_no}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {o.customer ?? "—"} · {o.status_label}
                          {isHold && o.hold_reason && (
                            <span className="text-red-600 ml-1">({o.hold_reason})</span>
                          )}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-2 whitespace-nowrap ${
                        isHold ? "bg-red-50 text-red-700" :
                        o.days >= 8 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        {o.days}d
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Customers This Week */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-900">Top Customers · This Week</h3>
              <button onClick={() => navigate("/customers")}
                className="text-xs text-gray-400 hover:text-gray-600">View all →</button>
            </div>
            <TopCustomersList
              customers={data.topCustomers}
              loading={loading}
              onCustomerClick={(name) => navigate(`/customers?search=${encodeURIComponent(name)}`)}
            />
          </div>
        </div>

        {/* ── Context Zone: Team Activity + Daily Sales ──────────────────── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Team Activity */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Team · Orders Invoiced This Week</h3>
            {data.repOrders?.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No orders invoiced this week yet</p>
            ) : (
              <div className="space-y-3">
                {data.repOrders.map((rep) => {
                  const max = Math.max(...data.repOrders.map(r => r.count), 1);
                  const pct = Math.round((rep.count / max) * 100);
                  return (
                    <div key={rep.name}>
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="text-sm text-gray-900 truncate pr-2">{rep.name}</span>
                        <span className="text-sm font-medium text-gray-900 tabular-nums whitespace-nowrap">
                          {rep.count} order{rep.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Daily Sales chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-900">Daily Sales · Last 5 Business Days</h3>
              <span className="text-xs text-gray-400">orders entered, ex. quotes</span>
            </div>
            <DailySalesChart data={data.dailySales} />
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
