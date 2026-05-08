// netlify/functions/send-weekly-recap.js
// Friday 3pm CDT — Weekly Executive Recap email
// Sent to: Pete, Kevin, Parker, David

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)

const EXECUTIVE_RECIPIENTS = [
  'pete.blinds@gmail.com',
  'kevindkimble@gmail.com',
  'parker@berkelydistribution.com',
  'david@berkelydistribution.com',
]

// Western palette to match the dashboard
const COLORS = {
  cream: '#faf6ed',
  saddle: '#a0573a',
  wheat: '#b8854d',
  sunrise: '#ee5e3a',
  cactus: '#5b8c5a',
  brown: '#261810',
  textDark: '#3a2818',
  textMuted: '#6b5847',
  border: '#e6dcc8',
  card: '#ffffff',
}

// ─── Date helpers ───────────────────────────────────────────────
function startOfWeek(d = new Date()) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Monday
  return new Date(date.setDate(diff))
}
function endOfWeek(d = new Date()) {
  const start = startOfWeek(d)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return end
}
function startOfPriorWeek(d = new Date()) {
  const start = startOfWeek(d)
  start.setDate(start.getDate() - 7)
  return start
}
function endOfPriorWeek(d = new Date()) {
  const end = startOfWeek(d)
  end.setDate(end.getDate() - 1)
  return end
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1)
}
function fmtDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtMoney(n) {
  if (n == null) return '$0'
  return '$' + Math.round(n).toLocaleString('en-US')
}
function fmtNum(n) {
  if (n == null) return '0'
  return Math.round(n).toLocaleString('en-US')
}

// ─── Data queries ───────────────────────────────────────────────
async function fetchPeriodTotals(productLine, fromDate, toDate) {
  const { data, error } = await supabase
    .from('orders')
    .select('order_amount, total_units')
    .eq('product_line', productLine)
    .eq('status', 'invoiced')
    .gte('epic_status_date', fromDate.toISOString().slice(0, 10))
    .lte('epic_status_date', toDate.toISOString().slice(0, 10))
  if (error) {
    console.error(`fetchPeriodTotals(${productLine}) error:`, error)
    return { sales: 0, units: 0 }
  }
  return {
    sales: (data || []).reduce((s, r) => s + Number(r.order_amount || 0), 0),
    units: (data || []).reduce((s, r) => s + Number(r.total_units || 0), 0),
  }
}

async function fetchTeamActivity(weekStart, weekEnd) {
  const { data, error } = await supabase
    .from('orders')
    .select('sales_rep')
    .eq('status', 'invoiced')
    .gte('epic_status_date', weekStart.toISOString().slice(0, 10))
    .lte('epic_status_date', weekEnd.toISOString().slice(0, 10))
    .not('sales_rep', 'is', null)

  if (error) {
    console.error('fetchTeamActivity error:', error)
    return []
  }

  // Count invoiced per rep
  const invoicedByRep = {}
  for (const r of data || []) {
    invoicedByRep[r.sales_rep] = (invoicedByRep[r.sales_rep] || 0) + 1
  }

  // Activity counts via profiles join
  const { data: activities } = await supabase
    .from('activities')
    .select('user_id, profiles!inner(full_name)')
    .gte('created_at', weekStart.toISOString())
    .lte('created_at', weekEnd.toISOString())

  const activitiesByRep = {}
  for (const a of activities || []) {
    const name = a.profiles?.full_name
    if (name) activitiesByRep[name] = (activitiesByRep[name] || 0) + 1
  }

  // Combine
  const allReps = new Set([
    ...Object.keys(invoicedByRep),
    ...Object.keys(activitiesByRep),
  ])
  return Array.from(allReps)
    .map(name => ({
      name,
      invoiced: invoicedByRep[name] || 0,
      activities: activitiesByRep[name] || 0,
    }))
    .sort((a, b) => b.invoiced - a.invoiced)
}

