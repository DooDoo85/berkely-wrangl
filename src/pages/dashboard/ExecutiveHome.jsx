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

// ─── Compact tracker (top-right Credit OK / Printed) ────────────────────────

function StatusTracker({ label, count, total, ordersLabel, color, icon, loading, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl px-5 py-4 transition-all hover:shadow-sm hover:-translate-y-px hover:border-gray-300 min-w-[180px] text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-xs font-semibold ${color.label}`}>{label}</div>
          <div className="text-2xl font-bold text-gray-900 tabular-nums leading-tight mt-1">
            {loading ? "—" : count.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{ordersLabel}</div>
        </div>
        <div className={`w-10 h-10 rounded-full ${color.bg} flex items-center justify-center flex-shrink-0`}>
          <span className={color.icon}>{icon}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Product line card (Faux Wood / Roller Shades) ──────────────────────────

function ProductLineCard({ label, dotColor, accentBorder, iconBg, iconColor, icon, data, loading, onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-sm hover:-translate-y-px transition-all relative overflow-hidden`}>
      <div className={`absolute top-0 left-0 bottom-0 w-1 ${accentBorder}`} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <p className="font-semibold text-gray-900">{label}</p>
        </div>
        <span className="text-xs font-medium text-blue-600 hover:text-blue-700">View orders →</span>
      </div>

      <div className="grid grid-cols-3 gap-4 items-end">
        {[
          { label: "WTD", value: data.units_wtd, sub: fmt$(data.sales_wtd) },
          { label: "MTD", value: data.units_mtd, sub: fmt$(data.sales_mtd) },
          { label: "YTD", value: data.units_ytd, sub: fmt$(data.sales_ytd) },
        ].map(stat => (
          <div key={stat.label}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">
              {loading ? "—" : (stat.value?.toLocaleString() ?? "0")}
            </p>
            <p className="text-xs text-gray-400 mt-1">{loading ? "" : stat.sub}</p>
          </div>
        ))}

        <div className={`absolute right-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full ${iconBg} flex items-center justify-center ${iconColor}`} style={{display:'none'}}>
          {icon}
        </div>
      </div>

      {/* Icon bottom-right */}
      <div className={`absolute right-5 bottom-5 w-12 h-12 rounded-full ${iconBg} flex items-center justify-center ${iconColor}`}>
        {icon}
      </div>
    </div>
  );
}

// ─── Bar chart (Orders Shipped) ─────────────────────────────────────────────

