import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfWeekISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
  return d.toISOString();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Components ─────────────────────────────────────────────────────────────

function KpiTile({ label, value, loading }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 transition-shadow duration-200 hover:shadow-sm">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">
        {loading ? "—" : value}
      </div>
    </div>
  );
}

function PipelineCard({ label, count, color, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-lg p-5 text-left transition-all duration-200 hover:shadow-sm hover:-translate-y-px hover:border-gray-300"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-gray-900 tabular-nums">
        {loading ? "—" : count}
      </div>
    </button>
  );
}

function QuickAction({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 transition-all duration-200 hover:shadow-sm hover:border-gray-300 text-left"
    >
      <div className="w-8 h-8 rounded-md bg-gray-50 border border-gray-100 flex items-center justify-center text-sm flex-shrink-0">
        {icon}
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function RepHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = profile?.full_name?.split(" ")[0]
    || profile?.email?.split("@")[0]
    || "there";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    kpis:     { newCustomers: 0, meetings: 0, quotesSent: 0, ordersSubmitted: 0 },
    pipeline: { quotesDraft: 0, quotesSent: 0, ordersSubmitted: 0, inProduction: 0 },
    followUps: [],
  });

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const weekStart = startOfWeekISO();
      const weekStartDate = weekStart.slice(0, 10);
      const today = todayISO();

      // Look up rep name for filtering (orders/customers store name strings)
      const { data: repRow } = await supabase
        .from("rep_email_map")
        .select("rep_name")
        .eq("email", profile.email)
        .single();
      const repName = repRow?.rep_name;

      const [
        newCustomersRes,
        meetingsRes,
        quotesSentWTDRes,
        ordersSubmittedWTDRes,
        quotesDraftRes,
        quotesSentRes,
        ordersSubRes,
        inProdRes,
        followUpsRes,
      ] = await Promise.all([
        // KPI 1: New Customers WTD
        repName
          ? supabase.from("customers")
              .select("id", { count: "exact", head: true })
              .eq("sales_rep", repName)
              .gte("created_at", weekStart)
          : Promise.resolve({ count: 0 }),

        // KPI 2: Meetings WTD
        supabase.from("activities")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("activity_type", "meeting")
          .gte("activity_date", weekStartDate),

        // KPI 3: Quotes Sent WTD
        supabase.from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("sales_rep", profile.email)
          .eq("status", "sent")
          .gte("updated_at", weekStart),

        // KPI 4: Orders Submitted WTD
        repName
          ? supabase.from("orders")
              .select("id", { count: "exact", head: true })
              .eq("sales_rep", repName)
              .eq("status", "submitted")
              .gte("created_at", weekStart)
          : Promise.resolve({ count: 0 }),

        // Pipeline: Quotes Draft
        supabase.from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("sales_rep", profile.email)
          .eq("status", "draft"),

        // Pipeline: Quotes Sent (all)
        supabase.from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("sales_rep", profile.email)
          .eq("status", "sent"),

        // Pipeline: Orders Submitted (all)
        repName
          ? supabase.from("orders")
              .select("id", { count: "exact", head: true })
              .eq("sales_rep", repName)
              .eq("status", "submitted")
          : Promise.resolve({ count: 0 }),

        // Pipeline: In Production
        repName
          ? supabase.from("orders")
              .select("id", { count: "exact", head: true })
              .eq("sales_rep", repName)
              .eq("status", "in_production")
          : Promise.resolve({ count: 0 }),

        // Follow-ups due (today or earlier)
        supabase.from("activities")
          .select("id, subject, body, follow_up_date, customer_id, customers(account_name, phone)")
          .eq("user_id", profile.id)
          .eq("completed", false)
          .lte("follow_up_date", today)
          .order("follow_up_date", { ascending: true })
          .limit(8),
      ]);

      setData({
        kpis: {
          newCustomers:    newCustomersRes.count ?? 0,
          meetings:        meetingsRes.count ?? 0,
          quotesSent:      quotesSentWTDRes.count ?? 0,
          ordersSubmitted: ordersSubmittedWTDRes.count ?? 0,
        },
        pipeline: {
          quotesDraft:     quotesDraftRes.count ?? 0,
          quotesSent:      quotesSentRes.count ?? 0,
          ordersSubmitted: ordersSubRes.count ?? 0,
          inProduction:    inProdRes.count ?? 0,
        },
        followUps: followUpsRes.data ?? [],
      });
    } catch (err) {
      console.error("RepHome load:", err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const completeFollowUp = async (id) => {
    await supabase.from("activities").update({ completed: true }).eq("id", id);
    load();
  };

  const today = todayISO();

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Weekly KPI Strip */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">This Week</h2>
        <div className="grid grid-cols-4 gap-4">
          <KpiTile label="New Customers"    value={data.kpis.newCustomers}    loading={loading} />
          <KpiTile label="Meetings"         value={data.kpis.meetings}        loading={loading} />
          <KpiTile label="Quotes Sent"      value={data.kpis.quotesSent}      loading={loading} />
          <KpiTile label="Orders Submitted" value={data.kpis.ordersSubmitted} loading={loading} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction icon="📋" label="New Order"     onClick={() => navigate("/orders/new")} />
          <QuickAction icon="💬" label="New Quote"     onClick={() => navigate("/quotes/new")} />
          <QuickAction icon="👥" label="New Customer"  onClick={() => navigate("/customers/new")} />
          <QuickAction icon="📝" label="Log Activity"  onClick={() => navigate("/activities")} />
        </div>
      </div>

      {/* Follow-ups */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Follow-ups</h2>
          <button onClick={() => navigate("/activities")} className="text-xs font-medium text-blue-600 hover:text-blue-700">
            View all →
          </button>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading && <div className="p-6 text-sm text-gray-400 text-center">Loading…</div>}
          {!loading && data.followUps.length === 0 && (
            <div className="p-8 text-sm text-gray-400 text-center">
              <span className="text-2xl block mb-2">✓</span>
              No follow-ups due. Nice work.
            </div>
          )}
          {!loading && data.followUps.length > 0 && (
            <div className="divide-y divide-gray-100">
              {data.followUps.map(f => {
                const overdue = f.follow_up_date < today;
                const phone = f.customers?.phone;
                return (
                  <div key={f.id} className="p-4 hover:bg-gray-50 transition-colors duration-150 flex items-center gap-4">
                    <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${overdue ? "bg-red-500" : "bg-emerald-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {f.customers?.account_name || "—"}
                        </p>
                        {overdue && (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Overdue</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {f.subject || f.body?.slice(0, 80) || "Follow up"}
                      </p>
                      <p className={`text-xs mt-1 ${overdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
                        Due {new Date(f.follow_up_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {phone && (
                        <a
                          href={`tel:${phone.replace(/\D/g, "")}`}
                          className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                          title={phone}
                        >
                          📞 Call
                        </a>
                      )}
                      <button
                        onClick={() => completeFollowUp(f.id)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                      >
                        ✓ Done
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* My Pipeline */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">My Pipeline</h2>
        <div className="grid grid-cols-4 gap-4">
          <PipelineCard
            label="Quotes Draft"
            count={data.pipeline.quotesDraft}
            color="bg-gray-400"
            loading={loading}
            onClick={() => navigate("/quotes")}
          />
          <PipelineCard
            label="Quotes Sent"
            count={data.pipeline.quotesSent}
            color="bg-blue-500"
            loading={loading}
            onClick={() => navigate("/quotes")}
          />
          <PipelineCard
            label="Orders Submitted"
            count={data.pipeline.ordersSubmitted}
            color="bg-amber-500"
            loading={loading}
            onClick={() => navigate("/orders")}
          />
          <PipelineCard
            label="In Production"
            count={data.pipeline.inProduction}
            color="bg-emerald-500"
            loading={loading}
            onClick={() => navigate("/orders")}
          />
        </div>
      </div>
    </div>
  );
}
