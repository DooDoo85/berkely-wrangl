// netlify/functions/send-rep-rollup.js
// Monday 8am CDT — Personal Rep Weekly Rollup
// Sent individually to each opted-in sales rep
// Parker is BCC'd on every rep's email so he can review during 1:1s

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)

// Manager BCC'd on every rep's rollup so he sees the same numbers reps see
const MANAGER_BCC = 'parker@berkelydistribution.com'

// Activity goal targets — must match what RepHome uses
const ACTIVITY_GOALS = {
  scheduled_meeting: 15,
  sample_book: 3,
  cold_call: 0, // tracked but no goal
}

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
// Monday 8am email = "last week" recap = previous Mon-Sun
function lastWeekStart(d = new Date()) {
  const date = new Date(d)
  const day = date.getDay()
  const diffToThisMonday = date.getDate() - day + (day === 0 ? -6 : 1)
  const thisMonday = new Date(date.setDate(diffToThisMonday))
  thisMonday.setHours(0, 0, 0, 0)
  const lastMon = new Date(thisMonday)
  lastMon.setDate(lastMon.getDate() - 7)
  return lastMon
}
function lastWeekEnd(d = new Date()) {
  const lastMon = lastWeekStart(d)
  const lastSun = new Date(lastMon)
  lastSun.setDate(lastSun.getDate() + 6)
  lastSun.setHours(23, 59, 59, 999)
  return lastSun
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

// ─── Per-rep data queries ───────────────────────────────────────
async function fetchOptedInReps() {
  // Get all sales reps with email + opt-in preference (default to opted in)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, email_preferences')
    .eq('role', 'sales')
    .not('email', 'is', null)
    .not('full_name', 'is', null)

  if (error) {
    console.error('fetchOptedInReps error:', error)
    return []
  }

  // Filter to opted-in (default true if preference is unset)
  return (data || []).filter(p => {
    const prefs = p.email_preferences || {}
    return prefs.weekly_rollup !== false
  })
}

async function fetchRepInvoiced(repName, weekStart, weekEnd) {
  const { data, error } = await supabase
    .from('orders')
    .select('order_amount, total_units, customer_name')
    .eq('sales_rep', repName)
    .eq('status', 'invoiced')
    .gte('epic_status_date', weekStart.toISOString().slice(0, 10))
    .lte('epic_status_date', weekEnd.toISOString().slice(0, 10))

  if (error) {
    console.error(`fetchRepInvoiced(${repName}):`, error)
    return { sales: 0, units: 0, orders: 0, byCustomer: {} }
  }

  const byCustomer = {}
  let sales = 0, units = 0
  for (const r of data || []) {
    sales += Number(r.order_amount || 0)
    units += Number(r.total_units || 0)
    if (r.customer_name) {
      byCustomer[r.customer_name] = (byCustomer[r.customer_name] || 0) + Number(r.order_amount || 0)
    }
  }
  return { sales, units, orders: (data || []).length, byCustomer }
}

async function fetchRepPipeline(repName) {
  // Current pipeline state — quotes, printed, in_production, on_hold, invoiced WTD
  // Note: on_hold is a wrangl_status value, NOT a separate column on orders.
  // Mirrors the convention used elsewhere (in_production also lives in wrangl_status).
  const { data, error } = await supabase
    .from('orders')
    .select('status, wrangl_status')
    .eq('sales_rep', repName)

  if (error) {
    console.error(`fetchRepPipeline(${repName}):`, error)
    return { quotes: 0, printed: 0, in_production: 0, on_hold: 0 }
  }

  let quotes = 0, printed = 0, in_production = 0, on_hold = 0
  for (const r of data || []) {
    if (r.wrangl_status === 'on_hold') on_hold++
    if (r.status === 'quote') quotes++
    if (r.status === 'printed') printed++
    if (r.wrangl_status === 'in_production' || r.status === 'in_production') in_production++
  }
  return { quotes, printed, in_production, on_hold }
}

async function fetchRepActivities(repId, weekStart, weekEnd) {
  // Use activity_date (when the activity happened) not created_at (when the row was inserted)
  // to match what the rep sees in their KPI strip on RepHome.
  const { data, error } = await supabase
    .from('activities')
    .select('activity_type')
    .eq('user_id', repId)
    .gte('activity_date', weekStart.toISOString().slice(0, 10))
    .lte('activity_date', weekEnd.toISOString().slice(0, 10))

  if (error) {
    console.error(`fetchRepActivities:`, error)
    return { cold_call: 0, scheduled_meeting: 0, sample_book: 0, total: 0 }
  }

  const counts = { cold_call: 0, scheduled_meeting: 0, sample_book: 0, total: (data || []).length }
  for (const a of data || []) {
    if (a.activity_type in counts) counts[a.activity_type]++
  }
  return counts
}

async function fetchRepNewCustomers(repName, weekStart, weekEnd) {
  // Customers whose first order with this rep landed during the week
  const { data, error } = await supabase
    .from('orders')
    .select('customer_name, order_date')
    .eq('sales_rep', repName)
    .gte('order_date', weekStart.toISOString().slice(0, 10))
    .lte('order_date', weekEnd.toISOString().slice(0, 10))
    .not('customer_name', 'is', null)

  if (error || !data) return 0
  const uniq = new Set(data.map(r => r.customer_name))
  return uniq.size
}

// ─── HTML template per rep ──────────────────────────────────────
function buildRepHtml({ repName, weekStart, weekEnd, invoiced, pipeline, activities, newCustomers, topCustomers }) {
  const meetingsBadge = activities.scheduled_meeting >= ACTIVITY_GOALS.scheduled_meeting
    ? `<span style="color:${COLORS.cactus};">✓</span>`
    : `<span style="color:${COLORS.sunrise};">⚠</span>`
  const samplesBadge = activities.sample_book >= ACTIVITY_GOALS.sample_book
    ? `<span style="color:${COLORS.cactus};">✓</span>`
    : `<span style="color:${COLORS.sunrise};">⚠</span>`

  const customerRows = topCustomers.length
    ? topCustomers.map(c => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;">${c.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;text-align:right;font-weight:500;">${fmtMoney(c.sales)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="2" style="padding:12px 0;color:${COLORS.textMuted};font-size:14px;text-align:center;">No customer activity last week</td></tr>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Wrangl · Your Week</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<div style="max-width:600px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background-color:${COLORS.brown};padding:24px;border-radius:12px 12px 0 0;">
    <div style="color:#d4aa70;font-size:13px;letter-spacing:1.5px;font-weight:500;margin-bottom:8px;">WRANGL · YOUR WEEK</div>
    <div style="color:#fff;font-size:22px;font-weight:500;">${repName}</div>
    <div style="color:rgba(255,255,255,0.7);font-size:14px;margin-top:4px;">${fmtDate(weekStart)} – ${fmtDate(weekEnd)}</div>
  </div>

  <!-- Body -->
  <div style="background-color:${COLORS.card};padding:24px;border-radius:0 0 12px 12px;border:1px solid ${COLORS.border};border-top:none;">

    <!-- Your Week -->
    <div style="margin-bottom:28px;">
      <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:14px;">YOUR WEEK</div>

      <div style="border-left:3px solid ${COLORS.cactus};padding:14px 16px;background-color:${COLORS.cream};border-radius:0 8px 8px 0;margin-bottom:12px;">
        <div style="font-size:11px;color:${COLORS.textMuted};">INVOICED</div>
        <div style="font-size:24px;font-weight:500;color:${COLORS.textDark};margin:4px 0;">${fmtMoney(invoiced.sales)}</div>
        <div style="font-size:13px;color:${COLORS.textMuted};">${fmtNum(invoiced.units)} units across ${invoiced.orders} orders</div>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="padding:8px 8px 8px 0;">
            <div style="background-color:${COLORS.cream};padding:10px 12px;border-radius:6px;">
              <div style="font-size:11px;color:${COLORS.textMuted};">New customers</div>
              <div style="font-size:18px;font-weight:500;color:${COLORS.textDark};">${newCustomers}</div>
            </div>
          </td>
          <td width="50%" style="padding:8px 0 8px 8px;">
            <div style="background-color:${COLORS.cream};padding:10px 12px;border-radius:6px;">
              <div style="font-size:11px;color:${COLORS.textMuted};">Total activities</div>
              <div style="font-size:18px;font-weight:500;color:${COLORS.textDark};">${activities.total}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Activity Goals -->
    <div style="margin-bottom:28px;">
      <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:10px;">ACTIVITY GOALS</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;">Scheduled Meetings</td>
          <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;text-align:right;">
            <strong>${activities.scheduled_meeting}</strong> / ${ACTIVITY_GOALS.scheduled_meeting} ${meetingsBadge}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;">Sample Books Sent</td>
          <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.textDark};font-size:14px;text-align:right;">
            <strong>${activities.sample_book}</strong> / ${ACTIVITY_GOALS.sample_book} ${samplesBadge}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:${COLORS.textDark};font-size:14px;">Cold Calls</td>
          <td style="padding:8px 0;color:${COLORS.textDark};font-size:14px;text-align:right;">
            <strong>${activities.cold_call}</strong>
          </td>
        </tr>
      </table>
    </div>

    <!-- Pipeline -->
    <div style="margin-bottom:28px;">
      <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:10px;">YOUR PIPELINE RIGHT NOW</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="25%" style="padding:4px;text-align:center;">
            <div style="background-color:${COLORS.cream};padding:12px 8px;border-radius:6px;">
              <div style="font-size:20px;font-weight:500;color:${COLORS.textDark};">${pipeline.quotes}</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:2px;">Quotes</div>
            </div>
          </td>
          <td width="25%" style="padding:4px;text-align:center;">
            <div style="background-color:${COLORS.cream};padding:12px 8px;border-radius:6px;border-top:3px solid ${COLORS.saddle};">
              <div style="font-size:20px;font-weight:500;color:${COLORS.textDark};">${pipeline.printed}</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:2px;">Printed</div>
            </div>
          </td>
          <td width="25%" style="padding:4px;text-align:center;">
            <div style="background-color:${COLORS.cream};padding:12px 8px;border-radius:6px;border-top:3px solid ${COLORS.wheat};">
              <div style="font-size:20px;font-weight:500;color:${COLORS.textDark};">${pipeline.in_production}</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:2px;">In Production</div>
            </div>
          </td>
          <td width="25%" style="padding:4px;text-align:center;">
            <div style="background-color:${COLORS.cream};padding:12px 8px;border-radius:6px;border-top:3px solid ${COLORS.sunrise};">
              <div style="font-size:20px;font-weight:500;color:${COLORS.textDark};">${pipeline.on_hold}</div>
              <div style="font-size:11px;color:${COLORS.textMuted};margin-top:2px;">On Hold</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Top Customers -->
    <div style="margin-bottom:28px;">
      <div style="color:${COLORS.textMuted};font-size:11px;letter-spacing:1.5px;font-weight:500;margin-bottom:10px;">YOUR TOP CUSTOMERS LAST WEEK</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${customerRows}
      </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-top:24px;">
      <a href="https://wrangl.berkelydistribution.com/" style="display:inline-block;background-color:${COLORS.saddle};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">Open Wrangl →</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px 0;color:${COLORS.textMuted};font-size:12px;line-height:1.6;">
    Wrangl · Berkely Distribution<br>
    <a href="https://wrangl.berkelydistribution.com/settings/email-preferences" style="color:${COLORS.textMuted};text-decoration:underline;">Manage email preferences</a>
  </div>

</div>

</body>
</html>`
}

// ─── Main handler ───────────────────────────────────────────────
export const handler = async () => {
  console.log('🤠 Wrangl Rep Rollup — Monday 8am CDT')

  try {
    const now = new Date()
    const weekStart = lastWeekStart(now)
    const weekEnd = lastWeekEnd(now)

    console.log(`Last week: ${weekStart.toISOString()} → ${weekEnd.toISOString()}`)

    const reps = await fetchOptedInReps()
    console.log(`Found ${reps.length} opted-in reps`)

    const sentResults = []

    for (const rep of reps) {
      try {
        const [invoiced, pipeline, activities, newCustomers] = await Promise.all([
          fetchRepInvoiced(rep.full_name, weekStart, weekEnd),
          fetchRepPipeline(rep.full_name),
          fetchRepActivities(rep.id, weekStart, weekEnd),
          fetchRepNewCustomers(rep.full_name, weekStart, weekEnd),
        ])

        // Top 5 customers from this rep's invoiced data
        const topCustomers = Object.entries(invoiced.byCustomer)
          .map(([name, sales]) => ({ name, sales }))
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5)

        const html = buildRepHtml({
          repName: rep.full_name,
          weekStart, weekEnd,
          invoiced, pipeline, activities, newCustomers, topCustomers,
        })

        const subject = `Rep Rollup · ${rep.full_name} · Week of ${fmtDate(weekStart)}`

        const sendResult = await resend.emails.send({
          from: 'Wrangl <wrangl@berkelydistribution.com>',
          to: rep.email,
          bcc: MANAGER_BCC,
          subject,
          html,
        })

        console.log(`✅ Sent to ${rep.full_name} <${rep.email}> (BCC: ${MANAGER_BCC})`)
        sentResults.push({ rep: rep.full_name, email: rep.email, ok: true })
      } catch (repErr) {
        console.error(`❌ Failed for ${rep.full_name}:`, repErr)
        sentResults.push({ rep: rep.full_name, email: rep.email, ok: false, error: repErr.message })
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        results: sentResults,
      }),
    }
  } catch (err) {
    console.error('❌ Rep rollup failed:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }
  }
}

// Schedule: every Monday at 8am CDT (= 13:00 UTC)
// In netlify.toml, register this function with: schedule = "0 13 * * 1"
export const config = {
  schedule: '0 13 * * 1',
}
