// ═══════════════════════════════════════════════════════════════════════
// WRANGL USAGE ANALYTICS — Phase 1C: Weekly Usage Digest
//
// Scheduled Netlify function. Runs every Friday 8am CDT (13:00 UTC).
// Queries the last 7 days of usage_events and emails a digest to the owner.
//
// Design decisions (locked in with David):
//   - Recipient: david@berkelydistribution.com only (owner-only visibility)
//   - Owner's own activity is EXCLUDED from every metric
//   - Digest is decision-oriented, not a data dump
//   - Thin/quiet weeks are reported factually, not alarmingly
//   - No "digest failed" fallback email — failures log loudly to the
//     Netlify function log instead (see catch block at bottom)
//
// This is the "lite" version: page-focused only. When Phase 1D ships
// (custom event tracking — activity_logged, customer_viewed, etc.) the
// digest gets a "what the team did" section. The query below is written
// so that extension is additive.
//
// Schedule is registered in netlify.toml under [functions."send-usage-digest"]
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL      = process.env.SUPABASE_URL
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY    = process.env.RESEND_API_KEY

const DIGEST_RECIPIENT  = 'david@berkelydistribution.com'
const FROM_ADDRESS      = 'Wrangl <noreply@berkelydistribution.com>'

// Owner's account — excluded from all team metrics so the numbers
// reflect the team, not David's own clicks.
const OWNER_EMAIL       = 'david@berkelydistribution.com'

// How many days back the digest covers.
const WINDOW_DAYS       = 7
// A user is "quiet" if their most recent event is older than this.
const QUIET_THRESHOLD_DAYS = 7

// ── Supabase REST helper ────────────────────────────────────────────────
async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Supabase query failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

// ── Date helpers ────────────────────────────────────────────────────────
function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

