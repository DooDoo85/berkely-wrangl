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

// ─── KPI Tile ───────────────────────────────────────────────────────────────

function KpiTile({ label, value, loading, iconBg, iconColor, icon }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 transition-shadow duration-200 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
          <div className="mt-1 text-3xl font-bold text-gray-900 tabular-nums leading-none">
            {loading ? "—" : value}
          </div>
          <div className="text-xs text-gray-400 mt-1.5">This week</div>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Action ───────────────────────────────────────────────────────────

function QuickAction({ icon, label, primary, onClick }) {
  if (primary) {
    return (
      <button
        onClick={onClick}
        className="flex items-center justify-center gap-2.5 bg-[#0a2e22] text-white rounded-xl px-5 py-4 transition-all duration-200 hover:bg-[#143f30] font-medium text-sm shadow-sm hover:shadow"
      >
        {icon}
        <span>{label}</span>
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2.5 bg-white border border-gray-200 rounded-xl px-5 py-4 transition-all duration-200 hover:shadow-sm hover:border-gray-300 text-gray-700 font-medium text-sm"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─── Pipeline Card ──────────────────────────────────────────────────────────

function PipelineCard({ label, count, accentColor, dotColor, icon, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      className="relative bg-white border border-gray-200 rounded-xl p-5 text-left transition-all duration-200 hover:shadow-sm hover:-translate-y-px overflow-hidden w-full"
    >
      {/* Top accent border */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accentColor}`} />

      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold text-gray-900 tabular-nums leading-none">
            {loading ? "—" : count}
          </div>
          <div className="text-xs text-emerald-700 font-medium mt-2">View all →</div>
        </div>
        <div className="opacity-60">{icon}</div>
      </div>
    </button>
  );
}

// ─── Icons (inline SVG for crisp display) ───────────────────────────────────

const Icon = {
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  message: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  package: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  fileText: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  edit: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  userPlus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  ),
  check: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  send: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  cal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  phone: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  checkSmall: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
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
    upcomingTasks: [],
  });

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const weekStart = startOfWeekISO();
      const weekStartDate = weekStart.slice(0, 10);
      const today = todayISO();

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
        upcomingTasksRes,
      ] = await Promise.all([
        repName
          ? supabase.from("customers").select("id", { count: "exact", head: true })
              .eq("sales_rep", repName).gte("created_at", weekStart)
          : Promise.resolve({ count: 0 }),

        supabase.from("activities").select("id", { count: "exact", head: true })
          .eq("user_id", profile.id).eq("activity_type", "meeting").gte("activity_date", weekStartDate),

        supabase.from("quotes").select("id", { count: "exact", head: true })
          .eq("sales_rep", profile.email).eq("status", "sent").gte("updated_at", weekStart),

        repName
          ? supabase.from("orders").select("id", { count: "exact", head: true })
              .eq("sales_rep", repName).eq("status", "submitted").gte("created_at", weekStart)
          : Promise.resolve({ count: 0 }),

        supabase.from("quotes").select("id", { count: "exact", head: true })
          .eq("sales_rep", profile.email).eq("status", "draft"),

        supabase.from("quotes").select("id", { count: "exact", head: true })
          .eq("sales_rep", profile.email).eq("status", "sent"),

        repName
          ? supabase.from("orders").select("id", { count: "exact", head: true })
              .eq("sales_rep", repName).eq("status", "submitted")
          : Promise.resolve({ count: 0 }),

        repName
          ? supabase.from("orders").select("id", { count: "exact", head: true })
              .eq("sales_rep", repName).eq("status", "in_production")
          : Promise.resolve({ count: 0 }),

        supabase.from("activities")
          .select("id, subject, body, follow_up_date, customer_id, customers(account_name, phone)")
          .eq("user_id", profile.id).eq("completed", false)
          .lte("follow_up_date", today)
          .order("follow_up_date", { ascending: true }).limit(8),

        supabase.from("tasks")
          .select("id, title, due_date, category, customers(account_name)")
          .eq("user_id", profile.id).eq("completed", false)
          .gt("due_date", today)
          .order("due_date", { ascending: true }).limit(5),
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
        followUps:     followUpsRes.data ?? [],
        upcomingTasks: upcomingTasksRes.data ?? [],
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
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const todayShort = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const fullDate   = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">{todayShort}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="text-gray-400">{Icon.cal}</span>
          <span>{fullDate}</span>
        </div>
      </div>

      {/* Weekly KPI Strip */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiTile label="New Customers"    value={data.kpis.newCustomers}
          loading={loading} iconBg="bg-emerald-50"  iconColor="text-emerald-600" icon={Icon.users} />
        <KpiTile label="Meetings"         value={data.kpis.meetings}
          loading={loading} iconBg="bg-blue-50"     iconColor="text-blue-600"    icon={Icon.calendar} />
        <KpiTile label="Quotes Sent"      value={data.kpis.quotesSent}
          loading={loading} iconBg="bg-purple-50"   iconColor="text-purple-600"  icon={Icon.message} />
        <KpiTile label="Orders Submitted" value={data.kpis.ordersSubmitted}
          loading={loading} iconBg="bg-amber-50"    iconColor="text-amber-600"   icon={Icon.package} />
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick actions</h2>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction primary icon={Icon.plus}      label="New Quote"    onClick={() => navigate("/quotes/new")} />
          <QuickAction         icon={Icon.fileText}  label="New Order"    onClick={() => navigate("/orders/new")} />
          <QuickAction         icon={Icon.edit}      label="Log Activity" onClick={() => navigate("/activities")} />
          <QuickAction         icon={Icon.userPlus}  label="New Customer" onClick={() => navigate("/customers/new")} />
        </div>
      </div>

      {/* Follow-ups */}
      <div className="mb-6">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-gray-900">Follow-ups</h2>
            <button onClick={() => navigate("/activities")} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors">
              View all →
            </button>
          </div>

          {loading && <div className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</div>}

          {!loading && data.followUps.length === 0 && (
            <div className="px-5 pb-6 pt-2 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                {Icon.check}
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">You're all caught up!</div>
                <div className="text-sm text-gray-500 mt-0.5">No follow-ups due. Nice work.</div>
              </div>
            </div>
          )}

          {!loading && data.followUps.length > 0 && (
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {data.followUps.map(f => {
                const overdue = f.follow_up_date < today;
                const phone = f.customers?.phone;
                return (
                  <div key={f.id} className="px-5 py-3 hover:bg-gray-50 transition-colors duration-150 flex items-center gap-4">
                    <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${overdue ? "bg-red-500" : "bg-emerald-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{f.customers?.account_name || "—"}</p>
                        {overdue && <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-wide">Overdue</span>}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{f.subject || f.body?.slice(0, 80) || "Follow up"}</p>
                      <p className={`text-xs mt-0.5 ${overdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
                        Due {new Date(f.follow_up_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {phone && (
                        <a href={`tel:${phone.replace(/\D/g, "")}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
                          {Icon.phone} Call
                        </a>
                      )}
                      <button onClick={() => completeFollowUp(f.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0a2e22] rounded-md hover:bg-[#143f30] transition-colors">
                        {Icon.checkSmall} Done
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
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">My pipeline</h2>
        <div className="grid grid-cols-4 gap-4">
          <PipelineCard
            label="Quotes Draft"
            count={data.pipeline.quotesDraft}
            accentColor="bg-gray-400"
            dotColor="bg-gray-400"
            icon={<div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">{Icon.fileText}</div>}
            loading={loading}
            onClick={() => navigate("/quotes")}
          />
          <PipelineCard
            label="Quotes Sent"
            count={data.pipeline.quotesSent}
            accentColor="bg-blue-500"
            dotColor="bg-blue-500"
            icon={<div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">{Icon.send}</div>}
            loading={loading}
            onClick={() => navigate("/quotes")}
          />
          <PipelineCard
            label="Orders Submitted"
            count={data.pipeline.ordersSubmitted}
            accentColor="bg-amber-500"
            dotColor="bg-amber-500"
            icon={<div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">{Icon.package}</div>}
            loading={loading}
            onClick={() => navigate("/orders")}
          />
          <PipelineCard
            label="In Production"
            count={data.pipeline.inProduction}
            accentColor="bg-emerald-500"
            dotColor="bg-emerald-500"
            icon={<div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">{Icon.settings}</div>}
            loading={loading}
            onClick={() => navigate("/orders")}
          />
        </div>
      </div>

      {/* Upcoming activities */}
      <div className="mb-6">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-gray-900">Upcoming activities</h2>
            <button onClick={() => navigate("/calendar")} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors">
              View calendar →
            </button>
          </div>

          {loading && <div className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</div>}

          {!loading && data.upcomingTasks.length === 0 && (
            <div className="px-5 pb-6 pt-2 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                {Icon.cal}
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">No upcoming activities</div>
                <div className="text-sm text-gray-500 mt-0.5">You're all set for now.</div>
              </div>
            </div>
          )}

          {!loading && data.upcomingTasks.length > 0 && (
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {data.upcomingTasks.map(t => (
                <div key={t.id} onClick={() => navigate("/calendar")}
                  className="px-5 py-3 hover:bg-gray-50 transition-colors duration-150 cursor-pointer flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                    {Icon.cal}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t.customers?.account_name && <span>{t.customers.account_name} · </span>}
                      <span>{t.category}</span>
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 font-medium">
                    {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
