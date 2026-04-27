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
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
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

function fmt$(n) {
  if (!n) return "$0";
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold tracking-[0.14em] text-stone-400 uppercase mb-3 px-0.5">{label}</p>
      {children}
    </div>
  );
}

function MiniBar({ data = [], color = "#cbd5e1" }) {
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 gap-1">
          <div
            className="w-full rounded-sm"
            style={{ height: `${Math.max((d.v / max) * 44, 2)}px`, background: d.highlight ? "#1d4ed8" : color }}
          />
          {(i === 0 || i === 7 || i === 14) && (
            <span className="text-stone-400" style={{ fontSize: 8 }}>{d.l}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ExecutiveHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(new Date());
  const [wipModal, setWipModal] = useState(null);
  const [data, setData] = useState({
    shippedWTD: null, shippedMTD: null, inProduction: null,
    stuckOrders: [], productionLoad: {}, avgDays: null,
    outOfStock: [], lowStock: [], lowStockTotal: 0,
    repOrders: [], dailyShipped: [], weeklyThroughput: [],
    faux: {}, roller: {},
    wip: { creditOK: [], printed: [] },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart  = startOfWeek();
      const monthStart = startOfMonth();
      const thirtyAgo  = last30Days();

      const { count: shippedWTD } = await supabase
        .from("orders").select("*", { count: "exact", head: true })
        .eq("status", "invoiced").gte("updated_at", weekStart);

      const { count: shippedMTD } = await supabase
        .from("orders").select("*", { count: "exact", head: true })
        .eq("status", "invoiced").gte("updated_at", monthStart);

      const { count: inProduction } = await supabase
        .from("orders").select("*", { count: "exact", head: true })
        .in("status", ["submitted", "printed", "in_production"]);

      const { data: activeOrders } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, status, sales_rep, updated_at")
        .in("status", ["submitted", "printed", "in_production"])
        .order("updated_at", { ascending: true });

      const stuckOrders = (activeOrders ?? [])
        .filter((o) => ["submitted", "printed"].includes(o.status) && daysSince(o.updated_at) > 5)
        .sort((a, b) => daysSince(b.updated_at) - daysSince(a.updated_at))
        .slice(0, 5);

      const productionLoad = (activeOrders ?? []).reduce((acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
      }, {});

      const inProdOrders = (activeOrders ?? []).filter((o) => ["submitted", "printed"].includes(o.status));
      const avgDays = inProdOrders.length
        ? (inProdOrders.reduce((s, o) => s + daysSince(o.updated_at), 0) / inProdOrders.length).toFixed(1)
        : null;

      const { data: wipData } = await supabase
        .from("roller_wip").select("*").order("days_in_status", { ascending: false });
      const creditOK = (wipData ?? []).filter(r => r.order_status === "CREDIT OK");
      const printed  = (wipData ?? []).filter(r => r.order_status === "PRINTED");

      const { data: productLines } = await supabase.from("product_line_sales").select("*");
      const faux   = (productLines ?? []).find(p => p.product_line === "Faux Wood Blinds") ?? {};
      const roller = (productLines ?? []).find(p => p.product_line === "Roller Shades") ?? {};

      const { data: parts } = await supabase
        .from("parts").select("id, name, part_type, qty_on_hand, reorder_level")
        .or("qty_on_hand.lte.0,and(reorder_level.gt.0,qty_on_hand.lt.reorder_level)")
        .order("qty_on_hand", { ascending: true }).limit(20);
      const outOfStock = (parts ?? []).filter((p) => p.qty_on_hand <= 0).slice(0, 3);
      const lowStock   = (parts ?? []).filter((p) => p.qty_on_hand > 0).slice(0, 3);

      const { data: repRows } = await supabase
        .from("orders").select("sales_rep")
        .eq("status", "invoiced").gte("updated_at", weekStart)
        .not("sales_rep", "is", null);
      const repMap = {};
      (repRows ?? []).forEach((r) => {
        const name = r.sales_rep?.trim();
        if (name) repMap[name] = (repMap[name] ?? 0) + 1;
      });
      const repOrders = Object.entries(repMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      const { data: shippedRows } = await supabase
        .from("orders").select("updated_at")
        .eq("status", "invoiced").gte("updated_at", thirtyAgo)
        .order("updated_at", { ascending: true });
      const dayMap = {};
      (shippedRows ?? []).forEach((r) => {
        const d   = new Date(r.updated_at);
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        dayMap[key] = (dayMap[key] ?? 0) + 1;
      });
      const dailyShipped = Array.from({ length: 15 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (14 - i));
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        return { l: d.getDate().toString(), v: dayMap[key] ?? 0, highlight: i === 14 };
      });

      setData({
        shippedWTD, shippedMTD, inProduction,
        stuckOrders, productionLoad, avgDays,
        outOfStock, lowStock, lowStockTotal: (parts ?? []).length,
        repOrders, dailyShipped,
        faux, roller,
        wip: { creditOK, printed },
      });
      setRefreshedAt(new Date());
    } catch (err) {
      console.error("ExecutiveHome load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stuckTotal    = data.stuckOrders?.length ?? 0;
  const lowStockTotal = data.lowStockTotal ?? 0;

  const avatarColors = [
    { bg: "bg-violet-100", text: "text-violet-800" },
    { bg: "bg-emerald-100", text: "text-emerald-800" },
    { bg: "bg-blue-100",   text: "text-blue-800"   },
    { bg: "bg-amber-100",  text: "text-amber-800"  },
    { bg: "bg-rose-100",   text: "text-rose-800"   },
    { bg: "bg-teal-100",   text: "text-teal-800"   },
  ];
  const initials = (name) => name?.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  const wipKey = (status) => status === "CREDIT OK" ? "creditOK" : "printed";

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="max-w-screen-xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-stone-800">Business Overview</h1>
            <p className="text-sm text-stone-400 mt-0.5">What needs attention right now</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-400">
              Updated {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              onClick={load} disabled={loading}
              className="text-xs px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-stone-600
                         hover:bg-stone-50 hover:border-stone-300 disabled:opacity-40 transition-all shadow-sm"
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* ── Roller WIP Hero ─────────────────────────────────────────────── */}
        <Section label="Roller Shades — Production Status">
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "creditOK", status: "CREDIT OK", label: "Credit OK",
                bg: "bg-blue-600", textLight: "text-blue-100", subBg: "bg-blue-700/40" },
              { key: "printed",  status: "PRINTED",   label: "Printed",
                bg: "bg-amber-500", textLight: "text-amber-100", subBg: "bg-amber-600/40" },
            ].map(card => {
              const orders = data.wip?.[card.key] ?? [];
              const units  = orders.reduce((s, r) => s + (r.total_units || 0), 0);
              const sales  = orders.reduce((s, r) => s + (r.total_sales || 0), 0);
              const stuck  = orders.filter(r => r.days_in_status > 5).length;
              return (
                <div key={card.key} onClick={() => setWipModal(card.status)}
                  className={`${card.bg} rounded-2xl p-5 cursor-pointer hover:opacity-95 hover:shadow-lg transition-all`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-widest ${card.textLight} mb-1`}>{card.label}</p>
                      <p className="text-5xl font-display font-bold text-white">{loading ? "—" : units.toLocaleString()}</p>
                      <p className={`text-sm ${card.textLight} mt-1`}>units · {orders.length} orders</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-display font-bold text-white">{loading ? "—" : fmt$(sales)}</p>
                      <p className={`text-xs ${card.textLight} mt-0.5`}>total value</p>
                    </div>
                  </div>
                  <div className={`flex items-center justify-between ${card.subBg} rounded-xl px-4 py-2.5`}>
                    {stuck > 0
                      ? <span className="text-xs text-red-200 font-semibold">⚠ {stuck} stuck &gt;5 days</span>
                      : <span className={`text-xs ${card.textLight}`}>All on track</span>}
                    <span className={`text-xs font-semibold ${card.textLight}`}>View details →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Product Line Performance ─────────────────────────────────────── */}
        <Section label="Product Line Performance — MTD">
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "faux",   label: "Faux Wood Blinds", accent: "#f59e0b", lightBg: "bg-amber-50",  border: "border-l-amber-400"  },
              { key: "roller", label: "Roller Shades",    accent: "#6366f1", lightBg: "bg-indigo-50", border: "border-l-indigo-400" },
            ].map(line => {
              const d = data[line.key] ?? {};
              return (
                <div key={line.key} onClick={() => navigate(`/orders?product=${line.key}`)}
                  className={`bg-white border border-stone-200 border-l-4 ${line.border} rounded-xl p-5
                              cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: line.accent }} />
                      <p className="text-sm font-bold text-stone-700">{line.label}</p>
                    </div>
                    <span className="text-xs text-stone-400">View orders →</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "WTD Units", value: d.units_wtd, sub: fmt$(d.sales_wtd), hi: false },
                      { label: "MTD Units", value: d.units_mtd, sub: fmt$(d.sales_mtd), hi: true  },
                      { label: "YTD Units", value: d.units_ytd, sub: fmt$(d.sales_ytd), hi: false },
                    ].map((stat, i) => (
                      <div key={i} className={`${stat.hi ? line.lightBg : "bg-stone-50"} rounded-lg p-3 text-center`}>
                        <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-1">{stat.label}</p>
                        <p className={`text-2xl font-display font-bold ${stat.hi ? "text-stone-800" : "text-stone-500"}`}>
                          {loading ? "—" : (stat.value ?? "—")}
                        </p>
                        <p className="text-xs text-stone-400 mt-0.5">{loading ? "" : stat.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Shipped Chart ────────────────────────────────────────────────── */}
        <Section label="Orders Shipped — Last 15 Days">
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <MiniBar data={data.dailyShipped} />
          </div>
        </Section>

        {/* ── Bottlenecks ──────────────────────────────────────────────────── */}
        <Section label="Bottlenecks & Risks">
          <div className="grid grid-cols-3 gap-4">

            {/* Stuck Orders */}
            <div className={`rounded-xl p-4 border ${stuckTotal > 0 ? "bg-red-50 border-red-200" : "bg-white border-stone-200"}`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-xs font-bold uppercase tracking-wide ${stuckTotal > 0 ? "text-red-600" : "text-stone-400"}`}>Stuck Orders</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${stuckTotal > 0 ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-400"}`}>
                  {stuckTotal} flagged
                </span>
              </div>
              {stuckTotal === 0
                ? <p className="text-xs text-stone-400 py-3 text-center">All clear ✓</p>
                : <>
                    {data.stuckOrders?.map((o) => {
                      const days = daysSince(o.updated_at);
                      return (
                        <div key={o.id} className="flex items-center justify-between py-2 border-b border-red-100 last:border-0">
                          <div>
                            <p className="text-xs font-semibold text-stone-800">{o.order_number ?? o.id}</p>
                            <p className="text-xs text-stone-400 mt-0.5">{o.sales_rep ?? "—"} · {o.status?.replace(/_/g, " ")}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${days >= 8 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            Day {days}
                          </span>
                        </div>
                      );
                    })}
                    <button onClick={() => navigate("/orders?filter=stuck")}
                      className="mt-2 text-xs text-red-500 hover:text-red-700 font-semibold">
                      View all →
                    </button>
                  </>
              }
            </div>

            {/* Inventory Risk */}
            <div className={`rounded-xl p-4 border ${lowStockTotal > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-stone-200"}`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-xs font-bold uppercase tracking-wide ${lowStockTotal > 0 ? "text-amber-600" : "text-stone-400"}`}>Inventory Risk</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${lowStockTotal > 0 ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-400"}`}>
                  {lowStockTotal} items
                </span>
              </div>
              {lowStockTotal === 0
                ? <p className="text-xs text-stone-400 py-3 text-center">Stock levels healthy ✓</p>
                : <>
                    {data.outOfStock?.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                        <div>
                          <p className="text-xs font-semibold text-stone-800 truncate max-w-[140px]">{p.name}</p>
                          <p className="text-xs text-stone-400 mt-0.5">{p.part_type} · qty {p.qty_on_hand}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">Out</span>
                      </div>
                    ))}
                    {data.lowStock?.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                        <div>
                          <p className="text-xs font-semibold text-stone-800 truncate max-w-[140px]">{p.name}</p>
                          <p className="text-xs text-stone-400 mt-0.5">{p.part_type} · qty {p.qty_on_hand}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">Low</span>
                      </div>
                    ))}
                    <button onClick={() => navigate("/inventory?filter=low")}
                      className="mt-2 text-xs text-amber-600 hover:text-amber-800 font-semibold">
                      View all →
                    </button>
                  </>
              }
            </div>

            {/* Production Load */}
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Production Load</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-stone-100 text-stone-500">
                  {data.inProduction ?? 0} active
                </span>
              </div>
              {[
                { label: "Submitted",     key: "submitted",     color: "bg-blue-400"   },
                { label: "Printed",       key: "printed",       color: "bg-amber-400"  },
                { label: "In Production", key: "in_production", color: "bg-violet-400" },
              ].map(s => {
                const count = data.productionLoad?.[s.key] ?? 0;
                const total = (data.inProduction ?? 0) || 1;
                const pct   = Math.round((count / total) * 100);
                return (
                  <div key={s.key} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-stone-600 font-medium">{s.label}</span>
                      <span className="text-stone-500 font-semibold">{count}</span>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full">
                      <div className={`h-1.5 rounded-full ${s.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {data.avgDays && (
                <div className="mt-3 pt-3 border-t border-stone-100 flex justify-between text-xs">
                  <span className="text-stone-400">Avg days in status</span>
                  <span className={`font-semibold ${Number(data.avgDays) > 5 ? "text-red-500" : Number(data.avgDays) > 3 ? "text-amber-500" : "text-stone-600"}`}>
                    {data.avgDays}d
                  </span>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ── Team Snapshot ────────────────────────────────────────────────── */}
        <Section label="Team — Orders Invoiced This Week">
          {data.repOrders?.length === 0
            ? <p className="text-xs text-stone-400">No orders invoiced this week yet</p>
            : <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
                {data.repOrders.map((rep, i) => {
                  const c = avatarColors[i % avatarColors.length];
                  return (
                    <div key={rep.name} className="bg-white border border-stone-200 rounded-xl p-3 text-center hover:shadow-sm transition-shadow">
                      <div className={`w-8 h-8 rounded-full ${c.bg} ${c.text} flex items-center justify-center text-xs font-bold mx-auto mb-2`}>
                        {initials(rep.name)}
                      </div>
                      <p className="text-xs font-semibold text-stone-600 truncate">{rep.name.split(" ")[0]}</p>
                      <p className="text-2xl font-display font-bold text-stone-800 mt-0.5">{rep.count}</p>
                      <p className="text-[10px] text-stone-400">orders</p>
                    </div>
                  );
                })}
              </div>
          }
        </Section>

      </div>

      {/* ── WIP Modal ──────────────────────────────────────────────────────── */}
      {wipModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <div>
                <h3 className="font-display font-bold text-stone-800">Roller Shades — {wipModal}</h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  {(data.wip?.[wipKey(wipModal)] ?? []).length} orders ·{" "}
                  {(data.wip?.[wipKey(wipModal)] ?? []).reduce((s, r) => s + (r.total_units || 0), 0).toLocaleString()} units
                </p>
              </div>
              <button onClick={() => setWipModal(null)}
                className="text-stone-400 hover:text-stone-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-100 transition-colors text-lg">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="sticky top-0 bg-stone-50 border-b border-stone-100">
                  <tr>
                    {["Order", "Customer", "Sidemark", "Days", "Units", "Value"].map(h => (
                      <th key={h} className={`px-5 py-3 text-xs font-bold text-stone-400 uppercase ${h === "Order" || h === "Customer" || h === "Sidemark" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.wip?.[wipKey(wipModal)] ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-sm font-semibold text-indigo-600">#{r.order_no}</td>
                      <td className="px-5 py-3 text-sm text-stone-700">{r.customer}</td>
                      <td className="px-5 py-3 text-xs text-stone-400">{r.sidemark}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          r.days_in_status > 5 ? "bg-red-100 text-red-700" :
                          r.days_in_status > 2 ? "bg-amber-100 text-amber-700" :
                          "bg-stone-100 text-stone-500"
                        }`}>{r.days_in_status}d</span>
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-stone-700">{r.total_units}</td>
                      <td className="px-5 py-3 text-right text-sm text-stone-500">
                        ${Number(r.total_sales).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