function daysSince(iso) {
  if (!iso) return Infinity
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ── Build the digest data ───────────────────────────────────────────────
async function buildDigest() {
  const windowStart     = isoDaysAgo(WINDOW_DAYS)
  const priorWindowStart = isoDaysAgo(WINDOW_DAYS * 2)

  // This week's events (excluding pageview-only filter — we take everything,
  // which today is all pageviews; Phase 1D events flow in here automatically)
  const thisWeek = await sb(
    `usage_events?select=email,role,path_template,session_id,occurred_at,event_type` +
    `&occurred_at=gte.${windowStart}` +
    `&order=occurred_at.desc`
  )

  // Prior week — only need the distinct active emails for the trend line
  const priorWeek = await sb(
    `usage_events?select=email,occurred_at` +
    `&occurred_at=gte.${priorWindowStart}` +
    `&occurred_at=lt.${windowStart}`
  )

  // All users (for "who hasn't shown up" we need the full roster) — pull
  // the most recent event per user across all time via a simple full scan
  // of distinct emails. Roster is small (~8) so this is cheap.
  const everEvents = await sb(
    `usage_events?select=email,role,occurred_at&order=occurred_at.desc&limit=5000`
  )

  // ── Exclude the owner from every metric ──
  const isOwner = (e) => (e || '').toLowerCase() === OWNER_EMAIL.toLowerCase()
  const week    = thisWeek.filter(r => !isOwner(r.email))
  const prior   = priorWeek.filter(r => !isOwner(r.email))
  const ever    = everEvents.filter(r => !isOwner(r.email))

  // ── Headline: active users this week vs last ──
  const activeThisWeek  = new Set(week.map(r => r.email)).size
  const activeLastWeek  = new Set(prior.map(r => r.email)).size

  // ── Roster: most recent activity per user (all time) ──
  const lastSeen = {}
  const roleByUser = {}
  for (const r of ever) {
    if (!lastSeen[r.email]) lastSeen[r.email] = r.occurred_at  // first hit = most recent (sorted desc)
    if (!roleByUser[r.email]) roleByUser[r.email] = r.role
  }
  const roster = Object.keys(lastSeen)

  // ── Quiet accounts: on the roster but no event in QUIET_THRESHOLD_DAYS ──
  const quiet = roster
    .filter(email => daysSince(lastSeen[email]) >= QUIET_THRESHOLD_DAYS)
    .map(email => ({ email, role: roleByUser[email], lastSeen: lastSeen[email] }))
    .sort((a, b) => daysSince(b.lastSeen) - daysSince(a.lastSeen))

  // ── Page popularity this week ──
  const pageVisits = {}
  for (const r of week) {
    const p = r.path_template || r.path || 'unknown'
    pageVisits[p] = (pageVisits[p] || 0) + 1
  }
  const topPages = Object.entries(pageVisits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // ── Per-user table this week ──
  const perUser = {}
  for (const r of week) {
    if (!perUser[r.email]) {
      perUser[r.email] = {
        email: r.email, role: r.role,
        sessions: new Set(), pageviews: 0,
      }
    }
    perUser[r.email].sessions.add(r.session_id)
    perUser[r.email].pageviews++
  }
  const userRows = Object.values(perUser)
    .map(u => ({
      email: u.email, role: u.role,
      sessions: u.sessions.size, pageviews: u.pageviews,
      lastSeen: lastSeen[u.email],
    }))
    .sort((a, b) => b.pageviews - a.pageviews)

  return {
    windowStart,
    totalEvents: week.length,
    activeThisWeek, activeLastWeek,
    rosterSize: roster.length,
    quiet, topPages, userRows,
  }
}

// ── Render the email HTML ───────────────────────────────────────────────
function renderEmail(d) {
  const weekLabel = new Date(d.windowStart).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric',
  })

  // Headline — factual, not alarmist
  const trend =
    d.activeThisWeek > d.activeLastWeek ? `up from ${d.activeLastWeek}` :
    d.activeThisWeek < d.activeLastWeek ? `down from ${d.activeLastWeek}` :
    `same as last week`

  // Quiet-accounts block
  let quietBlock
  if (d.quiet.length === 0) {
    quietBlock = `<p style="margin:6px 0;color:#3f6212;">Everyone on the roster has used Wrangl in the last ${QUIET_THRESHOLD_DAYS} days.</p>`
  } else {
    quietBlock = `<ul style="margin:6px 0;padding-left:18px;">` +
      d.quiet.map(q =>
        `<li style="margin:3px 0;"><strong>${q.email}</strong> (${q.role || 'unknown'}) — last seen ${fmtDate(q.lastSeen)}, ${daysSince(q.lastSeen)} days ago</li>`
      ).join('') +
      `</ul>`
  }

  // Top pages
  const pagesBlock = d.topPages.length === 0
    ? `<p style="margin:6px 0;color:#78716c;">No page activity recorded this week.</p>`
    : `<table style="border-collapse:collapse;width:100%;margin:6px 0;font-size:13px;">` +
        d.topPages.map(([page, n]) =>
          `<tr><td style="padding:3px 8px 3px 0;color:#44403c;">${page}</td>` +
          `<td style="padding:3px 0;text-align:right;color:#78716c;">${n} views</td></tr>`
        ).join('') +
      `</table>`

  // Per-user table
  const userTable = d.userRows.length === 0
    ? `<p style="margin:6px 0;color:#78716c;">No team activity recorded this week.</p>`
    : `<table style="border-collapse:collapse;width:100%;margin:6px 0;font-size:13px;">
         <tr style="text-align:left;color:#78716c;border-bottom:1px solid #e7e5e4;">
           <th style="padding:4px 8px 4px 0;font-weight:600;">User</th>
           <th style="padding:4px 8px;font-weight:600;">Role</th>
           <th style="padding:4px 8px;font-weight:600;text-align:right;">Sessions</th>
           <th style="padding:4px 8px;font-weight:600;text-align:right;">Pageviews</th>
           <th style="padding:4px 0 4px 8px;font-weight:600;">Last seen</th>
         </tr>` +
      d.userRows.map(u =>
        `<tr style="border-bottom:1px solid #f5f5f4;">
           <td style="padding:4px 8px 4px 0;color:#1c1917;">${u.email}</td>
           <td style="padding:4px 8px;color:#57534e;">${u.role || '—'}</td>
           <td style="padding:4px 8px;text-align:right;color:#57534e;">${u.sessions}</td>
           <td style="padding:4px 8px;text-align:right;color:#57534e;">${u.pageviews}</td>
           <td style="padding:4px 0 4px 8px;color:#57534e;">${fmtDate(u.lastSeen)}</td>
         </tr>`
      ).join('') +
      `</table>`

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:8px;padding:24px;">

      <h1 style="margin:0 0 4px;font-size:18px;color:#1c1917;">Wrangl Usage Digest</h1>
      <p style="margin:0 0 18px;font-size:12px;color:#a8a29e;">Week of ${weekLabel} · last ${WINDOW_DAYS} days · your own activity excluded</p>

      <p style="margin:0 0 18px;font-size:15px;color:#1c1917;line-height:1.5;">
        <strong>${d.activeThisWeek} of ${d.rosterSize}</strong> team members used Wrangl this week (${trend}).
        ${d.totalEvents} pageviews in total.
      </p>

      <h2 style="margin:18px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#78716c;">Quiet accounts</h2>
      ${quietBlock}

      <h2 style="margin:18px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#78716c;">Where the team worked</h2>
      ${pagesBlock}

      <h2 style="margin:18px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#78716c;">Per-user breakdown</h2>
      ${userTable}

      <p style="margin:20px 0 0;font-size:11px;color:#a8a29e;border-top:1px solid #f5f5f4;padding-top:12px;">
        Automated weekly digest from Wrangl usage analytics. Page-focused for now;
        action-level detail will be added once custom event tracking ships.
      </p>
    </div>
  </div>
</body></html>`
}

// ── Send via Resend ─────────────────────────────────────────────────────
async function sendEmail(html, subject) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [DIGEST_RECIPIENT],
      subject,
      html,
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

// ── Handler ─────────────────────────────────────────────────────────────
export default async function handler() {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_API_KEY) {
      throw new Error('Missing required env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY)')
    }

    const digest  = await buildDigest()
    const html    = renderEmail(digest)
    const subject = `Wrangl usage — week of ${new Date(digest.windowStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

    await sendEmail(html, subject)

    console.log(`✓ Usage digest sent to ${DIGEST_RECIPIENT} — ` +
      `${digest.activeThisWeek}/${digest.rosterSize} active, ` +
      `${digest.totalEvents} events, ${digest.quiet.length} quiet accounts`)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // No fallback email by design — fail loudly in the Netlify function log
    // so it's diagnosable, but don't email a "digest failed" notice.
    console.error('✗ Usage digest FAILED:', err.message)
    console.error(err.stack)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
