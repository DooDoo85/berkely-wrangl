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

// Compact money: $145K, $12.3K, $850 — keeps KPI subtext short
function fmtMoneyCompact(n) {
  const v = Number(n) || 0
  if (v >= 1000) {
    const k = v / 1000
    return '$' + (k >= 10 ? Math.round(k) : k.toFixed(1)) + 'K'
  }
  return '$' + Math.round(v)
}

// ─── KPI Tile (goal-aware) ──────────────────────────────────────────────────

function KpiTile({ label, value, goal, loading, iconBg, iconColor, icon, valueSubtext, onClick }) {
  const v = Number(value || 0)
  const g = Number(goal || 0)
  const pct = g > 0 ? Math.min((v / g) * 100, 100) : 0
  const hit = g > 0 && v >= g
  const onTrack = g > 0 && v >= g * 0.5
  // Color logic: healthy when goal hit, warning when 50%+, muted otherwise
  const barColor = hit ? 'bg-status-healthy' : onTrack ? 'bg-status-warning' : 'bg-[var(--surface-border)]'
  const valueColor = hit ? 'text-status-healthy' : 'text-ink-strong'

  const clickable = !!onClick
  const tileClass = `card p-4 md:p-5 transition-shadow duration-200 ${clickable ? 'cursor-pointer hover:shadow-md' : ''}`

  return (
    <div className={tileClass} onClick={onClick}>
      <div className="flex items-start gap-2 md:gap-3">
        <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] md:text-[11px] font-semibold text-ink-muted uppercase tracking-wider">{label}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-2xl md:text-3xl font-bold tabular-nums leading-none ${valueColor}`}>
              {loading ? "—" : v}
            </span>
            {g > 0 && !loading && (
              <span className="text-sm font-medium text-ink-muted tabular-nums">/ {g}</span>
            )}
          </div>
          {g > 0 ? (
            <div className="mt-2.5">
              <div className="w-full h-1.5 bg-[var(--surface-border)] rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[10px] text-ink-muted mt-1">
                {hit ? '✓ Goal hit' : `${Math.round(pct)}% to goal`}
              </div>
            </div>
          ) : valueSubtext ? (
            <div className="text-xs text-ink-mid mt-2 tabular-nums truncate">{valueSubtext}</div>
          ) : (
            <div className="text-xs text-ink-muted mt-2">This week</div>
          )}
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
        className="flex items-center justify-center gap-2 md:gap-2.5 rounded-xl px-3 py-3 md:px-5 md:py-4 transition-colors duration-200 font-medium text-xs md:text-sm"
        style={{ background: '#2a1d10', color: '#f7f0e0' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1a0f08')}
        onMouseLeave={e => (e.currentTarget.style.background = '#2a1d10')}
      >
        {icon}
        <span>{label}</span>
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className="card flex items-center justify-center gap-2 md:gap-2.5 px-3 py-3 md:px-5 md:py-4 transition-colors duration-200 text-ink-mid font-medium text-xs md:text-sm hover:text-ink-strong"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─── Pipeline Card ──────────────────────────────────────────────────────────

function PipelineCard({ label, count, accentColor, dotColor, accentStyle, dotStyle, icon, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      className="card p-4 md:p-5 text-left transition-all duration-200 hover:-translate-y-px w-full"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${dotColor || ''}`} style={dotStyle} />
        <span className="text-sm font-medium text-ink-mid">{label}</span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl md:text-3xl font-bold text-ink-strong tabular-nums leading-none">
            {loading ? "—" : count}
          </div>
          <div className="text-xs font-medium mt-2 text-accent-clay">View all →</div>
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
    kpis:     {
      scheduledMeetings: 0,
      newAccounts:       0,
      sampleBooks:       0,
      coldCalls:         0,
    },
    goals: {
      scheduled_meetings: 15,
      new_accounts:       2,
      sample_books:       3,
      cold_calls:         0,
    },
    pipeline: { printed: 0, inProduction: 0, onHold: 0, invoicedWtd: 0 },
    openQuotes: { count: 0, value: 0 },
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
        goalsRes,
        newAccountsRes,
        scheduledMeetingsRes,
        coldCallsRes,
        sampleBooksRes,
        printedRes,
        inProdRes,
        onHoldRes,
        invoicedWtdRes,
        openQuotesRes,
        followUpsRes,
        upcomingTasksRes,
      ] = await Promise.all([
        supabase.from("weekly_goals").select("metric_key, target_value"),

        repName
          ? supabase.from("customers").select("id", { count: "exact", head: true })
              .eq("sales_rep", repName).gte("created_at", weekStart)
          : Promise.resolve({ count: 0 }),

        supabase.from("activities").select("id", { count: "exact", head: true })
          .eq("user_id", profile.id).eq("activity_type", "scheduled_meeting").gte("activity_date", weekStartDate),

        supabase.from("activities").select("id", { count: "exact", head: true })
          .eq("user_id", profile.id).eq("activity_type", "cold_call").gte("activity_date", weekStartDate),

        supabase.from("activities").select("id", { count: "exact", head: true })
          .eq("user_id", profile.id).eq("activity_type", "sample_book").gte("activity_date", weekStartDate),

        // PRINTED — orders in printed status (excluding wrangl-overridden in_production)
        repName
          ? supabase.from("orders").select("id", { count: "exact", head: true })
              .eq("sales_rep", repName).eq("status", "printed")
          : Promise.resolve({ count: 0 }),

        // IN PRODUCTION — wrangl-tracked production OR ePIC-tracked in_production
        repName
          ? supabase.from("orders").select("id", { count: "exact", head: true })
              .eq("sales_rep", repName)
              .or("wrangl_status.eq.in_production,status.eq.in_production")
          : Promise.resolve({ count: 0 }),

        // ORDERS ON HOLD — status='on_hold' OR wrangl_status='on_hold'
        repName
          ? supabase.from("orders").select("id", { count: "exact", head: true })
              .eq("sales_rep", repName)
              .or("status.eq.on_hold,wrangl_status.eq.on_hold")
          : Promise.resolve({ count: 0 }),

        // INVOICED WTD — invoiced this week (uses epic_status_date for actual invoice date)
        repName
          ? supabase.from("orders").select("id", { count: "exact", head: true })
              .eq("sales_rep", repName).eq("status", "invoiced")
              .gte("epic_status_date", weekStartDate)
          : Promise.resolve({ count: 0 }),

        // OPEN QUOTES — aggregate from v_rep_attention_quotes (last 30 days, customer-grouped)
        repName
          ? supabase.from("v_rep_attention_quotes")
              .select("aging_quote_count, aging_quote_total_value, oldest_quote_age_days")
              .ilike("rep_name", repName)
          : Promise.resolve({ data: [] }),

        supabase.from("activities")
          .select("id, subject, body, follow_up_date, customer_id, customers(account_name)")
          .eq("user_id", profile.id).eq("completed", false)
          .lte("follow_up_date", today)
          .order("follow_up_date", { ascending: true }).limit(8),

        supabase.from("tasks")
          .select("id, title, due_date, category, customers(account_name)")
          .eq("user_id", profile.id).eq("completed", false)
          .gt("due_date", today)
          .order("due_date", { ascending: true }).limit(5),
      ]);

      // Build goals map (defaults if not in DB yet)
      const goalsMap = { scheduled_meetings: 15, new_accounts: 2, sample_books: 3, cold_calls: 0 }
      ;(goalsRes?.data || []).forEach(g => { goalsMap[g.metric_key] = g.target_value })

      // Aggregate open quotes — filter to customers with quotes in the last 30 days
      const recentQuotes = (openQuotesRes.data || []).filter(c => (c.oldest_quote_age_days ?? 999) <= 30)
      const openQuoteCount = recentQuotes.reduce((s, c) => s + (Number(c.aging_quote_count) || 0), 0)
      const openQuoteValue = recentQuotes.reduce((s, c) => s + (Number(c.aging_quote_total_value) || 0), 0)

      setData({
        kpis: {
          scheduledMeetings: scheduledMeetingsRes.count ?? 0,
          newAccounts:       newAccountsRes.count ?? 0,
          sampleBooks:       sampleBooksRes.count ?? 0,
          coldCalls:         coldCallsRes.count ?? 0,
        },
        goals: goalsMap,
        pipeline: {
          printed:      printedRes.count ?? 0,
          inProduction: inProdRes.count ?? 0,
          onHold:       onHoldRes.count ?? 0,
          invoicedWtd:  invoicedWtdRes.count ?? 0,
        },
        openQuotes: {
          count: openQuoteCount,
          value: openQuoteValue,
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
    <div className="min-h-screen">
      <div className="p-3 md:p-8 max-w-screen-xl mx-auto">
      {/* Header — stacks on mobile, hides full date (already in top bar) */}
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between mb-5 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-ink-muted mt-1.5">{todayShort}</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-ink-muted">
          <span className="text-ink-muted">{Icon.cal}</span>
          <span>{fullDate}</span>
        </div>
      </div>

      {/* Weekly KPI Strip — 5 tiles including Open Quotes */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
        <KpiTile
          label="Scheduled Meetings"
          value={data.kpis.scheduledMeetings}
          goal={data.goals.scheduled_meetings}
          loading={loading}
          iconBg="bg-status-info-soft"     iconColor="text-status-info"    icon={Icon.calendar}
        />
        <KpiTile
          label="New Accounts"
          value={data.kpis.newAccounts}
          goal={data.goals.new_accounts}
          loading={loading}
          iconBg="bg-status-healthy-soft"  iconColor="text-status-healthy" icon={Icon.users}
        />
        <KpiTile
          label="Sample Books"
          value={data.kpis.sampleBooks}
          goal={data.goals.sample_books}
          loading={loading}
          iconBg="bg-accent-gold-soft"     iconColor="text-accent-clay"    icon={Icon.package}
        />
        <KpiTile
          label="Cold Calls"
          value={data.kpis.coldCalls}
          goal={0}
          loading={loading}
          iconBg="bg-status-warning-soft"  iconColor="text-status-warning" icon={Icon.message}
        />
        <KpiTile
          label="Open Quotes"
          value={data.openQuotes.count}
          goal={0}
          loading={loading}
          iconBg="bg-accent-clay-soft"     iconColor="text-accent-clay"    icon={Icon.fileText}
          valueSubtext={data.openQuotes.value > 0 ? `${fmtMoneyCompact(data.openQuotes.value)} · 30d` : 'last 30 days'}
          onClick={() => navigate("/my-quotes")}
        />
      </div>

      {/* Quick Actions */}
      <div className="mb-5 md:mb-6">
        <h2 className="text-sm font-semibold text-ink-strong mb-3">Quick actions</h2>
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <QuickAction primary icon={Icon.fileText}  label="New Order"    onClick={() => navigate("/orders/new")} />
          <QuickAction         icon={Icon.edit}      label="Log Activity" onClick={() => navigate("/log")} />
          <QuickAction         icon={Icon.userPlus}  label="New Customer" onClick={() => navigate("/customers/new")} />
        </div>
      </div>

      {/* 2-column row: Follow-ups (left) + Upcoming Activities (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-5 md:mb-6">
        {/* Follow-ups */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-ink-strong">Follow-ups</h2>
            <button onClick={() => navigate("/activities")} className="text-xs font-medium text-accent-clay hover:opacity-80 transition-opacity">
              View all →
            </button>
          </div>

          {loading && <div className="px-5 py-8 text-sm text-ink-muted text-center">Loading…</div>}

          {!loading && data.followUps.length === 0 && (
            <div className="px-5 pb-6 pt-2 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-status-healthy-soft flex items-center justify-center text-status-healthy flex-shrink-0">
                {Icon.check}
              </div>
              <div>
                <div className="text-base font-semibold text-ink-strong">You're all caught up!</div>
                <div className="text-sm text-ink-muted mt-0.5">No follow-ups due. Nice work.</div>
              </div>
            </div>
          )}

          {!loading && data.followUps.length > 0 && (
            <div className="divide-y border-t" style={{ borderColor: 'var(--surface-border)' }}>
              {data.followUps.map(f => {
                const overdue = f.follow_up_date < today;
                const phone = f.customers?.phone;
                return (
                  <div key={f.id} className="px-5 py-3 hover:bg-black/[0.02] transition-colors duration-150 flex items-center gap-4" style={{ borderColor: 'var(--surface-border)' }}>
                    <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${overdue ? "bg-status-critical" : "bg-status-healthy"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-ink-strong truncate">{f.customers?.account_name || "—"}</p>
                        {overdue && <span className="pill-critical">Overdue</span>}
                      </div>
                      <p className="text-xs text-ink-muted truncate mt-0.5">{f.subject || f.body?.slice(0, 80) || "Follow up"}</p>
                      <p className={`text-xs mt-0.5 ${overdue ? "text-status-critical font-medium" : "text-ink-muted"}`}>
                        Due {new Date(f.follow_up_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {phone && (
                        <a href={`tel:${phone.replace(/\D/g, "")}`}
                          className="btn-ghost text-xs px-3 py-1.5">
                          {Icon.phone} Call
                        </a>
                      )}
                      <button onClick={() => completeFollowUp(f.id)}
                        className="btn-primary text-xs px-3 py-1.5">
                        {Icon.checkSmall} Done
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming activities */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-ink-strong">Upcoming activities</h2>
            <button onClick={() => navigate("/calendar")} className="text-xs font-medium text-accent-clay hover:opacity-80 transition-opacity">
              View calendar →
            </button>
          </div>

          {loading && <div className="px-5 py-8 text-sm text-ink-muted text-center">Loading…</div>}

          {!loading && data.upcomingTasks.length === 0 && (
            <div className="px-5 pb-6 pt-2 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-status-healthy-soft flex items-center justify-center text-status-healthy flex-shrink-0">
                {Icon.cal}
              </div>
              <div>
                <div className="text-base font-semibold text-ink-strong">No upcoming activities</div>
                <div className="text-sm text-ink-muted mt-0.5">You're all set for now.</div>
              </div>
            </div>
          )}

          {!loading && data.upcomingTasks.length > 0 && (
            <div className="divide-y border-t" style={{ borderColor: 'var(--surface-border)' }}>
              {data.upcomingTasks.map(t => (
                <div key={t.id} onClick={() => navigate("/calendar")}
                  className="px-5 py-3 hover:bg-black/[0.02] transition-colors duration-150 cursor-pointer flex items-center gap-4" style={{ borderColor: 'var(--surface-border)' }}>
                  <div className="w-10 h-10 rounded-full bg-status-healthy-soft flex items-center justify-center text-status-healthy flex-shrink-0">
                    {Icon.cal}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-strong truncate">{t.title}</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {t.customers?.account_name && <span>{t.customers.account_name} · </span>}
                      <span>{t.category}</span>
                    </p>
                  </div>
                  <div className="text-xs text-ink-muted font-medium">
                    {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* My Pipeline — full width strip at the bottom */}
      <div className="mb-5 md:mb-6">
        <h2 className="text-sm font-semibold text-ink-strong mb-3">My pipeline</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <PipelineCard
            label="Printed"
            count={data.pipeline.printed}
            dotStyle={{ backgroundColor: '#b85d3a' }}
            icon={<div className="w-9 h-9 rounded-full flex items-center justify-center bg-accent-clay-soft text-accent-clay">{Icon.send}</div>}
            loading={loading}
            onClick={() => navigate("/orders?status=printed")}
          />
          <PipelineCard
            label="In Production"
            count={data.pipeline.inProduction}
            dotStyle={{ backgroundColor: '#c2913a' }}
            icon={<div className="w-9 h-9 rounded-full flex items-center justify-center bg-status-warning-soft text-status-warning">{Icon.settings}</div>}
            loading={loading}
            onClick={() => navigate("/orders?status=in_production")}
          />
          <PipelineCard
            label="On Hold"
            count={data.pipeline.onHold}
            dotStyle={{ backgroundColor: '#b54a3a' }}
            icon={<div className="w-9 h-9 rounded-full flex items-center justify-center bg-status-critical-soft text-status-critical">{Icon.package}</div>}
            loading={loading}
            onClick={() => navigate("/orders/on-hold")}
          />
          <PipelineCard
            label="Invoiced WTD"
            count={data.pipeline.invoicedWtd}
            dotStyle={{ backgroundColor: '#5b8c5a' }}
            icon={<div className="w-9 h-9 rounded-full flex items-center justify-center bg-status-healthy-soft text-status-healthy">{Icon.package}</div>}
            loading={loading}
            onClick={() => navigate("/orders?status=invoiced")}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