function ShippedChart({ data = [] }) {
  const max = Math.max(...data.map(d => d.v), 1);
  return (
    <div className="relative h-44 px-2">
      {/* Y-axis lines */}
      <div className="absolute inset-0 flex flex-col justify-between py-2 pointer-events-none">
        {[150, 100, 50, 0].map(v => (
          <div key={v} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-8 text-right">{v}</span>
            <div className="flex-1 border-t border-dashed border-gray-200" />
          </div>
        ))}
      </div>
      {/* Bars */}
      <div className="relative h-full flex items-end gap-1.5 pl-10 pr-1 pb-6">
        {data.map((d, i) => {
          const pct = (d.v / 150) * 100;
          const isToday = i === data.length - 1;
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              {d.v > 0 && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  {d.v} units
                </div>
              )}
              <div className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(pct, d.v > 0 ? 2 : 0)}%`,
                  background: isToday ? '#3b82f6' : d.v > 0 ? '#94a3b8' : 'transparent',
                  minHeight: d.v > 0 ? '4px' : '0',
                }}
              />
              <span className="text-[10px] text-gray-400 mt-1 absolute -bottom-5">{d.l}</span>
            </div>
          );
        })}
      </div>
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
  const [creditOkRows, setCreditOkRows] = useState([]);
  const [data, setData] = useState({
    shippedWTD: null, shippedMTD: null, inProduction: null,
    stuckOrders: [], productionLoad: {}, avgDays: null,
    repOrders: [], dailyShipped: [],
    faux: {}, roller: {},
    wip: { creditOK: [], printed: [] },
    creditOk: { count: 0, total: 0 },
    printedTotal: { count: 0, units: 0 },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart  = startOfWeek();
      const monthStart = startOfMonth();

      const { count: shippedWTD } = await supabase.from("orders")
        .select("*",{count:"exact",head:true}).eq("status","invoiced").gte("updated_at",weekStart);
      const { count: shippedMTD } = await supabase.from("orders")
        .select("*",{count:"exact",head:true}).eq("status","invoiced").gte("updated_at",monthStart);
      const { count: inProduction } = await supabase.from("orders")
        .select("*",{count:"exact",head:true}).in("status",["credit_hold","credit_ok","po_sent","printed","in_production"]);

      const { data: activeOrders } = await supabase.from("orders")
        .select("id,order_number,customer_name,status,sales_rep,updated_at,epic_status_date")
        .in("status",["credit_hold","credit_ok","po_sent","printed","in_production"])
        .order("epic_status_date",{ascending:true});

      const stuckOrders = (activeOrders??[])
        .filter(o => ["credit_hold","credit_ok","po_sent","printed"].includes(o.status) && daysSince(o.epic_status_date || o.updated_at) > 5)
        .sort((a,b) => daysSince(b.epic_status_date || b.updated_at)-daysSince(a.epic_status_date || a.updated_at)).slice(0,5);
      const productionLoad = (activeOrders??[]).reduce((acc,o) => {
        acc[o.status]=(acc[o.status]??0)+1; return acc;
      },{});
      const inProdOrders = (activeOrders??[]).filter(o => ["credit_ok","po_sent","printed"].includes(o.status));
      const avgDays = inProdOrders.length
        ? (inProdOrders.reduce((s,o)=>s+daysSince(o.epic_status_date || o.updated_at),0)/inProdOrders.length).toFixed(1) : null;

      const { data: wipData } = await supabase.from("roller_wip").select("*").order("days_in_status",{ascending:false});
      const creditOK = (wipData??[]).filter(r=>r.order_status==="CREDIT OK");
      const printed  = (wipData??[]).filter(r=>r.order_status==="PRINTED");

      // Credit OK from email-imported table
      const { data: creditOkRows } = await supabase
        .from("credit_ok_orders")
        .select("order_no, salesperson, customer_name, order_amount, entered_date")
        .order("entered_date", { ascending: false });
      const creditOk = {
        count: (creditOkRows ?? []).length,
        total: (creditOkRows ?? []).reduce((s, r) => s + Number(r.order_amount || 0), 0),
      };
      setCreditOkRows(creditOkRows ?? []);

      // Printed counts (units from roller_wip + total order count)
      const printedTotal = {
        count: printed.length,
        units: printed.reduce((s, r) => s + (r.total_units || 0), 0),
      };

      const { data: productLines } = await supabase.from("product_line_sales").select("*");
      const faux   = (productLines??[]).find(p=>p.product_line==="Faux Wood Blinds")??{};
      const roller = (productLines??[]).find(p=>p.product_line==="Roller Shades")??{};

      const { data: repRows } = await supabase.from("orders").select("sales_rep")
        .eq("status","invoiced").gte("updated_at",weekStart).not("sales_rep","is",null);
      const repMap = {};
      (repRows??[]).forEach(r=>{ const n=r.sales_rep?.trim(); if(n) repMap[n]=(repMap[n]??0)+1; });
      const repOrders = Object.entries(repMap).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);

      // Roller shipments daily — last 15 days
      const { data: shipmentRows } = await supabase
        .from("roller_shipments_daily")
        .select("ship_date, units")
        .gte("ship_date", new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
        .order("ship_date", { ascending: true });

      const shipMap = {};
      (shipmentRows ?? []).forEach(r => { shipMap[r.ship_date] = r.units; });
      const dailyShipped = Array.from({ length: 15 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (14 - i));
        const key = d.toISOString().slice(0, 10);
        const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return { l: monthDay, v: shipMap[key] ?? 0 };
      });

      setData({
        shippedWTD, shippedMTD, inProduction, stuckOrders, productionLoad, avgDays,
        repOrders, dailyShipped, faux, roller,
        wip: { creditOK, printed },
        creditOk, printedTotal,
      });
      setRefreshedAt(new Date());
    } catch(err) { console.error("ExecutiveHome:",err); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{load();},[load]);

  const stuckTotal = data.stuckOrders?.length ?? 0;
  const wipKey = s => s==="CREDIT OK" ? "creditOK" : "printed";

  // ── Inline icons ─────────────────────────────────────────────────────────

  const Icon = {
    shield: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>,
    printer: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
    blinds:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    roller:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="3" rx="1"/><line x1="6" y1="6" x2="6" y2="18"/><line x1="18" y1="6" x2="18" y2="18"/><rect x="5" y="18" width="14" height="2" rx="1"/></svg>,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto p-8">

        {/* ── Header + Trackers ──────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Business Overview</h1>
            <p className="text-sm text-gray-500 mt-1.5">Here's what's happening across the business.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right pt-1.5">
              <div className="text-xs text-gray-500 mb-2">
                Updated {refreshedAt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
              </div>
              <button onClick={load} disabled={loading}
                className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all font-medium">
                {loading ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>
          </div>
        </div>

        {/* Trackers row (Credit OK / Printed) */}
        <div className="flex justify-end gap-3 -mt-4 mb-6">
          <StatusTracker
            label="Credit OK"
            count={data.creditOk.count}
            ordersLabel={`${data.creditOk.count} orders`}
            color={{ label: "text-emerald-700", bg: "bg-emerald-50", icon: "text-emerald-600" }}
            icon={Icon.shield}
            loading={loading}
            onClick={() => setCreditOkModal(true)}
          />
          <StatusTracker
            label="Printed"
            count={data.printedTotal.units}
            ordersLabel={`${data.printedTotal.count} orders`}
            color={{ label: "text-amber-600", bg: "bg-amber-50", icon: "text-amber-500" }}
            icon={Icon.printer}
            loading={loading}
            onClick={() => setWipModal("PRINTED")}
          />
        </div>

        {/* ── Product Line Performance ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <ProductLineCard
            label="Faux Wood Blinds"
            dotColor="bg-amber-500"
            accentBorder="bg-amber-400"
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            icon={Icon.blinds}
            data={data.faux}
            loading={loading}
            onClick={() => navigate("/orders?product=faux")}
          />
          <ProductLineCard
            label="Roller Shades"
            dotColor="bg-violet-500"
            accentBorder="bg-violet-400"
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
            icon={Icon.roller}
            data={data.roller}
            loading={loading}
            onClick={() => navigate("/orders?product=roller")}
          />
        </div>

        {/* ── Stuck Orders + Production Load ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Stuck Orders */}
          <div className={`rounded-xl border ${stuckTotal>0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"} p-5`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-bold ${stuckTotal>0?"text-red-700":"text-gray-900"}`}>Stuck Orders</h3>
                {stuckTotal>0 && (
                  <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    {stuckTotal} flagged
                  </span>
                )}
              </div>
              <button onClick={()=>navigate("/orders?filter=stuck")}
                className="text-xs font-medium text-blue-600 hover:text-blue-700">View all →</button>
            </div>
            {stuckTotal===0 ? (
              <p className="text-sm text-gray-400 text-center py-4">All clear ✓</p>
            ) : (
              <div className="space-y-1">
                {data.stuckOrders.map(o => {
                  const days = daysSince(o.epic_status_date || o.updated_at);
                  return (
                    <div key={o.id} onClick={()=>navigate(`/orders/${o.id}`)}
                      className="flex items-center justify-between py-2 cursor-pointer hover:bg-red-100/40 rounded-lg px-2 transition-colors">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{o.order_number ?? o.id}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{o.sales_rep ?? "—"} · {o.status?.replace(/_/g," ")}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${days>=8?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>
                        Day {days} →
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Production Load */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-blue-700">Production Load</h3>
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wide">
                {data.inProduction ?? 0} active
              </span>
            </div>
            {[
              { label: "Credit OK",     key: "credit_ok",     color: "bg-emerald-500" },
              { label: "PO Sent",       key: "po_sent",       color: "bg-cyan-500"    },
              { label: "Printed",       key: "printed",       color: "bg-amber-500"   },
              { label: "In Production", key: "in_production", color: "bg-indigo-500"  },
            ].map(s => {
              const count = data.productionLoad?.[s.key] ?? 0;
              const total = (data.inProduction ?? 0) || 1;
              const pct = Math.round((count/total)*100);
              return (
                <div key={s.key} className="mb-4 last:mb-0">
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-gray-700">{s.label}</span>
                    <span className="text-gray-900 font-semibold tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${s.color} transition-all duration-500`} style={{width:`${pct}%`}} />
                  </div>
                </div>
              );
            })}
            {data.avgDays && (
              <div className="mt-5 pt-4 border-t border-gray-100 flex justify-between text-sm">
                <span className="text-gray-500">Avg days in status</span>
                <span className={`font-semibold tabular-nums ${Number(data.avgDays)>5?"text-red-600":Number(data.avgDays)>3?"text-amber-600":"text-blue-700"}`}>
                  {data.avgDays}d
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Team Snapshot ─────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Team — Orders Invoiced This Week</h2>
          {data.repOrders?.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
              No orders invoiced this week yet
            </div>
          ) : (
            <div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))"}}>
              {data.repOrders.map((rep, i) => {
                const colors = [
                  { bg: "bg-violet-100", text: "text-violet-700" },
                  { bg: "bg-emerald-100", text: "text-emerald-700" },
                  { bg: "bg-blue-100", text: "text-blue-700" },
                  { bg: "bg-amber-100", text: "text-amber-700" },
                  { bg: "bg-rose-100", text: "text-rose-700" },
                ];
                const c = colors[i % colors.length];
                const initials = rep.name?.split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2) ?? "?";
                return (
                  <div key={rep.name} className="bg-white border border-gray-200 rounded-xl p-4 text-center hover:shadow-sm transition-shadow">
                    <div className={`w-9 h-9 rounded-full ${c.bg} ${c.text} flex items-center justify-center text-xs font-semibold mx-auto mb-2`}>
                      {initials}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{rep.name.split(" ")[0]}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{rep.count}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">orders</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* WIP Modal */}
      {wipModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">Roller Shades — {wipModal}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(data.wip?.[wipKey(wipModal)]??[]).length} orders ·{" "}
                  {(data.wip?.[wipKey(wipModal)]??[]).reduce((s,r)=>s+(r.total_units||0),0).toLocaleString()} units
                </p>
              </div>
              <button onClick={()=>setWipModal(null)}
                className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Order","Customer","Sidemark","Days","Units","Value"].map(h=>(
                      <th key={h} className={`px-5 py-3 text-xs font-bold text-gray-500 uppercase ${["Order","Customer","Sidemark"].includes(h)?"text-left":"text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.wip?.[wipKey(wipModal)]??[]).map((r,i)=>(
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-sm font-semibold text-blue-600">#{r.order_no}</td>
                      <td className="px-5 py-3 text-sm text-gray-700">{r.customer}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{r.sidemark}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.days_in_status>5?"bg-red-100 text-red-600":
                          r.days_in_status>2?"bg-amber-100 text-amber-700":
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

      {/* Credit OK Modal */}
      {creditOkModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">Credit OK Orders</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {creditOkRows.length} orders · ${creditOkRows.reduce((s,r)=>s+Number(r.order_amount||0),0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                </p>
              </div>
              <button onClick={()=>setCreditOkModal(false)}
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
                  {creditOkRows.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">No orders</td></tr>
                  ) : creditOkRows.map((r,i)=>(
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
      )}
    </div>
  );
}
