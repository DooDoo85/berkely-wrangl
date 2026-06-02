// ═══════════════════════════════════════════════════════════════════════
// WRANGL REQUESTS — Thrice-Daily Open-Request Digest
//
// Scheduled Netlify function. Runs 8am / 12pm / 4pm Central, emailing the
// current OPEN request list to David so nothing submitted to the Requests
// board slips through.
//
// Design decisions (locked in with David):
//   - Recipient: david@berkelydistribution.com
//   - Shows ALL open requests each send (not done), grouped by who asked,
//     so an un-actioned request keeps appearing until handled.
//   - Requests added since the last digest (~last send window) are flagged NEW.
//   - Urgent requests surface at the top.
//   - If there are zero open requests, NO email is sent (no empty noise).
//   - No "digest failed" fallback email — failures log loudly to the
//     Netlify function log (matches send-usage-digest convention).
//
// Schedule note: Netlify cron is UTC. 8am/12pm/4pm Central during daylight
// time (CDT, UTC-5) = 13:00 / 17:00 / 21:00 UTC → "0 13,17,21 * * *".
// When Central flips to standard time (CST, UTC-6) these arrive at
// 7am/11am/3pm local — an accepted hour drift, not worth auto-adjusting.
//
// Schedule is registered in netlify.toml under [functions."send-request-digest"]
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL   = process.env.SUPABASE_URL
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY

const DIGEST_RECIPIENT = 'david@berkelydistribution.com'
const FROM_ADDRESS     = 'Wrangl <noreply@berkelydistribution.com>'

// "New since last digest" — sends are ~4–8h apart (8a/12p/4p), so anything
// created in the last 8 hours is flagged NEW. Generous enough to catch the
// gap between sends without missing items.
const NEW_WINDOW_HOURS = 8

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
function hoursSince(iso) {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

function ageLabel(iso) {
  if (!iso) return '—'
  const h = hoursSince(iso)
  if (h < 1) return 'just now'
  if (h < 24) return `${Math.floor(h)}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ── Build the digest data ───────────────────────────────────────────────
async function buildDigest() {
  // All open requests (status not done), newest first.
  const rows = await sb(
    `requests?select=title,detail,requested_by,status,priority,created_at` +
    `&status=neq.done` +
    `&order=created_at.desc`
  )

  // Group by asker; "Unassigned" sinks to the bottom.
  const groups = {}
  for (const r of rows) {
    const who = r.requested_by || 'Unassigned'
    ;(groups[who] = groups[who] || []).push(r)
  }
  const grouped = Object.entries(groups).sort((a, b) => {
    if (a[0] === 'Unassigned') return 1
    if (b[0] === 'Unassigned') return -1
    return b[1].length - a[1].length
  })

  const urgentCount = rows.filter(r => r.priority === 'urgent').length
  const newCount    = rows.filter(r => hoursSince(r.created_at) <= NEW_WINDOW_HOURS).length

  return { total: rows.length, urgentCount, newCount, grouped }
}

// ── Render the email HTML ───────────────────────────────────────────────
function renderEmail(d) {
  const STATUS_LABEL = { new: 'New', doing: 'Doing', waiting: 'Waiting' }

  const groupBlocks = d.grouped.map(([who, items]) => {
    const rowsHtml = items.map(r => {
      const isNew    = hoursSince(r.created_at) <= NEW_WINDOW_HOURS
      const isUrgent = r.priority === 'urgent'
      const badges =
        (isUrgent ? `<span style="font-size:10px;font-weight:700;color:#b91c1c;background:#fee2e2;padding:1px 6px;border-radius:4px;margin-left:6px;">URGENT</span>` : '') +
        (isNew ? `<span style="font-size:10px;font-weight:700;color:#1d4ed8;background:#dbeafe;padding:1px 6px;border-radius:4px;margin-left:6px;">NEW</span>` : '')
      return `<tr style="border-bottom:1px solid #f5f5f4;">
        <td style="padding:6px 8px 6px 0;color:#1c1917;font-size:14px;">
          ${r.title}${badges}
          ${r.detail ? `<div style="color:#78716c;font-size:12px;margin-top:2px;">${r.detail}</div>` : ''}
        </td>
        <td style="padding:6px 8px;color:#57534e;font-size:12px;white-space:nowrap;">${STATUS_LABEL[r.status] || r.status}</td>
        <td style="padding:6px 0 6px 8px;color:#a8a29e;font-size:12px;white-space:nowrap;text-align:right;">${ageLabel(r.created_at)}</td>
      </tr>`
    }).join('')

    return `<h2 style="margin:18px 0 4px;font-size:13px;color:#1c1917;">${who} <span style="color:#a8a29e;font-weight:400;">· ${items.length}</span></h2>
      <table style="border-collapse:collapse;width:100%;">${rowsHtml}</table>`
  }).join('')

  const headlineBits = [`${d.total} open request${d.total !== 1 ? 's' : ''}`]
  if (d.urgentCount > 0) headlineBits.push(`${d.urgentCount} urgent`)
  if (d.newCount > 0)    headlineBits.push(`${d.newCount} new since last digest`)

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:8px;padding:24px;">

      <h1 style="margin:0 0 4px;font-size:18px;color:#1c1917;">Open Requests</h1>
      <p style="margin:0 0 18px;font-size:12px;color:#a8a29e;">${new Date().toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>

      <p style="margin:0 0 6px;font-size:15px;color:#1c1917;line-height:1.5;">
        <strong>${headlineBits.join(' · ')}</strong>
      </p>

      ${groupBlocks}

      <p style="margin:20px 0 0;font-size:11px;color:#a8a29e;border-top:1px solid #f5f5f4;padding-top:12px;">
        Automated digest from the Wrangl Requests board · sent 8am, 12pm, and 4pm.
        Shows everything still open so nothing slips through.
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

    const digest = await buildDigest()

    // No open requests → don't send an empty digest (avoids inbox noise).
    if (digest.total === 0) {
      console.log('✓ Request digest skipped — no open requests')
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const html = renderEmail(digest)
    const subject = digest.urgentCount > 0
      ? `Open requests — ${digest.total} (${digest.urgentCount} urgent)`
      : `Open requests — ${digest.total}`

    await sendEmail(html, subject)

    console.log(`✓ Request digest sent to ${DIGEST_RECIPIENT} — ` +
      `${digest.total} open, ${digest.urgentCount} urgent, ${digest.newCount} new`)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('✗ Request digest FAILED:', err.message)
    console.error(err.stack)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