async function fetchTopCustomers(weekStart, weekEnd, limit = 5) {
  const { data, error } = await supabase
    .from('orders')
    .select('customer_name, order_amount')
    .eq('status', 'invoiced')
    .gte('epic_status_date', weekStart.toISOString().slice(0, 10))
    .lte('epic_status_date', weekEnd.toISOString().slice(0, 10))
    .not('customer_name', 'is', null)

  if (error) {
    console.error('fetchTopCustomers error:', error)
    return []
  }

  const totals = {}
  for (const r of data || []) {
    totals[r.customer_name] = (totals[r.customer_name] || 0) + Number(r.order_amount || 0)
  }
  return Object.entries(totals)
    .map(([name, sales]) => ({ name, sales }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit)
}

async function fetchOperations(weekStart, weekEnd) {
  // Production started this week (status transitions to in_production OR printed)
  const { count: prodStarted } = await supabase
    .from('order_status_history')
    .select('*', { count: 'exact', head: true })
    .in('to_status', ['in_production', 'printed'])
    .gte('created_at', weekStart.toISOString())
    .lte('created_at', weekEnd.toISOString())

  // Shipped this week (transitions to invoiced)
  const { count: shipped } = await supabase
    .from('order_status_history')
    .select('*', { count: 'exact', head: true })
    .eq('to_status', 'invoiced')
    .gte('created_at', weekStart.toISOString())
    .lte('created_at', weekEnd.toISOString())

  // Avg Print → Invoice (last 30 days, gives a rolling trend)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data: invoiced } = await supabase
    .from('orders')
    .select('order_number, epic_status_date')
    .eq('status', 'invoiced')
    .gte('epic_status_date', thirtyDaysAgo.toISOString().slice(0, 10))
    .limit(500)

  let avgDays = null
  if (invoiced && invoiced.length) {
    const orderNumbers = invoiced.map(o => o.order_number)
    const { data: histories } = await supabase
      .from('order_status_history')
      .select('order_number, to_status, created_at')
      .in('order_number', orderNumbers)
      .in('to_status', ['printed', 'invoiced'])

    // Per order: find printed and invoiced timestamps
    const byOrder = {}
    for (const h of histories || []) {
      if (!byOrder[h.order_number]) byOrder[h.order_number] = {}
      if (h.to_status === 'printed' && !byOrder[h.order_number].printed) {
        byOrder[h.order_number].printed = h.created_at
      }
      if (h.to_status === 'invoiced' && !byOrder[h.order_number].invoiced) {
        byOrder[h.order_number].invoiced = h.created_at
      }
    }

    const diffs = []
    for (const k of Object.keys(byOrder)) {
      const { printed, invoiced } = byOrder[k]
      if (printed && invoiced) {
        const d = (new Date(invoiced) - new Date(printed)) / (1000 * 60 * 60 * 24)
        if (d >= 0 && d <= 60) diffs.push(d)
      }
    }
    if (diffs.length) {
      avgDays = diffs.reduce((s, x) => s + x, 0) / diffs.length
    }
  }

  return {
    prodStarted: prodStarted || 0,
    shipped: shipped || 0,
    avgPrintToInvoice: avgDays,
  }
}

async function fetchPurchasing(weekStart, weekEnd) {
  // POs sent this week
  const { count: posSent } = await supabase
    .from('purchase_orders')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', weekStart.toISOString())
    .lte('sent_at', weekEnd.toISOString())

  // Containers in transit
  const { data: containers } = await supabase
    .from('containers')
    .select('name, eta')
    .in('status', ['in_transit', 'ordered', 'arrived'])
    .order('eta', { ascending: true })

  return {
    posSent: posSent || 0,
    containers: containers || [],
  }
}

// ─── HTML template ──────────────────────────────────────────────
function pctChange(curr, prior) {
  if (!prior) return null
  return ((curr - prior) / prior) * 100
}

function pctBadge(pct) {
  if (pct == null) return ''
  const positive = pct >= 0
  const color = positive ? COLORS.cactus : COLORS.sunrise
  const arrow = positive ? '▲' : '▼'
  const sign = positive ? '+' : ''
  return `<span style="color:${color};font-weight:500;">${arrow} ${sign}${pct.toFixed(1)}%</span>`
}

function buildHtml({ weekStart, weekEnd, roller, faux, rollerPrior, fauxPrior, rollerMtd, fauxMtd, rollerYtd, fauxYtd, team, topCustomers, ops, purchasing }) {
  const rollerChange = pctChange(roller.sales, rollerPrior.sales)
  const fauxChange = pctChange(faux.sales, fauxPrior.sales)

  const teamRows = team.length
    ? team.map(r => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;">${r.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;text-align:right;">${r.invoiced} invoiced</td>
        <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textMuted};font-size:14px;text-align:right;">${r.activities} activities</td>
      </tr>
    `).join('')
    : `<tr><td colspan="3" style="padding:12px 0;color:${COLORS.textMuted};font-size:14px;text-align:center;">No team activity recorded this week</td></tr>`

  const customerRows = topCustomers.length
    ? topCustomers.map(c => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;">${c.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;text-align:right;font-weight:500;">${fmtMoney(c.sales)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="2" style="padding:12px 0;color:${COLORS.textMuted};font-size:14px;text-align:center;">No customer activity this week</td></tr>`

  const containerRows = purchasing.containers.length
    ? purchasing.containers.slice(0, 3).map(c => `
      <div style="font-size:13px;color:${COLORS.textMuted};margin-top:4px;">
        ${c.name}${c.eta ? ` — ETA ${fmtDate(new Date(c.eta))}` : ''}
      </div>
    `).join('')
    : `<div style="font-size:13px;color:${COLORS.textMuted};margin-top:4px;">No containers in transit</div>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Wrangl Weekly Recap</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background-color:${COLORS.brown};padding:24px;border-radius:12px 12px 0 0;">
    <div style="color:#d4aa70;font-size:13px;letter-spacing:1.5px;font-weight:500;margin-bottom:8px;">WRANGL · BERKELY DISTRIBUTION</div>
    <div style="color:#fff;font-size:22px;font-weight:500;">Weekly Recap</div>
    <div style="color:rgba(255,255,255,0.7);font-size:14px;margin-top:4px;">Week of ${fmtDate(weekStart)} – ${fmtDate(weekEnd)}</div>
  </div>

  <!-- Body -->
  <div style="background-color:${COLORS.card};padding:24px;border-radius:0 0 12px 12px;border:1px solid ${COLORS.border};border-top:none;">

    <!-- Week in Numbers -->
    <div style="margin-bottom:28px;">
      <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:14px;">THE WEEK IN NUMBERS</div>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td width="50%" style="padding-right:8px;vertical-align:top;">
            <div style="border-left:3px solid ${COLORS.saddle};padding:12px 14px;background-color:${COLORS.cream};border-radius:0 8px 8px 0;">
              <div style="color:${COLORS.saddle};font-size:13px;font-weight:500;margin-bottom:8px;">Roller Shades</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:6px;">WTD</div>
              <div style="font-size:20px;font-weight:500;color:${COLORS.textDark};">${fmtMoney(roller.sales)}</div>
              <div style="font-size:12px;color:${COLORS.textMuted};">${fmtNum(roller.units)} units</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:10px;">MTD</div>
              <div style="font-size:14px;color:${COLORS.textDark};">${fmtMoney(rollerMtd.sales)} · ${fmtNum(rollerMtd.units)}u</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:6px;">YTD</div>
              <div style="font-size:14px;color:${COLORS.textDark};">${fmtMoney(rollerYtd.sales)}</div>
            </div>
          </td>
          <td width="50%" style="padding-left:8px;vertical-align:top;">
            <div style="border-left:3px solid ${COLORS.wheat};padding:12px 14px;background-color:${COLORS.cream};border-radius:0 8px 8px 0;">
              <div style="color:${COLORS.wheat};font-size:13px;font-weight:500;margin-bottom:8px;">Faux Wood Blinds</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:6px;">WTD</div>
              <div style="font-size:20px;font-weight:500;color:${COLORS.textDark};">${fmtMoney(faux.sales)}</div>
              <div style="font-size:12px;color:${COLORS.textMuted};">${fmtNum(faux.units)} units</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:10px;">MTD</div>
              <div style="font-size:14px;color:${COLORS.textDark};">${fmtMoney(fauxMtd.sales)} · ${fmtNum(fauxMtd.units)}u</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:6px;">YTD</div>
              <div style="font-size:14px;color:${COLORS.textDark};">${fmtMoney(fauxYtd.sales)}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- vs Last Week -->
    <div style="margin-bottom:28px;padding:14px 16px;background-color:${COLORS.cream};border-radius:8px;">
      <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:10px;">COMPARED TO LAST WEEK</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:14px;color:${COLORS.textDark};padding:4px 0;">Roller</td>
          <td style="font-size:14px;color:${COLORS.textDark};padding:4px 0;text-align:right;">${fmtMoney(roller.sales)} <span style="color:${COLORS.textMuted};">vs ${fmtMoney(rollerPrior.sales)}</span> &nbsp; ${pctBadge(rollerChange)}</td>
        </tr>
        <tr>
          <td style="font-size:14px;color:${COLORS.textDark};padding:4px 0;">Faux</td>
          <td style="font-size:14px;color:${COLORS.textDark};padding:4px 0;text-align:right;">${fmtMoney(faux.sales)} <span style="color:${COLORS.textMuted};">vs ${fmtMoney(fauxPrior.sales)}</span> &nbsp; ${pctBadge(fauxChange)}</td>
        </tr>
      </table>
    </div>

    <!-- Team Activity -->
    <div style="margin-bottom:28px;">
      <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:10px;">TEAM ACTIVITY</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${teamRows}
      </table>
    </div>

    <!-- Top Customers -->
    <div style="margin-bottom:28px;">
      <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:10px;">TOP CUSTOMERS THIS WEEK</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${customerRows}
      </table>
    </div>

    <!-- Operations + Purchasing -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="50%" style="padding-right:8px;vertical-align:top;">
          <div style="padding:14px;background-color:${COLORS.cream};border-radius:8px;">
            <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:10px;">📦 OPERATIONS</div>
            <div style="font-size:13px;color:${COLORS.textDark};margin:6px 0;">Production Started: <strong>${ops.prodStarted}</strong></div>
            <div style="font-size:13px;color:${COLORS.textDark};margin:6px 0;">Shipped: <strong>${ops.shipped}</strong></div>
            <div style="font-size:13px;color:${COLORS.textDark};margin:6px 0;">Avg Print → Invoice: <strong>${ops.avgPrintToInvoice ? ops.avgPrintToInvoice.toFixed(1) + 'd' : '—'}</strong></div>
          </div>
        </td>
        <td width="50%" style="padding-left:8px;vertical-align:top;">
          <div style="padding:14px;background-color:${COLORS.cream};border-radius:8px;">
            <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:10px;">🛒 PURCHASING</div>
            <div style="font-size:13px;color:${COLORS.textDark};margin:6px 0;">POs Sent: <strong>${purchasing.posSent}</strong></div>
            <div style="font-size:13px;color:${COLORS.textDark};margin:6px 0;">Containers in Transit: <strong>${purchasing.containers.length}</strong></div>
            ${containerRows}
          </div>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <div style="text-align:center;margin-top:24px;">
      <a href="https://wrangl.berkelydistribution.com/" style="display:inline-block;background-color:${COLORS.saddle};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">Open Wrangl Dashboard →</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px 0;color:${COLORS.textMuted};font-size:12px;">
    Wrangl · Berkely Distribution<br>
    Generated ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} CDT
  </div>

</div>

</body>
</html>`
}

// ─── Main handler ───────────────────────────────────────────────
export const handler = async (event) => {
  console.log('🤠 Wrangl Weekly Recap — Friday 3pm CDT')

  try {
    const now = new Date()
    const weekStart = startOfWeek(now)
    const weekEnd = now // through "now" so Friday afternoon captures the week so far
    const priorStart = startOfPriorWeek(now)
    const priorEnd = endOfPriorWeek(now)
    const monthStart = startOfMonth(now)
    const yearStart = startOfYear(now)

    console.log(`Week: ${weekStart.toISOString()} → ${weekEnd.toISOString()}`)

    // Parallel data fetches
    const [
      roller, faux,
      rollerPrior, fauxPrior,
      rollerMtd, fauxMtd,
      rollerYtd, fauxYtd,
      team, topCustomers, ops, purchasing,
    ] = await Promise.all([
      fetchPeriodTotals('roller', weekStart, weekEnd),
      fetchPeriodTotals('faux', weekStart, weekEnd),
      fetchPeriodTotals('roller', priorStart, priorEnd),
      fetchPeriodTotals('faux', priorStart, priorEnd),
      fetchPeriodTotals('roller', monthStart, weekEnd),
      fetchPeriodTotals('faux', monthStart, weekEnd),
      fetchPeriodTotals('roller', yearStart, weekEnd),
      fetchPeriodTotals('faux', yearStart, weekEnd),
      fetchTeamActivity(weekStart, weekEnd),
      fetchTopCustomers(weekStart, weekEnd, 5),
      fetchOperations(weekStart, weekEnd),
      fetchPurchasing(weekStart, weekEnd),
    ])

    const html = buildHtml({
      weekStart, weekEnd,
      roller, faux,
      rollerPrior, fauxPrior,
      rollerMtd, fauxMtd,
      rollerYtd, fauxYtd,
      team, topCustomers, ops, purchasing,
    })

    const subject = `Wrangl Weekly Recap · ${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`

    const sendResult = await resend.emails.send({
      from: 'Wrangl <wrangl@berkelydistribution.com>',
      to: EXECUTIVE_RECIPIENTS,
      subject,
      html,
    })

    console.log('✅ Sent to:', EXECUTIVE_RECIPIENTS.join(', '))
    console.log('Resend response:', JSON.stringify(sendResult))

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        recipients: EXECUTIVE_RECIPIENTS,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      }),
    }
  } catch (err) {
    console.error('❌ Weekly recap failed:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }
  }
}

// Schedule: every Friday at 3pm CDT (= 20:00 UTC)
// In netlify.toml, register this function with: schedule = "0 20 * * 5"
export const config = {
  schedule: '0 20 * * 5',
}
