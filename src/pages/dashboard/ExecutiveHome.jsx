import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// ─── helpers ────────────────────────────────────────────────────────────────

function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function startOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1)); // Mon
  return d.toISOString();
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function last30Days() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── sub-components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, delta, status = "neutral" }) {
  const styles = {
    green:   { bg: "bg-emerald-50",  label: "text-emerald-700", value: "text-emerald-900",  delta: "text-emerald-600"  },
    yellow:  { bg: "bg-amber-50",    label: "text-amber-700",   value: "text-amber-900",    delta: "text-amber-600"    },
    red:     { bg: "bg-red-50",      label: "text-red-700",     value: "text-red-900",      delta: "text-red-600"      },
    neutral: { bg: "bg-gray-50",     label: "text-gray-500",    value: "text-gray-900",     delta: "text-gray-400"     },
  };
  const s = styles[status];
  return (
    <div className={`${s.bg} rounded-lg p-4`}>
      <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${s.label}`}>{label}</p>
      <p className={`text-3xl font-medium ${s.value}`}>{value ?? "—"}</p>
      {delta && <p className={`text-xs mt-1 ${s.delta}`}>{delta}</p>}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">{children}</p>
  );
}

function MiniBar({ data, color = "#a5b4fc" }) {
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 gap-1">
          <div
            className="w-full rounded-t"
            style={{ height: `${Math.max((d.v / max) * 72, 3)}px`, background: d.highlight ? "#6366f1" : color }}
          />
          <span className="text-gray-400" style={{ fontSize: 9 }}>{d.l}</span>
        </div>
      ))}
    </div>
  );
}

function RiskRow({ primary, secondary, badge, badgeColor }) {
  const colors = {
    red:    "bg-red-100 text-red-800",
    yellow: "bg-amber-100 text-amber-800",
    gray:   "bg-gray-100 text-gray-600",
  };
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-xs font-medium text-gray-800">{primary}</p>
        {secondary && <p className="text-xs text-gray-400 mt-0.5">{secondary}</p>}
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ml-3 ${colors[badgeColor] ?? colors.gray}`}>
        {badge}
      </span>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ExecutiveHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(new Date());
  const [data, setData] = useState({
    shippedWTD: null,
    shippedMTD: null,
    inProduction: null,
    stuckOrders: [],
    lowStock: [],
    outOfStock: [],
    productionLoad: {},
    repOrders: [],
    dailyShipped: [],
    weeklyThroughput: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart  = startOfWeek();
      const monthStart = startOfMonth();
      const thirtyAgo  = last30Days();

      // shipped WTD
      const { count: shippedWTD } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "invoiced")
        .gte("updated_at", weekStart);

      // shipped MTD
      const { count: shippedMTD } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "invoiced")
        .gte("updated_at", monthStart);

      // in production = submitted + printed + complete
      const { count: inProduction } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .in("status", ["submitted", "printed", "complete"]);

      // all active orders to find stuck ones + production load
      const { data: activeOrders } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, status, sales_rep, updated_at")
        .in("status", ["submitted", "printed", "complete"])
        .order("updated_at", { ascending: true });

      const stuckOrders = (activeOrders ?? [])
        .filter((o) => ["submitted", "printed"].includes(o.status) && daysSince(o.updated_at) > 5)
        .sort((a, b) => daysSince(b.updated_at) - daysSince(a.updated_at))
        .slice(0, 5);

      const productionLoad = (activeOrders ?? []).reduce((acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
      }, {});

      // avg days for submitted + printed orders
      const inProdOrders = (activeOrders ?? []).filter((o) => ["submitted", "printed"].includes(o.status));
      const avgDays = inProdOrders.length
        ? (inProdOrders.reduce((s, o) => s + daysSince(o.updated_at), 0) / inProdOrders.length).toFixed(1)
        : null;

      // inventory risk
      const { data: parts } = await supabase
        .from("parts")
        .select("id, name, category, qty_on_hand, reorder_level")
        .or("qty_on_hand.lte.0,and(reorder_level.gt.0,qty_on_hand.lt.reorder_level)")
        .order("qty_on_hand", { ascending: true })
        .limit(20);

      const outOfStock = (parts ?? []).filter((p) => p.qty_on_hand <= 0).slice(0, 3);
      const lowStock   = (parts ?? []).filter((p) => p.qty_on_hand > 0).slice(0, 3);

      // rep orders WTD (invoiced this week)
      const { data: repRows } = await supabase
        .from("orders")
        .select("sales_rep")
        .eq("status", "invoiced")
        .gte("updated_at", weekStart)
        .not("sales_rep", "is", null);

      const repMap = {};
      (repRows ?? []).forEach((r) => {
        const name = r.sales_rep?.trim();
        if (name) repMap[name] = (repMap[name] ?? 0) + 1;
      });
      const repOrders = Object.entries(repMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // daily shipped last 30 days (group by date)
      const { data: shippedRows } = await supabase
        .from("orders")
        .select("updated_at")
        .in("status", ["shipped", "invoiced"])
        .gte("updated_at", thirtyAgo)
        .order("updated_at", { ascending: true });

      const dayMap = {};
      (shippedRows ?? []).forEach((r) => {
        const d = new Date(r.updated_at);
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        dayMap[key] = (dayMap[key] ?? 0) + 1;
      });
      // build last 15 day labels for display
      const dailyShipped = Array.from({ length: 15 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (14 - i));
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        const lbl = i === 14 ? "Today" : `${d.getMonth() + 1}/${d.getDate()}`;
        return { l: lbl.replace(/^\d+\//, ""), v: dayMap[key] ?? 0, highlight: i === 14 };
      });

      // weekly throughput (Mon–Fri this week)
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      const weeklyThroughput = days.map((l, i) => {
        const d = new Date();
        const dow = d.getDay() || 7;
        d.setDate(d.getDate() - (dow - 1) + i);
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        return { l, v: dayMap[key] ?? 0, highlight: i === dow - 2 };
      });

      setData({
        shippedWTD, shippedMTD, inProduction,
        stuckOrders, productionLoad, avgDays,
        outOfStock, lowStock,
        lowStockTotal: (parts ?? []).length,
        repOrders, dailyShipped, weeklyThroughput,
      });
      setRefreshedAt(new Date());
    } catch (err) {
      console.error("ExecutiveHome load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const avatarColors = [
    { bg: "bg-violet-100", text: "text-violet-800" },
    { bg: "bg-emerald-100", text: "text-emerald-800" },
    { bg: "bg-blue-100",   text: "text-blue-800"   },
    { bg: "bg-amber-100",  text: "text-amber-800"  },
    { bg: "bg-rose-100",   text: "text-rose-800"   },
    { bg: "bg-teal-100",   text: "text-teal-800"   },
  ];

  const initials = (name) => name?.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  const stuckTotal = data.stuckOrders?.length ?? 0;
  const lowStockTotal = data.lowStockTotal ?? 0;

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-gray-900">Business overview</h1>
          <p className="text-sm text-gray-400 mt-0.5">What needs attention right now</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            Updated {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* KPI row */}
      <SectionLabel>Health snapshot</SectionLabel>
      <div className="grid grid-cols-5 gap-3 mb-6">
        <KpiCard label="Shipped this week"  value={data.shippedWTD}   status="green"   delta="invoiced or shipped" />
        <KpiCard label="Shipped this month" value={data.shippedMTD}   status="green"   delta="month to date" />
        <KpiCard label="In production"      value={data.inProduction} status="neutral" delta="across all reps" />
        <KpiCard
          label="Stuck orders"
          value={stuckTotal}
          status={stuckTotal === 0 ? "green" : stuckTotal < 5 ? "yellow" : "red"}
          delta={stuckTotal === 0 ? "All clear" : "Need attention"}
        />
        <KpiCard
          label="Low / out of stock"
          value={lowStockTotal}
          status={lowStockTotal === 0 ? "green" : lowStockTotal < 5 ? "yellow" : "red"}
          delta={`${data.outOfStock?.length ?? 0} fully out`}
        />
      </div>

      {/* charts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Orders shipped — last 15 days</p>
          <MiniBar data={data.dailyShipped} color="#a5b4fc" />
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Production throughput — this week</p>
          <MiniBar data={data.weeklyThroughput} color="#6ee7b7" />
        </div>
      </div>

      {/* bottlenecks */}
      <SectionLabel>Bottlenecks &amp; risks</SectionLabel>
      <div className="grid grid-cols-3 gap-4 mb-6">

        {/* stuck orders */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Stuck orders</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stuckTotal > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
              {stuckTotal} flagged
            </span>
          </div>
          {stuckTotal === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">No stuck orders — all clear</p>
          )}
          {data.stuckOrders?.map((o) => {
            const days = daysSince(o.updated_at);
            return (
              <RiskRow
                key={o.id}
                primary={`${o.order_number ?? o.id} · ${o.customer_name ?? "—"}`}
                secondary={`${o.sales_rep ?? "—"} · ${o.status?.replace(/_/g, " ")}`}
                badge={`Day ${days}`}
                badgeColor={days >= 8 ? "red" : "yellow"}
              />
            );
          })}
          {stuckTotal > 0 && (
            <button
              onClick={() => navigate("/orders?filter=stuck")}
              className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              View all stuck orders →
            </button>
          )}
        </div>

        {/* inventory risk */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Inventory risk</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lowStockTotal > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
              {lowStockTotal} items
            </span>
          </div>
          {data.outOfStock?.map((p) => (
            <RiskRow
              key={p.id}
              primary={p.name}
              secondary={`${p.category} · qty ${p.qty_on_hand}`}
              badge="Out of stock"
              badgeColor="red"
            />
          ))}
          {data.lowStock?.map((p) => (
            <RiskRow
              key={p.id}
              primary={p.name}
              secondary={`${p.category} · qty ${p.qty_on_hand}`}
              badge="Low stock"
              badgeColor="yellow"
            />
          ))}
          {lowStockTotal === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">Stock levels look healthy</p>
          )}
          {lowStockTotal > 0 && (
            <button
              onClick={() => navigate("/inventory?filter=low")}
              className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              View inventory health →
            </button>
          )}
        </div>

        {/* production load */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Production load</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
              {data.inProduction ?? 0} active
            </span>
          </div>
          <RiskRow primary="Submitted"  secondary="Waiting to start"   badge={String(data.productionLoad?.submitted ?? 0)}  badgeColor="gray" />
          <RiskRow primary="Printed"    secondary="On floor"           badge={String(data.productionLoad?.printed ?? 0)}    badgeColor="gray" />
          <RiskRow primary="Complete"   secondary="Awaiting invoice"   badge={String(data.productionLoad?.complete ?? 0)}   badgeColor="gray" />
          <RiskRow
            primary="Avg days in production"
            secondary="This week"
            badge={data.avgDays ? `${data.avgDays}d` : "—"}
            badgeColor={data.avgDays > 5 ? "red" : data.avgDays > 3 ? "yellow" : "gray"}
          />
        </div>
      </div>

      {/* team snapshot */}
      <SectionLabel>Team — orders invoiced this week</SectionLabel>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
        {data.repOrders?.length === 0 && (
          <p className="text-xs text-gray-400 col-span-full">No orders submitted this week yet</p>
        )}
        {data.repOrders?.map((rep, i) => {
          const c = avatarColors[i % avatarColors.length];
          return (
            <div key={rep.name} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className={`w-8 h-8 rounded-full ${c.bg} ${c.text} flex items-center justify-center text-xs font-medium mx-auto mb-2`}>
                {initials(rep.name)}
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">{rep.name}</p>
              <p className="text-xl font-medium text-gray-900 mt-1">{rep.count}</p>
              <p className="text-xs text-gray-400">orders</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
