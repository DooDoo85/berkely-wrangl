import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";

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

const STATUS_COLORS = {
  submitted:     { bg: "bg-blue-100",   text: "text-blue-800"   },
  printed:       { bg: "bg-purple-100", text: "text-purple-800" },
  in_production: { bg: "bg-violet-100", text: "text-violet-800" },
  complete:      { bg: "bg-emerald-100",text: "text-emerald-800"},
  invoiced:      { bg: "bg-gray-100",   text: "text-gray-600"   },
};

export default function RepHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const repName = profile?.rep_id;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = repName?.split(" ")[0] || profile?.email?.split("@")[0] || "there";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    submittedWTD: null,
    inProduction: null,
    followUpsDueToday: null,
    overdueFollowUps: null,
    myOrders: [],
    followUps: [],
  });

  const load = useCallback(async () => {
    if (!repName) return;
    setLoading(true);
    try {
      const weekStart = startOfWeek();
      const today = new Date().toISOString().slice(0, 10);

      const [submittedRes, inProdRes, ordersRes, followUpsRes] = await Promise.all([
        // orders submitted this week
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("sales_rep", repName)
          .eq("status", "submitted")
          .gte("created_at", weekStart),

        // orders in production
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("sales_rep", repName)
          .eq("status", "in_production"),

        // active orders for this rep
        supabase
          .from("orders")
          .select("id, order_number, customer_name, status, updated_at")
          .eq("sales_rep", repName)
          .in("status", ["submitted", "printed", "in_production"])
          .order("updated_at", { ascending: true })
          .limit(8),

        // follow-ups
        supabase
          .from("activities")
          .select("*, customers(account_name)")
          .eq("completed", false)
          .lte("follow_up_date", today)
          .order("follow_up_date", { ascending: true })
          .limit(6),
      ]);

      const orders = ordersRes.data ?? [];
      const followUps = followUpsRes.data ?? [];
      const overdue = followUps.filter((f) => f.follow_up_date < today).length;
      const dueToday = followUps.filter((f) => f.follow_up_date === today).length;

      setData({
        submittedWTD: submittedRes.count ?? 0,
        inProduction: inProdRes.count ?? 0,
        followUpsDueToday: dueToday,
        overdueFollowUps: overdue,
        myOrders: orders,
        followUps,
      });
    } catch (err) {
      console.error("RepHome load error:", err);
    } finally {
      setLoading(false);
    }
  }, [repName]);

  useEffect(() => { load(); }, [load]);

  const TYPE_ICONS = { call: "📞", email: "✉️", note: "📝", meeting: "🤝" };

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* header */}
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900">{greeting}, {firstName}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Week of {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      </div>

      {/* quick actions */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <button
          onClick={() => navigate("/orders/new")}
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-sm flex-shrink-0">＋</div>
          <div>
            <p className="text-sm font-medium text-gray-800">New order</p>
            <p className="text-xs text-gray-400">Create &amp; submit</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/customers/new")}
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-sm flex-shrink-0">👤</div>
          <div>
            <p className="text-sm font-medium text-gray-800">New customer</p>
            <p className="text-xs text-gray-400">Add account</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/activities")}
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">📋</div>
          <div>
            <p className="text-sm font-medium text-gray-800">Log activity</p>
            <p className="text-xs text-gray-400">Call, email, note</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/customers")}
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-sm flex-shrink-0">🔍</div>
          <div>
            <p className="text-sm font-medium text-gray-800">Search customer</p>
            <p className="text-xs text-gray-400">Find account</p>
          </div>
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Submitted this week"
          value={loading ? "—" : data.submittedWTD}
          status="neutral"
          delta="new orders"
        />
        <KpiCard
          label="In production"
          value={loading ? "—" : data.inProduction}
          status="neutral"
          delta="being built"
        />
        <KpiCard
          label="Follow-ups due today"
          value={loading ? "—" : data.followUpsDueToday}
          status={data.followUpsDueToday > 0 ? "yellow" : "green"}
          delta={data.overdueFollowUps > 0 ? `${data.overdueFollowUps} overdue` : "All clear"}
        />
        <KpiCard
          label="Pipeline value"
          value="—"
          status="neutral"
          delta="submitted + in production"
        />
      </div>

      {/* orders + follow-ups */}
      <div className="grid grid-cols-2 gap-4">
        {/* my orders */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">My orders in progress</p>
            <button onClick={() => navigate("/orders")} className="text-xs text-indigo-500 hover:text-indigo-700">View all</button>
          </div>
          {loading && <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>}
          {!loading && data.myOrders.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">No active orders</p>
          )}
          {data.myOrders.map((o) => {
            const days = daysSince(o.updated_at);
            const stuck = days > 5;
            const sc = STATUS_COLORS[o.status] ?? STATUS_COLORS.submitted;
            return (
              <div
                key={o.id}
                onClick={() => navigate(`/orders/${o.id}`)}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
              >
                <div>
                  <p className="text-xs font-medium text-gray-800">{o.order_number ?? o.id}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{o.customer_name ?? "—"}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stuck ? "bg-red-100 text-red-700" : `${sc.bg} ${sc.text}`}`}>
                    {stuck ? `Stuck day ${days}` : o.status.replace(/_/g, " ")}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">Day {days}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* follow-ups */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Follow-ups due</p>
            <button onClick={() => navigate("/activities")} className="text-xs text-indigo-500 hover:text-indigo-700">View all</button>
          </div>
          {loading && <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>}
          {!loading && data.followUps.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">No follow-ups due 🎉</p>
          )}
          {data.followUps.map((f) => {
            const today = new Date().toISOString().slice(0, 10);
            const overdue = f.follow_up_date < today;
            return (
              <div
                key={f.id}
                onClick={() => navigate("/activities")}
                className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${overdue ? "bg-red-400" : "bg-emerald-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {TYPE_ICONS[f.activity_type]} {f.subject || f.body?.slice(0, 40) || "Follow up"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.customers?.account_name ?? "—"}</p>
                  <p className={`text-xs mt-0.5 ${overdue ? "text-red-500" : "text-gray-400"}`}>
                    {overdue
                      ? `Overdue · ${f.follow_up_date}`
                      : `Due today`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
