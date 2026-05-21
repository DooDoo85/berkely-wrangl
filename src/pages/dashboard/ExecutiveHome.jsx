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

// Week-over-week % change: returns null if prior period has no data.
// Otherwise returns a positive or negative number (e.g. 12 for +12%, -5 for -5%).
function wow(current, prior) {
  if (!prior) return null;
  return Math.round(((current - prior) / prior) * 100);
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
//
// Revenue-focused card. Shows WTD sales, units, WoW% change, and a 30-day
// sparkline. Credit OK / Printed counts intentionally removed — those now
// live in the Operations Status table below, so we don't duplicate the info.
//
function HeroCard({ label, accent, fill, data, sparkData, wowPct, loading, onClick }) {
  const wowPositive = wowPct !== null && wowPct >= 0;
  return (
    <div onClick={onClick}
      className="card card-hover p-4 md:p-5 cursor-pointer h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
          <span className="text-sm font-medium text-ink-strong truncate">{label}</span>
        </div>
        <span className="text-xs text-ink-muted flex-shrink-0 ml-2">View →</span>
      </div>

      {/* WTD dollar amount */}
      <div className="mb-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl md:text-3xl font-medium text-ink-strong tabular-nums">
            {loading ? "—" : fmt$Full(data.sales_wtd)}
          </span>
          <span className="text-xs text-ink-muted">WTD</span>
        </div>
      </div>

      {/* Units + WoW% — one compact line */}
      <div className="flex items-center gap-2 text-xs text-ink-mid tabular-nums mb-3">
        <span>{loading ? "" : `${(data.units_wtd ?? 0).toLocaleString()} units`}</span>
        {wowPct !== null && !loading && (
          <>
            <span className="text-ink-muted">·</span>
            <span className={wowPositive ? "text-emerald-700" : "text-red-700"}>
              {wowPositive ? "↑" : "↓"} {Math.abs(wowPct)}% vs last week
            </span>
          </>
        )}
      </div>

      {/* 30-day sparkline */}
      <Sparkline data={sparkData} color={accent} fillColor={fill} />
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

// ─── Business Overview card ────────────────────────────────────────────────
//
// Top-left executive panel. Three KPIs each capture a distinct slice of the
// week:
//
//   Sales (WTD)  — revenue invoiced this week (orders that shipped/closed).
//   Sold (WTD)   — revenue on orders that newly hit credit_ok this week
//                  (committed sales — approved & ready, but not yet shipped).
//   Lead Time    — avg days printed→invoiced for orders invoiced this week
//                  (falls back to 30-day rolling if too few WTD samples).
//
// Together: Sales = "what closed", Sold = "what we sold", Lead Time = "how
// fast the floor is moving." Plays well as a CEO morning glance.
//
function BusinessOverviewCard({
  loading, todayEntered, todaySales,
  salesInvoicedWTD, salesInvoicedWoW,
  soldWTD, soldWoW,
  leadTimeDays, leadTimeWindow,
}) {
  const kpis = [
    {
      label: "Sales (WTD)",
      hint: "Invoiced this week",
      value: loading ? "—" : fmt$(salesInvoicedWTD),
      sub: salesInvoicedWoW === null ? null : { wow: salesInvoicedWoW, label: "vs last week" },
      icon: "💰",
    },
    {
      label: "Sold (WTD)",
      hint: "Credit OK this week",
      value: loading ? "—" : fmt$(soldWTD),
      sub: soldWoW === null ? null : { wow: soldWoW, label: "vs last week" },
      icon: "✍️",
    },
    {
      label: "Lead Time",
      hint: "Printed → Invoiced",
      value: loading ? "—" : (leadTimeDays !== null ? `${leadTimeDays}` : "—"),
      valueSuffix: leadTimeDays !== null ? "days" : null,
      sub: leadTimeDays === null
        ? { text: "Not enough data yet" }
        : { text: leadTimeWindow === 'wtd' ? "Invoiced this week" : "Last 30 days (low WTD volume)" },
      icon: "🕐",
    },
  ];

  return (
    <div className="card p-4 md:p-6 h-full">
      <div className="mb-4">
        <h2 className="font-display font-bold text-ink-strong text-2xl">Business Overview</h2>
        <div className="text-xs text-ink-muted mt-1">
          {loading ? "Loading…" :
            <>
              {todayEntered} order{todayEntered !== 1 ? 's' : ''} entered today
              {todaySales > 0 && <> · {fmt$(todaySales)} in sales</>}
            </>
          }
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-surface-page/40 rounded-xl p-3">
            <div className="w-8 h-8 rounded-lg bg-brand-gold/15 flex items-center justify-center text-sm mb-2">
              {k.icon}
            </div>
            <p className="text-[10px] font-medium text-ink-mid uppercase tracking-wider">{k.label}</p>
            {k.hint && <p className="text-[10px] text-ink-muted mt-0.5">{k.hint}</p>}
            <p className="text-2xl font-medium text-ink-strong tabular-nums mt-1.5">
              {k.value}
              {k.valueSuffix && <span className="text-sm font-normal text-ink-muted ml-1">{k.valueSuffix}</span>}
            </p>
            {k.sub && (
              <div className="mt-1.5 text-[11px] tabular-nums">
                {k.sub.wow !== undefined ? (
                  <>
                    <span className={k.sub.wow >= 0 ? "text-emerald-700 font-medium" : "text-red-700 font-medium"}>
                      {k.sub.wow >= 0 ? "↑" : "↓"} {Math.abs(k.sub.wow)}%
                    </span>
                    <span className="text-ink-muted ml-1">{k.sub.label}</span>
                  </>
                ) : (
                  <span className="text-ink-muted">{k.sub.text}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Operations Status panel ───────────────────────────────────────────────
//
// Pipeline overview by product. Three softly-tinted stage bands stacked
// vertically. Each band has:
//   - A circular stage icon on the left (colored to match the band tone)
//   - Stage label + sub-label
//   - Two product cells (Roller / Faux) with prominent counts and small
//     subtext (units or $ pending), separated by a dashed vertical divider
//   - Each cell is a clickable button that opens the matching modal
//
// Below the bands: a footer summary row with two compact KPIs (Total in
// Production count, and 30-day rolling avg P→Inv lead time).
//
// Tint palette stays in muted, warm hues so it doesn't clash with Wrangl's
// cream + brown brand:
//   - Credit OK   → sage-tinted (cleared, calm)
//   - Printed     → neutral stone (in-flight)
//   - In Production → soft gold (active, hottest stage)
//
function OperationsStatusTable({
  loading,
  creditOkRoller, creditOkFaux,
  printedRoller, printedFaux,
  inProdRoller, inProdFaux,
  totalInProduction,
  startedToday, startedTodayUnits,
  invoicedToday, invoicedTodayUnits,
  onCreditOkRollerClick, onCreditOkFauxClick,
  onPrintedRollerClick, onPrintedFauxClick,
  onInProdRollerClick, onInProdFauxClick,
}) {
  const ROLLER = "#b85d3a";
  const FAUX   = "#d4a574";

  const stages = [
    {
      key: "credit_ok",
      // SVG icon for the circle. Larger, more substantial than emoji.
      iconSvg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
      label: "Credit OK",
      sub: "Ready to print",
      bandBg: "bg-emerald-50/50",
      iconCircle: "bg-emerald-100/70 text-emerald-700 ring-1 ring-emerald-200/60",
      roller: {
        value: loading ? "—" : creditOkRoller.count,
        sub: creditOkRoller.total > 0 ? `${fmt$(creditOkRoller.total)} pending` : null,
        onClick: onCreditOkRollerClick,
      },
      faux: {
        value: loading ? "—" : creditOkFaux.count,
        sub: creditOkFaux.total > 0 ? `${fmt$(creditOkFaux.total)} pending` : null,
        onClick: onCreditOkFauxClick,
      },
    },
    {
      key: "printed",
      iconSvg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
      ),
      label: "Printed",
      sub: "Ready for production",
      bandBg: "bg-stone-100/40",
      iconCircle: "bg-stone-200/60 text-stone-700 ring-1 ring-stone-300/40",
      roller: {
        value: loading ? "—" : printedRoller.count,
        sub: printedRoller.units > 0 ? `${printedRoller.units.toLocaleString()} units` : null,
        onClick: onPrintedRollerClick,
      },
      faux: {
        value: loading ? "—" : printedFaux.count,
        sub: printedFaux.units > 0 ? `${printedFaux.units.toLocaleString()} units` : null,
        onClick: onPrintedFauxClick,
      },
    },
    {
      key: "in_production",
      iconSvg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      label: "In Production",
      sub: "On the floor",
      bandBg: "bg-amber-50/50",
      iconCircle: "bg-amber-100/70 text-amber-800 ring-1 ring-amber-200/60",
      roller: {
        value: loading ? "—" : inProdRoller.count,
        sub: inProdRoller.units > 0 ? `${inProdRoller.units.toLocaleString()} units` : null,
        onClick: onInProdRollerClick,
      },
      faux: {
        value: loading ? "—" : inProdFaux.count,
        sub: inProdFaux.units > 0 ? `${inProdFaux.units.toLocaleString()} units` : null,
        onClick: onInProdFauxClick,
      },
    },
  ];

  return (
    <div className="card p-5 md:p-6 h-full">

      {/* Panel header */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="w-7 h-7 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4" />
              <rect x="9" y="2" width="6" height="9" rx="1" />
            </svg>
          </span>
          <h3 className="text-base font-semibold text-ink-strong">Operations Status</h3>
        </div>
        <p className="text-[12px] text-ink-muted">Live overview of order flow by stage and product.</p>
      </div>

      {/* Column headers row */}
      <div className="grid grid-cols-[minmax(0,1.1fr)_1fr_1fr] gap-3 px-3 mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Stage</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] flex items-center gap-1.5"
             style={{ color: ROLLER }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: ROLLER }} />
          Roller Shades
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] flex items-center gap-1.5"
             style={{ color: FAUX }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: FAUX }} />
          Faux Wood Blinds
        </div>
      </div>

      {/* Stacked stage bands */}
      <div className="space-y-2.5">
        {stages.map(s => (
          <div key={s.key}
            className={`${s.bandBg} rounded-xl overflow-hidden`}>
            <div className="grid grid-cols-[minmax(0,1.1fr)_1fr_1fr] items-center">

              {/* Stage chip — circular icon + label + sub-label */}
              <div className="flex items-center gap-3 p-4">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${s.iconCircle}`}>
                  {s.iconSvg}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink-strong leading-tight">{s.label}</p>
                  <p className="text-[11px] text-ink-muted leading-tight mt-0.5">{s.sub}</p>
                </div>
              </div>

              {/* Roller cell — dashed left divider */}
              <button onClick={s.roller.onClick}
                className="group relative text-left px-4 py-4 self-stretch
                           border-l border-dashed border-stone-300/60
                           hover:bg-white/50 transition-colors">
                <p className="text-3xl font-medium text-ink-strong tabular-nums leading-none">
                  {s.roller.value}
                </p>
                {s.roller.sub && (
                  <p className="text-[11px] text-ink-muted mt-2">{s.roller.sub}</p>
                )}
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </button>

              {/* Faux cell — dashed left divider */}
              <button onClick={s.faux.onClick}
                className="group relative text-left px-4 py-4 self-stretch
                           border-l border-dashed border-stone-300/60
                           hover:bg-white/50 transition-colors">
                <p className="text-3xl font-medium text-ink-strong tabular-nums leading-none">
                  {s.faux.value}
                </p>
                {s.faux.sub && (
                  <p className="text-[11px] text-ink-muted mt-2">{s.faux.sub}</p>
                )}
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Operational footer — Total in Production, Started Today, Invoiced Today.
          Folds the old Production Flow widget's most actionable signals into the
          Operations Status panel where they contextually belong. */}
      <div className="mt-4 rounded-xl bg-stone-50/60 ring-1 ring-stone-100/80 px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 divide-x divide-stone-200/60">
          {/* Total in Production */}
          <div className="flex items-center gap-2.5 md:px-1">
            <span className="w-9 h-9 rounded-lg bg-white/80 ring-1 ring-stone-200/60 text-stone-600 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted leading-tight">Total in production</p>
              <p className="text-base font-semibold text-ink-strong tabular-nums leading-tight mt-0.5">
                {loading ? "—" : totalInProduction}
                <span className="text-[11px] font-normal text-ink-mid ml-1">orders</span>
              </p>
            </div>
          </div>

          {/* Started Today */}
          <div className="flex items-center gap-2.5 px-4 md:px-3">
            <span className="w-9 h-9 rounded-lg bg-white/80 ring-1 ring-stone-200/60 text-amber-700 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted leading-tight">Started today</p>
              <p className="text-base font-semibold text-ink-strong tabular-nums leading-tight mt-0.5">
                {loading ? "—" : startedToday}
                <span className="text-[11px] font-normal text-ink-mid ml-1">
                  orders{startedTodayUnits > 0 ? ` · ${startedTodayUnits.toLocaleString()}u` : ''}
                </span>
              </p>
            </div>
          </div>

          {/* Invoiced Today */}
          <div className="flex items-center gap-2.5 px-4 md:px-3">
            <span className="w-9 h-9 rounded-lg bg-white/80 ring-1 ring-stone-200/60 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted leading-tight">Invoiced today</p>
              <p className="text-base font-semibold text-ink-strong tabular-nums leading-tight mt-0.5">
                {loading ? "—" : invoicedToday}
                <span className="text-[11px] font-normal text-ink-mid ml-1">
                  orders{invoicedTodayUnits > 0 ? ` · ${invoicedTodayUnits.toLocaleString()}u` : ''}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
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

// ─── Trend line chart — two-series (current vs prior) line with grid + axes ────
//
// Used in the Daily Sales hero panel to compare sales-per-day this week vs the
// prior 5 business days. Hand-rolled SVG (matching the existing Sparkline
// pattern; the project doesn't pull in a chart library). Solid line for the
// current period, dashed line for the prior. Y-axis labeled in $k.
//
function TrendLineChart({ current = [], prior = [], width = 360, height = 180 }) {
  if (!current.length || !prior.length) {
    return <div className="h-32 flex items-center justify-center text-sm text-ink-muted">No data</div>;
  }
  const ROLLER = "#b85d3a";
  const PRIOR_COLOR = "#a7a29a";
  const padL = 32, padR = 12, padT = 8, padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  // Y scale based on max of either series, with a small headroom.
  const maxVal = Math.max(
    Math.max(...current.map(d => d.sales || 0), 0),
    Math.max(...prior.map(d => d.sales || 0), 0),
    1,
  );
  const yMax = Math.ceil(maxVal * 1.15);
  // Step grid lines at every 25% of yMax.
  const gridLines = [0, 0.25, 0.5, 0.75, 1.0];
  // Build series point arrays
  const n = current.length;
  const xAt = i => padL + (n > 1 ? (innerW * i) / (n - 1) : innerW / 2);
  const yAt = v => padT + innerH - (innerH * v) / yMax;
  const buildPath = arr => arr.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(d.sales).toFixed(1)}`).join(' ');
  const currentPath = buildPath(current);
  const priorPath = buildPath(prior);
  // X-axis labels — use current series labels (Mon..Today)
  const xLabels = current.map(d => d.label);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid lines + Y labels */}
        {gridLines.map(t => {
          const y = padT + innerH - innerH * t;
          const val = Math.round(yMax * t);
          return (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y} y2={y}
                    stroke="#e7e5e4" strokeWidth="1" strokeDasharray={t === 0 ? "" : "2 3"} />
              <text x={padL - 6} y={y + 3} textAnchor="end"
                    fontSize="9" fill="#a7a29a" fontFamily="ui-sans-serif">
                ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
              </text>
            </g>
          );
        })}
        {/* X-axis labels */}
        {xLabels.map((lbl, i) => (
          <text key={i} x={xAt(i)} y={height - padB + 14} textAnchor="middle"
                fontSize="10" fill="#a7a29a" fontFamily="ui-sans-serif">
            {lbl}
          </text>
        ))}
        {/* Prior period — dashed muted line */}
        <path d={priorPath} fill="none" stroke={PRIOR_COLOR} strokeWidth="1.5"
              strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
        {/* Current period — solid colored line */}
        <path d={currentPath} fill="none" stroke={ROLLER} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
        {/* Current period dots */}
        {current.map((d, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(d.sales)} r="3"
                  fill={ROLLER} stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] mt-2 ml-8">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full" style={{ background: ROLLER }} />
          <span className="text-ink-mid">This Week</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full border-dashed border-t-2" style={{ borderColor: PRIOR_COLOR }} />
          <span className="text-ink-mid">Prior 5 Days</span>
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
  const [creditOkModal, setCreditOkModal] = useState(false);    // false|true|'roller'|'faux'
  const [fauxPrintedModal, setFauxPrintedModal] = useState(false);
  const [inProductionModal, setInProductionModal] = useState(false);  // false|true|'roller'|'faux'
  const [onHoldModal, setOnHoldModal] = useState(false);
  const [creditOkRows, setCreditOkRows] = useState([]);
  const [data, setData] = useState({
    stuckOrders: [], heldOrdersAll: [], avgDays: null, repOrders: [],
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
    inProductionRoller: { count: 0, units: 0 },
    inProductionFaux: { count: 0, units: 0 },
    topCustomers: [],
    dailySales: [],
    productionFlow: [],
    priorDailySales: [],
    salesKpis: {
      sumSales: 0, sumOrders: 0, aov: 0,
      priorSales: 0, priorOrders: 0, priorAov: 0,
      salesTrendWoW: null, ordersTrendWoW: null, aovTrendWoW: null,
      topProductLabel: '—', topProductPct: 0, topProductSales: 0,
      rollerAovMonthly: 0, rollerOrdersMonthly: 0,
    },
    startedToday: 0, startedTodayUnits: 0,
    invoicedToday: 0, invoicedTodayUnits: 0,
    netFlow: 0,
    todayEntered: 0, todayShipped: 0, todaySales: 0,
    salesInvoicedWTD: 0, salesInvoicedWoW: null,
    soldWTD: 0, soldWoW: null,
    leadTimeDays: null, leadTimeWindow: null,
    salesWTD: 0, unitsWTD: 0, ordersWTD: 0,
    salesWoW: null, unitsWoW: null, ordersWoW: null,
    rollerWoW: null, fauxWoW: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart  = startOfWeek();
      const weekStartDate = weekStart.slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      // ── In Production count + units (split by product line) ───────────
      // PIC's flow is Printed → Invoiced (no in-between). Rene's "Start Production"
      // button in Wrangl creates this middle stage by setting wrangl_status only.
      // So wrangl_status is the sole source of truth here.
      const { data: inProductionRows } = await supabase.from("orders")
        .select("total_units, product_line")
        .eq("wrangl_status", "in_production");
      const inProdAll = inProductionRows ?? [];
      const inProductionCount = inProdAll.length;
      const inProductionUnits = inProdAll.reduce((s, r) => s + (r.total_units || 0), 0);
      const inProdRollerRows = inProdAll.filter(r => r.product_line === 'roller');
      const inProdFauxRows   = inProdAll.filter(r => r.product_line === 'faux');
      const inProductionRoller = {
        count: inProdRollerRows.length,
        units: inProdRollerRows.reduce((s, r) => s + (r.total_units || 0), 0),
      };
      const inProductionFaux = {
        count: inProdFauxRows.length,
        units: inProdFauxRows.reduce((s, r) => s + (r.total_units || 0), 0),
      };

      // ── Lead Time, Sales Invoiced WTD, Sold (Credit OK) WTD ───────────
      //
      // Three executive KPIs powered by order_status_history.
      //
      //   Sales (WTD)    — order_amount where status='invoiced' and the
      //                    invoicing happened this week (epic_status_date).
      //                    "What we actually shipped/closed this week."
      //
      //   Sold (WTD)     — order_amount for orders that entered credit_ok
      //                    this week (newly approved/cleared credit hold).
      //                    "What we sold this week — committed but not yet shipped."
      //
      //   Lead Time      — avg days from printed → invoiced for orders
      //                    invoiced this week. Falls back to last 30 days
      //                    if fewer than 3 invoicings this week (low-volume
      //                    early in the week). Subtitle reflects which.
      //
      // We pull 30 days of status_history so the fallback has data, then
      // filter client-side for the this-week subset.
      const leadTimeWindowStart = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const lastWeekStartShifted = new Date(weekStart);
      lastWeekStartShifted.setDate(lastWeekStartShifted.getDate() - 7);
      const lastWeekStartStr2 = lastWeekStartShifted.toISOString().slice(0, 10);
      const lastWeekEndShifted = new Date(weekStart);
      lastWeekEndShifted.setDate(lastWeekEndShifted.getDate() - 1);
      const lastWeekEndStr2 = lastWeekEndShifted.toISOString().slice(0, 10);

      const { data: printedHistory } = await supabase
        .from('order_status_history')
        .select('order_number, status_date')
        .eq('to_status', 'printed')
        .gte('status_date', leadTimeWindowStart);
      const { data: invoicedHistory } = await supabase
        .from('order_status_history')
        .select('order_number, status_date')
        .eq('to_status', 'invoiced')
        .gte('status_date', leadTimeWindowStart);
      const { data: creditOkHistory } = await supabase
        .from('order_status_history')
        .select('order_number, status_date')
        .eq('to_status', 'credit_ok')
        .gte('status_date', lastWeekStartStr2);

      // Build printed-date lookup (earliest printed event per order)
      const printedMap = {};
      (printedHistory ?? []).forEach(r => {
        if (!printedMap[r.order_number] || r.status_date < printedMap[r.order_number]) {
          printedMap[r.order_number] = r.status_date;
        }
      });

      // Compute lead-time deltas for orders invoiced this week and last 30d
      const deltasWTD = [];
      const deltas30d = [];
      (invoicedHistory ?? []).forEach(r => {
        const printedDate = printedMap[r.order_number];
        if (!printedDate || r.status_date < printedDate) return;
        const days = Math.round((new Date(r.status_date) - new Date(printedDate)) / 86400000);
        if (days < 0 || days > 60) return;
        if (r.status_date >= weekStartDate) deltasWTD.push(days);
        deltas30d.push(days);
      });

      const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
      let leadTimeDays = null;
      let leadTimeWindow = null;  // 'wtd' | '30d'
      if (deltasWTD.length >= 3) {
        leadTimeDays = Number(avg(deltasWTD).toFixed(1));
        leadTimeWindow = 'wtd';
      } else if (deltas30d.length >= 3) {
        leadTimeDays = Number(avg(deltas30d).toFixed(1));
        leadTimeWindow = '30d';
      }
      // avgDays kept for back-compat — same as the new leadTime value
      const avgDays = leadTimeDays;

      // Sold (Credit OK) WTD — orders that newly hit credit_ok this week.
      // We have order_number from history; need to join to orders.order_amount.
      // Pull the matching order rows in a single query.
      const creditOkThisWk = (creditOkHistory ?? []).filter(r => r.status_date >= weekStartDate);
      const creditOkLastWk = (creditOkHistory ?? []).filter(r =>
        r.status_date >= lastWeekStartStr2 && r.status_date <= lastWeekEndStr2
      );
      const allCreditOkOrderNos = [
        ...new Set([
          ...creditOkThisWk.map(r => r.order_number),
          ...creditOkLastWk.map(r => r.order_number),
        ]),
      ];
      let soldWTD = 0, soldLastWk = 0;
      if (allCreditOkOrderNos.length) {
        const { data: creditOkOrderAmts } = await supabase.from('orders')
          .select('order_number, order_amount')
          .in('order_number', allCreditOkOrderNos);
        const amtByOrder = {};
        (creditOkOrderAmts ?? []).forEach(r => {
          amtByOrder[r.order_number] = Number(r.order_amount || 0);
        });
        soldWTD = creditOkThisWk.reduce((s, r) => s + (amtByOrder[r.order_number] || 0), 0);
        soldLastWk = creditOkLastWk.reduce((s, r) => s + (amtByOrder[r.order_number] || 0), 0);
      }
      const soldWoW = wow(soldWTD, soldLastWk);

      // Sales (Invoiced) WTD — orders invoiced this week.
      // Independent of the order_status_history feed; uses the orders table
      // directly so it's accurate even if status_history misses some events.
      const { data: invoicedWeekRows } = await supabase
        .from('orders')
        .select('order_amount, epic_status_date')
        .eq('status', 'invoiced')
        .gte('epic_status_date', lastWeekStartStr2);
      let salesInvoicedWTD = 0, salesInvoicedLastWk = 0;
      (invoicedWeekRows ?? []).forEach(r => {
        const amt = Number(r.order_amount || 0);
        const d = r.epic_status_date;
        if (d >= weekStartDate) salesInvoicedWTD += amt;
        else if (d >= lastWeekStartStr2 && d <= lastWeekEndStr2) salesInvoicedLastWk += amt;
      });
      const salesInvoicedWoW = wow(salesInvoicedWTD, salesInvoicedLastWk);

      // ── Roller WIP ────────────────────────────────────────────────────
      // (Previously read from legacy roller_wip snapshot. Now derived from
      // the orders table via `trulyIdleOrders` further down — see line ~494.
      // The dead `wipData` query was removed during the May 18 master_sales_report
      // cutover. roller_wip table is scheduled for DROP after 7 days clean.)
      //
      // creditOK is kept as an empty array for back-compat with the legacy WIP
      // modal (data.wip.creditOK). The modal still opens but shows no rows —
      // that flow has been superseded by creditOkModal (separate state).
      const creditOK = [];

      // ── Orders on Hold ──────────────────────────────────────────────────
      // Filters by hold_reason (not status) to capture both flavors:
      //   • status='on_hold' + reason set → full hold (e.g., Pete)
      //   • status=printed/in_production + reason set → operational hold (e.g., Rene waiting on parts)
      // Exclude invoiced/cancelled — once shipped/closed, the hold is historical.
      const { data: heldOrders } = await supabase.from("orders")
        .select("id, order_number, customer_name, status, hold_reason, hold_note, wrangl_status_set_at, updated_at, sales_rep, order_amount")
        .not("hold_reason", "is", null)
        .not("status", "in", "(invoiced,cancelled)");
      const heldOrdersAll = (heldOrders ?? []).map(o => {
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
          hold_note: o.hold_note,
          sales_rep: o.sales_rep,
          order_amount: o.order_amount,
        };
      }).sort((a, b) => b.days - a.days);
      // stuckOrders = top 5 for the inline list. heldOrdersAll = full list for the modal.
      const stuckOrders = heldOrdersAll.slice(0, 5);

      // ── Overdue / Stuck Orders calculated after trulyIdleOrders loads below ──

      // ── Credit OK / HOLD ──────────────────────────────────────────────
      // Reads from `orders` (populated by MASTER SALES REPORT) instead of
      // the legacy `credit_ok_orders` snapshot. The legacy table is preserved
      // for rep-attribution fallback below until we confirm a week clean,
      // then DROP.
      const { data: creditOkOrdersFromOrders } = await supabase
        .from("orders")
        .select("order_number, sales_rep, customer_name, order_amount, order_date, product_line")
        .eq("status", "credit_ok")
        .order("order_date", { ascending: false });
      const creditAll = creditOkOrdersFromOrders ?? [];
      const creditOk = {
        count: creditAll.length,
        total: creditAll.reduce((s, r) => s + Number(r.order_amount || 0), 0),
      };
      const creditOkRollerRows = creditAll.filter(r => r.product_line === 'roller');
      const creditOkFauxRows   = creditAll.filter(r => r.product_line === 'faux');
      const creditOkRoller = {
        count: creditOkRollerRows.length,
        total: creditOkRollerRows.reduce((s, r) => s + Number(r.order_amount || 0), 0),
      };
      const creditOkFaux = {
        count: creditOkFauxRows.length,
        total: creditOkFauxRows.reduce((s, r) => s + Number(r.order_amount || 0), 0),
      };

      // For the Credit OK modal table — map to the legacy shape so the modal
      // doesn't need to change. (order_no, salesperson, etc. match what the
      // modal expects to render today.)
      const creditOkRowsData = creditAll.map(r => ({
        order_no:      r.order_number,
        salesperson:   r.sales_rep,
        customer_name: r.customer_name,
        order_amount:  r.order_amount,
        entered_date:  r.order_date,
        order_status:  'CREDIT OK',
        product_line:  r.product_line,
      }));
      setCreditOkRows(creditOkRowsData);

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
      // Fallback chain (simplified post master_sales_report cutover):
      //   orders.sales_rep → customers.sales_rep
      // The legacy credit_ok_orders.salesperson middle fallback was removed
      // since orders.sales_rep is now reliably populated by MASTER SALES REPORT.
      const { data: invoicedRows } = await supabase.from("orders")
        .select("order_number, customer_name, sales_rep")
        .eq("status", "invoiced").gte("epic_status_date", weekStartDate);

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
        const name = (r.sales_rep || repByCustomer[r.customer_name] || "").trim();
        if (name) repMap[name] = (repMap[name] ?? 0) + 1;
      });
      const repOrders = Object.entries(repMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // ── Daily sales — last 5 business days, status != quote ──────────
      // Walk back from today, skip Sat/Sun, until we have 5 weekdays.
      // We also keep the prior 5 business days for prior-period comparisons
      // in the Daily Sales hero KPIs (% vs prior 5 days).
      const businessDays = [];
      const priorBusinessDays = [];
      const cur = new Date();
      cur.setHours(0, 0, 0, 0);
      while (businessDays.length < 5) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
          businessDays.unshift(new Date(cur)); // prepend so oldest is first
        }
        cur.setDate(cur.getDate() - 1);
      }
      while (priorBusinessDays.length < 5) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
          priorBusinessDays.unshift(new Date(cur));
        }
        cur.setDate(cur.getDate() - 1);
      }
      const earliestBizDay = businessDays[0].toISOString().slice(0, 10);
      const earliestPriorBizDay = priorBusinessDays[0].toISOString().slice(0, 10);
      const latestPriorBizDay = priorBusinessDays[priorBusinessDays.length - 1].toISOString().slice(0, 10);
      const { data: dailySalesRows } = await supabase
        .from("orders")
        .select("order_date, order_amount, product_line")
        .gte("order_date", earliestPriorBizDay)
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
      // Prior 5 business days — for the Sales Trend line chart's dashed comparison series.
      const priorDailySales = priorBusinessDays.map(d => {
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { weekday: "short" });
        const bucket = salesByDay[key] || { orders: 0, sales: 0, roller: 0, faux: 0, other: 0 };
        return { label, orders: bucket.orders, sales: bucket.sales };
      });

      // 5-day rollup KPIs for the Daily Sales hero panel.
      const sumSales   = dailySales.reduce((s, d) => s + d.sales, 0);
      const sumOrders  = dailySales.reduce((s, d) => s + d.orders, 0);
      const sumRoller  = dailySales.reduce((s, d) => s + d.roller, 0);
      const sumFaux    = dailySales.reduce((s, d) => s + d.faux, 0);
      const sumOther   = dailySales.reduce((s, d) => s + d.other, 0);
      const priorSales = priorDailySales.reduce((s, d) => s + d.sales, 0);
      const priorOrders = priorDailySales.reduce((s, d) => s + d.orders, 0);
      const aov        = sumOrders > 0 ? sumSales / sumOrders : 0;
      const priorAov   = priorOrders > 0 ? priorSales / priorOrders : 0;
      const salesTrendWoW = wow(sumSales, priorSales);
      const ordersTrendWoW = wow(sumOrders, priorOrders);
      const aovTrendWoW = wow(aov, priorAov);
      // Top product over the 5 days — roller vs faux, with % share of total sales
      const topProductSales = Math.max(sumRoller, sumFaux);
      const topProductLabel = sumRoller >= sumFaux ? 'Roller' : 'Faux';
      const topProductPct   = sumSales > 0 ? Math.round((topProductSales / sumSales) * 100) : 0;

      // ── Production Flow — last 5 business days ────────────────────────
      // Two metrics per day:
      //   • Started: orders Rene flipped to in_production that day (wrangl_status_set_at)
      //     We count by timestamp regardless of current wrangl_status — once
      //     an order moves out of in_production (to invoiced, etc.) the status
      //     clears to NULL but wrangl_status_set_at is preserved, so it stays
      //     attributable to the day it was started.
      //   • Invoiced: orders PIC marked invoiced that day (epic_status_date + status='invoiced')
      // Units summed for each, surfaced under the bars.
      const [startedRowsRes, invoicedFlowRes] = await Promise.all([
        supabase.from("orders")
          .select("wrangl_status_set_at, total_units")
          .not("wrangl_status_set_at", "is", null)
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

      // Today-only and 5-day net flow figures for the Operations Status footer.
      // "Today" = the most recent business day (the last entry in businessDays).
      const todayFlow = productionFlow[productionFlow.length - 1] || { started: 0, started_units: 0, invoiced: 0, invoiced_units: 0 };
      const startedToday = todayFlow.started;
      const startedTodayUnits = todayFlow.started_units;
      const invoicedToday = todayFlow.invoiced;
      const invoicedTodayUnits = todayFlow.invoiced_units;
      // Net flow = invoiced − started, summed across all 5 days.
      // Positive ("draining") = invoicing faster than starting → backlog shrinking.
      // Negative ("filling") = starting faster than invoicing → backlog growing.
      const sumStarted = productionFlow.reduce((s, d) => s + d.started, 0);
      const sumInvoiced = productionFlow.reduce((s, d) => s + d.invoiced, 0);
      const netFlow = sumInvoiced - sumStarted;

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

      // Monthly avg roller-shade order value — pulled from same sparkRows
      // (30 days, all products with order_amount + product_line). Sum roller
      // amounts, divide by count of roller orders.
      let rollerSalesMonthly = 0;
      let rollerOrdersMonthly = 0;
      (sparkRows ?? []).forEach(r => {
        if (r.product_line !== 'roller') return;
        rollerSalesMonthly += Number(r.order_amount || 0);
        rollerOrdersMonthly += 1;
      });
      const rollerAovMonthly = rollerOrdersMonthly > 0 ? rollerSalesMonthly / rollerOrdersMonthly : 0;

      // ── Business Overview totals + WoW comparison ─────────────────────
      // Compute weekly totals (sales/units/orders) from the same orders we
      // already pulled for sparklines, plus a separate pass for prior-week
      // baselines so we can show "↑ 12% vs last week" deltas.
      //
      // Current week = Mon..now. Prior week = Mon-7d..Sun-7d (full 7 days).
      const lastWeekStart = new Date(weekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(weekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStartStr = lastWeekStart.toISOString().slice(0, 10);
      const lastWeekEndStr   = lastWeekEnd.toISOString().slice(0, 10);

      const { data: wowOrders } = await supabase
        .from("orders")
        .select("order_date, order_amount, total_units")
        .gte("order_date", lastWeekStartStr)
        .neq("status", "quote")
        .not("order_date", "is", null);

      let salesWTD = 0, unitsWTD = 0, ordersWTD = 0;
      let salesLastWk = 0, unitsLastWk = 0, ordersLastWk = 0;
      (wowOrders ?? []).forEach(r => {
        const d = r.order_date;
        const amt = Number(r.order_amount || 0);
        const u = Number(r.total_units || 0);
        if (d >= weekStartDate) {
          salesWTD += amt; unitsWTD += u; ordersWTD += 1;
        } else if (d >= lastWeekStartStr && d <= lastWeekEndStr) {
          salesLastWk += amt; unitsLastWk += u; ordersLastWk += 1;
        }
      });
      const salesWoW  = wow(salesWTD,  salesLastWk);
      const unitsWoW  = wow(unitsWTD,  unitsLastWk);
      const ordersWoW = wow(ordersWTD, ordersLastWk);

      // Per-product WoW for the HeroCards (uses sparkRows we already have)
      const rollerSalesThisWk = rollerSpark.slice(-7).reduce((s, v) => s + v, 0);
      const rollerSalesLastWk = rollerSpark.slice(-14, -7).reduce((s, v) => s + v, 0);
      const fauxSalesThisWk   = fauxSpark.slice(-7).reduce((s, v) => s + v, 0);
      const fauxSalesLastWk   = fauxSpark.slice(-14, -7).reduce((s, v) => s + v, 0);
      const rollerWoW = wow(rollerSalesThisWk, rollerSalesLastWk);
      const fauxWoW   = wow(fauxSalesThisWk, fauxSalesLastWk);

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
        stuckOrders, heldOrdersAll, avgDays, repOrders, faux, roller,
        overdueOrders,
        fauxSpark, rollerSpark,
        wip: { creditOK, printed: printedForModal },
        creditOk, creditOkRoller, creditOkFaux,
        printedTotal, fauxPrintedTotal,
        inProductionCount: inProductionCount ?? 0,
        inProductionUnits: inProductionUnits ?? 0,
        inProductionRoller,
        inProductionFaux,
        topCustomers, dailySales, productionFlow,
        priorDailySales,
        // Daily Sales hero — 5-day rollup KPIs + WoW comparisons
        salesKpis: {
          sumSales, sumOrders, aov,
          priorSales, priorOrders, priorAov,
          salesTrendWoW, ordersTrendWoW, aovTrendWoW,
          topProductLabel, topProductPct, topProductSales,
          rollerAovMonthly, rollerOrdersMonthly,
        },
        // Operations Status footer — today's flow + 5-day net flow
        startedToday, startedTodayUnits,
        invoicedToday, invoicedTodayUnits,
        netFlow,
        todayEntered: todayEntered ?? 0,
        todayShipped: todayShipped ?? 0,
        todaySales,
        // Business Overview KPIs — three executive metrics
        salesInvoicedWTD, salesInvoicedWoW,
        soldWTD, soldWoW,
        leadTimeDays, leadTimeWindow,
        // (Legacy WTD fields kept for back-compat in case anything else reads them)
        salesWTD, unitsWTD, ordersWTD,
        salesWoW, unitsWoW, ordersWoW,
        rollerWoW, fauxWoW,
      });
      setRefreshedAt(new Date());
    } catch(err) { console.error("ExecutiveHome:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stuckTotal = data.heldOrdersAll?.length ?? 0;
  const overdueTotal = data.overdueOrders?.length ?? 0;
  const wipKey = s => s === "CREDIT OK" ? "creditOK" : "printed";

  const ROLLER_ACCENT = "#b85d3a";  // accent-clay
  const ROLLER_FILL   = "#f0d8c8";  // accent-clay-soft
  const FAUX_ACCENT   = "#d4a574";  // accent-gold
  const FAUX_FILL     = "#f5e8d4";  // accent-gold-soft

  return (
    <div className="min-h-full">
      <div className="max-w-screen-xl mx-auto p-3 md:p-6 pb-10 md:pb-14">

        {/* ── Compact top bar — refresh + timestamp only (page header is in sidebar) ── */}
        <div className="flex items-center justify-end mb-3 md:mb-4">
          <div className="flex items-center gap-3">
            <div className="text-xs text-ink-muted">
              Updated {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <button onClick={load} disabled={loading}
              className="btn-ghost text-xs px-3 py-1.5">
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* ═══ ROW 1 — Revenue & sales view ═══════════════════════════════
            Business Overview KPIs on the left, product revenue cards on the right.
            BO spans wider so the 4 KPIs have room; the two product cards share equal
            remaining width. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_1fr] gap-3 lg:gap-4 mb-4">
          <BusinessOverviewCard
            loading={loading}
            todayEntered={data.todayEntered}
            todaySales={data.todaySales}
            salesInvoicedWTD={data.salesInvoicedWTD}
            salesInvoicedWoW={data.salesInvoicedWoW}
            soldWTD={data.soldWTD}
            soldWoW={data.soldWoW}
            leadTimeDays={data.leadTimeDays}
            leadTimeWindow={data.leadTimeWindow}
          />
          <HeroCard
            label="Roller Shades"
            accent={ROLLER_ACCENT}
            fill={ROLLER_FILL}
            data={data.roller}
            sparkData={data.rollerSpark}
            wowPct={data.rollerWoW}
            loading={loading}
            onClick={() => navigate("/orders?product=roller")}
          />
          <HeroCard
            label="Faux Wood Blinds"
            accent={FAUX_ACCENT}
            fill={FAUX_FILL}
            data={data.faux}
            sparkData={data.fauxSpark}
            wowPct={data.fauxWoW}
            loading={loading}
            onClick={() => navigate("/orders?product=faux")}
          />
        </div>

        {/* ═══ ROW 2 — Operational view ═══════════════════════════════════
            Operations Status table on the left (pipeline by product line).
            Combined "Needs Attention" widget on the right — merges the old
            Orders on Hold + Stuck Orders into one widget with two sections,
            since both are "this needs human attention" lists. */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 lg:gap-4 mb-4">
          <OperationsStatusTable
            loading={loading}
            creditOkRoller={data.creditOkRoller}
            creditOkFaux={data.creditOkFaux}
            printedRoller={data.printedTotal}
            printedFaux={data.fauxPrintedTotal}
            inProdRoller={data.inProductionRoller}
            inProdFaux={data.inProductionFaux}
            totalInProduction={data.inProductionCount}
            startedToday={data.startedToday}
            startedTodayUnits={data.startedTodayUnits}
            invoicedToday={data.invoicedToday}
            invoicedTodayUnits={data.invoicedTodayUnits}
            onCreditOkRollerClick={() => setCreditOkModal('roller')}
            onCreditOkFauxClick={() => setCreditOkModal('faux')}
            onPrintedRollerClick={() => setWipModal("PRINTED")}
            onPrintedFauxClick={() => setFauxPrintedModal(true)}
            onInProdRollerClick={() => setInProductionModal('roller')}
            onInProdFauxClick={() => setInProductionModal('faux')}
          />

          {/* Needs Attention — operational inbox.
              Two grouped alert sections (On Hold + Past SLA). Each row is a
              substantial card: issue-type icon → order# + status pill (top
              line) + customer · reason (bottom line) → prominent aging
              badge → chevron. Group headers are colored per severity. */}
          <div className="card-priority p-5 md:p-6 h-full">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <h3 className="text-base font-semibold text-ink-strong">Needs Attention</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {stuckTotal > 0 && (
                  <button onClick={() => setOnHoldModal(true)}
                    className="pill-warning hover:opacity-80 transition-opacity cursor-pointer">
                    {stuckTotal} on hold
                  </button>
                )}
                {overdueTotal > 0 && (
                  <button onClick={() => setWipModal("PRINTED")}
                    className="pill-critical hover:opacity-80 transition-opacity cursor-pointer">
                    {overdueTotal} past SLA
                  </button>
                )}
              </div>
            </div>

            {/* Empty state */}
            {stuckTotal === 0 && overdueTotal === 0 && (
              <div className="rounded-lg bg-emerald-50/40 border border-emerald-100/60 py-8 px-4 text-center">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2 text-base">✓</div>
                <p className="text-sm text-ink-mid">All orders moving cleanly.</p>
                <p className="text-[11px] text-ink-muted mt-0.5">No holds. No SLA breaches.</p>
              </div>
            )}

            {/* On Hold group */}
            {stuckTotal > 0 && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                    On Hold
                  </span>
                  <button onClick={() => setOnHoldModal(true)}
                    className="text-[11px] text-ink-muted hover:text-ink-mid font-medium">View all →</button>
                </div>
                <div className="space-y-2">
                  {data.stuckOrders.slice(0, 3).map(o => {
                    const statusDisplay = (o.status_label || '').replace(/_/g, ' ');
                    const severe = o.days >= 8;
                    return (
                      <button key={o.key} onClick={() => navigate(`/orders/${o.order_id}`)}
                        className="w-full text-left flex items-stretch group rounded-xl bg-amber-50/40 border border-amber-100/60 overflow-hidden hover:bg-amber-50/70 hover:border-amber-200/70 transition-colors">
                        {/* Severity left-border strip */}
                        <span className={`w-1 flex-shrink-0 ${severe ? "bg-red-500/70" : "bg-amber-500/70"}`} />

                        <div className="flex items-center gap-3 px-4 py-3.5 flex-1 min-w-0">
                          {/* Issue-type icon (clipboard for hold) */}
                          <div className="w-9 h-9 rounded-lg bg-amber-100/80 text-amber-700 ring-1 ring-amber-200/50 flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                 strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4" />
                              <rect x="9" y="2" width="6" height="9" rx="1" />
                            </svg>
                          </div>

                          {/* Order info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-[15px] font-semibold text-ink-strong tabular-nums">#{o.order_no}</p>
                              {statusDisplay && (
                                <span className="text-[10px] font-medium text-ink-mid bg-white/80 ring-1 ring-stone-200/60 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                  {statusDisplay}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] truncate">
                              <span className="text-ink-muted">{o.customer ?? "—"}</span>
                              {o.hold_reason && (
                                <>
                                  <span className="text-ink-muted/50 mx-1.5">·</span>
                                  <span className="text-ink-mid">{o.hold_reason}</span>
                                </>
                              )}
                            </p>
                          </div>

                          {/* Aging badge */}
                          <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-bold text-sm tabular-nums ${
                            severe
                              ? "bg-red-100 text-red-700 ring-1 ring-red-200/60"
                              : "bg-amber-100 text-amber-800 ring-1 ring-amber-200/60"
                          }`}>
                            {o.days}d
                          </div>

                          {/* Chevron */}
                          <span className="text-ink-muted/60 flex-shrink-0">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                 strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Past SLA group */}
            {overdueTotal > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
                    Past SLA
                  </span>
                  <button onClick={() => setWipModal("PRINTED")}
                    className="text-[11px] text-ink-muted hover:text-ink-mid font-medium">View all →</button>
                </div>
                <div className="space-y-2">
                  {data.overdueOrders.slice(0, 3).map(o => {
                    const severe = o.days_over >= 5;
                    return (
                      <button key={o.key} onClick={() => navigate(`/orders/${o.order_id}`)}
                        className="w-full text-left flex items-stretch group rounded-xl bg-red-50/40 border border-red-100/60 overflow-hidden hover:bg-red-50/70 hover:border-red-200/70 transition-colors">
                        <span className={`w-1 flex-shrink-0 ${severe ? "bg-red-600" : "bg-red-400"}`} />

                        <div className="flex items-center gap-3 px-4 py-3.5 flex-1 min-w-0">
                          {/* Clock icon for SLA breach */}
                          <div className="w-9 h-9 rounded-lg bg-red-100/80 text-red-700 ring-1 ring-red-200/50 flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                 strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-[15px] font-semibold text-ink-strong tabular-nums">#{o.order_no}</p>
                              <span className="text-[10px] font-medium text-ink-mid bg-white/80 ring-1 ring-stone-200/60 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                PRINTED
                              </span>
                            </div>
                            <p className="text-[12px] truncate">
                              <span className="text-ink-muted">{o.customer ?? "—"}</span>
                              {o.sidemark && (
                                <>
                                  <span className="text-ink-muted/50 mx-1.5">·</span>
                                  <span className="text-ink-mid">{o.sidemark}</span>
                                </>
                              )}
                            </p>
                          </div>

                          <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-bold text-sm tabular-nums ${
                            severe
                              ? "bg-red-200/80 text-red-800 ring-1 ring-red-300/60"
                              : "bg-red-100 text-red-700 ring-1 ring-red-200/60"
                          }`}>
                            +{o.days_over}d
                          </div>

                          <span className="text-ink-muted/60 flex-shrink-0">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                 strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ ROW 3 — Daily Sales hero ═══════════════════════════════════
            Full-width primary analytics section. Three columns: bar chart of
            last 5 business days (left), KPI summary cards (middle), and a
            trend line chart comparing this week vs prior 5 days (right). */}
        <div className="card-priority p-5 md:p-6">
          {/* Header */}
          <div className="flex items-end justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-ink-strong">Daily Sales · Last 5 Business Days</h3>
              <p className="text-[12px] text-ink-muted mt-0.5">Orders entered, ex. quotes</p>
            </div>
            <div className="text-[11px] text-ink-muted">5-day rolling window</div>
          </div>

          {/* 3-column grid: bar chart | KPI cards | trend line */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_1.3fr] gap-5 lg:gap-6">

            {/* LEFT — bar chart */}
            <div>
              <DailySalesChart data={data.dailySales} />
            </div>

            {/* MIDDLE — KPI insights */}
            <div className="space-y-3 lg:border-x lg:border-stone-100/80 lg:px-5">
              {/* 5-day total sales */}
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-semibold text-ink-strong tabular-nums leading-tight">
                    {loading ? "—" : fmt$(data.salesKpis.sumSales)}
                  </p>
                  <p className="text-[11px] text-ink-mid leading-tight">5-day total sales</p>
                </div>
              </div>

              {/* Orders entered (5-day) */}
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-stone-100 text-stone-700 ring-1 ring-stone-200/60 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-semibold text-ink-strong tabular-nums leading-tight">
                    {loading ? "—" : data.salesKpis.sumOrders}
                  </p>
                  <p className="text-[11px] text-ink-mid leading-tight">Orders entered · 5 days</p>
                </div>
              </div>

              {/* Avg Roller Shade order value — Monthly (30-day window) */}
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-amber-50 text-amber-800 ring-1 ring-amber-100 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-semibold text-ink-strong tabular-nums leading-tight">
                    {loading ? "—" : fmt$(data.salesKpis.rollerAovMonthly)}
                  </p>
                  <p className="text-[11px] text-ink-mid leading-tight">Avg roller order value · Monthly</p>
                </div>
              </div>

              {/* Top product (5-day) */}
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${data.salesKpis.topProductLabel === 'Roller' ? '#b85d3a' : '#d4a574'}20`,
                               color: data.salesKpis.topProductLabel === 'Roller' ? '#b85d3a' : '#a07845' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-semibold text-ink-strong leading-tight">
                    {loading ? "—" : data.salesKpis.topProductLabel}
                  </p>
                  <p className="text-[11px] text-ink-mid leading-tight">Top product</p>
                  {!loading && data.salesKpis.topProductPct > 0 && (
                    <p className="text-[11px] text-ink-muted mt-0.5 tabular-nums">
                      {data.salesKpis.topProductPct}% of sales
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT — trend line chart */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[12px] font-medium text-ink-strong">Sales Trend</h4>
                <span className="text-[11px] text-ink-muted">5 days</span>
              </div>
              <TrendLineChart current={data.dailySales} prior={data.priorDailySales} />
            </div>
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
      {inProductionModal && (
        <InProductionModal
          productFilter={inProductionModal === true ? 'all' : inProductionModal}
          onClose={() => setInProductionModal(false)}
        />
      )}
      {onHoldModal && (
        <OnHoldModal
          orders={data.heldOrdersAll}
          onClose={() => setOnHoldModal(false)}
          onOrderClick={(id) => { setOnHoldModal(false); navigate(`/orders/${id}`); }}
        />
      )}
    </div>
  );
}

// ─── On Hold Modal ──────────────────────────────────────────────────────────
//
// Shows the full list of held orders (anything with hold_reason set, excluding
// invoiced/cancelled). Sorted by days held desc, so the most-overdue are at the top.
// Click a row to navigate to the order detail page.
//
function OnHoldModal({ orders = [], onClose, onOrderClick }) {
  const total = orders.length;
  const totalAmt = orders.reduce((s, o) => s + Number(o.order_amount || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Orders on Hold</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {total} order{total !== 1 ? 's' : ''}
              {totalAmt > 0 && (
                <> · ${totalAmt.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</>
              )}
            </p>
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
                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-left">Order</th>
                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-left">Customer</th>
                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-left">Status</th>
                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-left">Reason</th>
                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-left">Rep</th>
                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-right">Amount</th>
                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase text-right">Days</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">No orders on hold</td></tr>
              ) : orders.map(o => {
                const statusDisplay = (o.status_label || '').replace(/_/g, ' ');
                return (
                  <tr key={o.key}
                    onClick={() => onOrderClick?.(o.order_id)}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-5 py-3 font-mono text-sm font-semibold text-blue-600">#{o.order_no}</td>
                    <td className="px-5 py-3 text-sm text-gray-700">{o.customer ?? "—"}</td>
                    <td className="px-5 py-3 text-xs text-gray-500 uppercase tracking-wide">{statusDisplay}</td>
                    <td className="px-5 py-3 text-sm text-gray-700">
                      {o.hold_reason ?? "—"}
                      {o.hold_note && (
                        <span className="text-xs text-gray-400 block mt-0.5">{o.hold_note}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{o.sales_rep ?? "—"}</td>
                    <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                      {o.order_amount > 0
                        ? `$${Number(o.order_amount).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        o.days >= 8 ? "bg-red-100 text-red-600" :
                        o.days >= 3 ? "bg-amber-100 text-amber-700" :
                                      "bg-gray-100 text-gray-600"}`}>
                        {o.days}d
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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

function InProductionModal({ onClose, productFilter }) {
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

  // productFilter: 'roller' | 'faux' | 'all' (or anything truthy that isn't roller/faux means all)
  const filteredRows = (productFilter === 'roller' || productFilter === 'faux')
    ? rows.filter(r => r.product_line === productFilter)
    : rows;
  const totalUnits = filteredRows.reduce((s, r) => s + (r.total_units || 0), 0)
  const lineLabel = productFilter === 'roller' ? 'Roller' : productFilter === 'faux' ? 'Faux' : 'All';

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
            <h3 className="font-bold text-gray-900">In Production · {lineLabel}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{filteredRows.length} orders · {totalUnits.toLocaleString()} units</p>
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
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">No orders in production</td></tr>
              ) : filteredRows.map((r, i) => {
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
