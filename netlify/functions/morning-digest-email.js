// =====================================================================
// morning-digest-email.js (v2)
// =====================================================================
// Netlify scheduled function — runs at 6:10 AM Central.
// Builds the daily diagnostic email and sends via Resend.
//
// v2 fixes:
//   - Float display: every number rounded to 2 decimals before printing
//   - Anomaly rows show real part names (joined from parts table)
//   - Threshold: requires BOTH unexplained AND actual/shipped to exceed 3
//   - Smarter classification:
//       • actual=0 AND shipped>0  → "Shipped from untracked stock"
//       • shipped > actual drop   → "Shipped more than depleted ⚠"
//       • shipped < actual drop   → "Depleted beyond logged shipments ⚠"
//       • positive delta, no PO   → "PO receipt likely"
// =====================================================================

const SUPABASE_URL    = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY  = process.env.RESEND_API_KEY
const WRANGL_FROM     = process.env.WRANGL_FROM_EMAIL || 'wrangl@berkelydistribution.com'
const RECIPIENT       = 'david@berkelydistribution.com'
const ANOMALY_TOLERANCE = 3   // both unexplained and movement must clear this

export const config = {
  schedule: '10 11 * * *'   // 11:10 AM UTC = 6:10 AM Central during DST
}

export default async (request) => {
  const today     = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const todayStr  = today.toISOString().slice(0, 10)
  const yestStr   = yesterday.toISOString().slice(0, 10)

  console.log('')
  console.log('☕ Wrangl — Morning Digest Email (v2)')
  console.log('────────────────────────────────────────')
  console.log(`  Comparing ${yestStr} → ${todayStr}`)

  try {
    // 1) Load both snapshots + parts directory + events
    const [todaySnap, yestSnap, partsDir, events] = await Promise.all([
      fetchSnapshot(todayStr),
      fetchSnapshot(yestStr),
      fetchPartsDirectory(),
      fetchEventsSince(yestStr),
    ])
    console.log(`  Today's snapshot:    ${todaySnap.length} parts`)
    console.log(`  Yesterday's snapshot: ${yestSnap.length} parts`)
    console.log(`  Parts directory:      ${Object.keys(partsDir).length} parts`)
    console.log(`  Events:               ${events.length}`)

    if (todaySnap.length === 0) {
      throw new Error(`No snapshot for ${todayStr} — did nightly-inventory-snapshot run?`)
    }

    // 2) Check ePIC sync status
    const epicStatus = await checkEpicSyncs(yestStr, todayStr)

    // 3) Build sections
    const yestByPart = indexBy(yestSnap, 'part_id')
    const shipments  = events.filter(e => e.transaction_type === 'consume')
    const receipts   = events.filter(e => ['receive', 'po_receipt', 'container_receipt'].includes(e.transaction_type))
    const cuts       = events.filter(e => e.transaction_type === 'cut')
    const adjusts    = events.filter(e => ['adjust', 'count'].includes(e.transaction_type))

    const shippedSummary = summarizeShipments(shipments, todaySnap, yestByPart, partsDir)
    const anomalies      = findAnomalies(todaySnap, yestByPart, shipments, receipts, cuts, adjusts, partsDir)
    const statusChanges  = findStatusChanges(todaySnap, yestByPart)

    // 4) Build email
    const body = buildEmailBody({
      todayStr, yestStr,
      epicStatus,
      snapshotCount: todaySnap.length,
      shippedSummary,
      anomalies,
      statusChanges,
    })

    const subject = buildSubject(todayStr, shippedSummary, anomalies)
    console.log('  Subject:', subject)

    // 5) Send
    await sendEmail({ subject, body })

    // 6) Log
    await fetch(
      `${SUPABASE_URL}/rest/v1/daily_digest_log?on_conflict=digest_date`,
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          digest_date:    todayStr,
          recipient:      RECIPIENT,
          parts_shipped:  shippedSummary.partsCount,
          units_shipped:  Math.round(shippedSummary.unitsTotal),
          warnings_new:   statusChanges.newWarnings.length,
          warnings_clear: statusChanges.recovered.length,
          anomalies:      anomalies.length,
          notes:          epicStatus.notes,
        }),
      }
    )

    console.log('  ✅ Digest sent')
    return new Response(JSON.stringify({ ok: true, subject }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('  ❌ Digest failed:', err.message)
    try {
      await sendEmail({
        subject: `Wrangl Daily — ${todayStr} · DIGEST FAILED`,
        body: `The morning digest job failed:\n\n${err.message}\n\nCheck Netlify function logs for morning-digest-email.`,
      })
    } catch (_) {}
    return new Response(JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

// ─── Helpers — display formatting ─────────────────────────────────────────

function r2(n) {
  // Round to 2 decimals, suppress trailing zeros, and avoid float artifacts
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}
function rd(n) {
  // Display: round to 2 decimals, strip trailing zeros (so 50.00 → "50", 25.03 → "25.03")
  const rounded = r2(n)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}
function sign(n) {
  if (n > 0) return '+'
  return ''  // negative numbers carry their sign naturally
}

// ─── Data fetchers ────────────────────────────────────────────────────────

async function fetchSnapshot(date) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory_snapshots?snapshot_date=eq.${date}` +
    `&select=part_id,part_type,vendor,qty_on_hand,qty_committed,qty_available,days_remaining,stock_status`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Snapshot fetch failed for ${date}: ${res.status}`)
  return await res.json()
}

async function fetchPartsDirectory() {
  // Pull a name lookup so we can show real part names in the email
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/parts?active=eq.true&select=id,name,part_type,vendor`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Parts directory fetch failed: ${res.status}`)
  const rows = await res.json()
  return indexBy(rows, 'id')
}

async function fetchEventsSince(sinceDate) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory_transactions?created_at=gte.${sinceDate}T00:00:00` +
    `&select=part_id,transaction_type,quantity,reason,parts(name)`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Events fetch failed: ${res.status}`)
  return await res.json()
}

async function checkEpicSyncs(yestStr, todayStr) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/epic_import_log?imported_at=gte.${yestStr}T20:00:00` +
    `&imported_at=lte.${todayStr}T12:00:00` +
    `&select=email_subject,imported_at`,
    { headers: authHeaders() }
  )
  if (!res.ok) return { rows: [], notes: 'epic_import_log fetch failed' }

  const rows = await res.json()
  const matched = {
    parts_shipped:    rows.find(r => /PARTS\/EXTRUSIONS SHIPPED|PARTS SHIPPED/i.test(r.email_subject)),
    faux_shipped:     rows.find(r => /FAUX SHIPPED/i.test(r.email_subject)),
    committed_stock:  rows.find(r => /COMITTED STOCK|COMMITTED STOCK/i.test(r.email_subject)),
    faux_committed:   rows.find(r => /FAUX COMMITTED/i.test(r.email_subject)),
    extr_committed:   rows.find(r => /COMMITTED EXTRUSIONS/i.test(r.email_subject)),
  }
  return { rows, matched, notes: '' }
}

// ─── Analysis ─────────────────────────────────────────────────────────────

function summarizeShipments(shipments, todaySnap, yestByPart, partsDir) {
  const byPart = new Map()
  for (const s of shipments) {
    const qty = Math.abs(Number(s.quantity) || 0)
    if (qty === 0) continue
    const name = s.parts?.name || partsDir[s.part_id]?.name || '?'
    const cur = byPart.get(s.part_id) || { name, qty: 0 }
    cur.qty += qty
    byPart.set(s.part_id, cur)
  }
  const rows = []
  const todayByPart = indexBy(todaySnap, 'part_id')
  for (const [partId, info] of byPart) {
    const before = yestByPart[partId]?.qty_on_hand ?? null
    const after  = todayByPart[partId]?.qty_on_hand ?? null
    rows.push({ name: info.name, shipped: r2(info.qty), before: r2(before), after: r2(after) })
  }
  rows.sort((a, b) => b.shipped - a.shipped)
  return {
    rows,
    partsCount:  rows.length,
    unitsTotal:  r2(rows.reduce((s, r) => s + r.shipped, 0)),
  }
}

function findAnomalies(todaySnap, yestByPart, shipments, receipts, cuts, adjusts, partsDir) {
  // Sum explained deltas per part
  const explained = new Map()
  const add = (partId, delta) => {
    explained.set(partId, (explained.get(partId) || 0) + delta)
  }
  for (const s of shipments) add(s.part_id, -Math.abs(Number(s.quantity) || 0))
  for (const r of receipts)  add(r.part_id,  Math.abs(Number(r.quantity) || 0))
  for (const c of cuts)      add(c.part_id, -Math.abs(Number(c.quantity) || 0))
  for (const a of adjusts)   add(a.part_id,  Number(a.quantity) || 0)

  const anomalies = []
  for (const t of todaySnap) {
    const y = yestByPart[t.part_id]
    if (!y) continue
    const actualDelta   = Number(t.qty_on_hand) - Number(y.qty_on_hand)
    const expectedDelta = explained.get(t.part_id) || 0
    const unexplained   = actualDelta - expectedDelta

    // Threshold: unexplained must clear tolerance AND something must actually
    // have moved (either real on-hand change OR meaningful shipped/expected).
    // This drops noise rows like "0 → 0 with 1 unit shipped".
    const meaningfulMovement = Math.abs(actualDelta) >= ANOMALY_TOLERANCE
                            || Math.abs(expectedDelta) >= ANOMALY_TOLERANCE
    if (Math.abs(unexplained) < ANOMALY_TOLERANCE) continue
    if (!meaningfulMovement) continue

    // Classify
    let note
    if (actualDelta === 0 && expectedDelta < 0) {
      // Shipped from a part whose on-hand is 0 and stayed 0 — Wrangl isn't tracking
      note = 'Shipped from untracked stock'
    } else if (unexplained < 0 && expectedDelta < 0) {
      // We shipped, but the on-hand drop is larger than what we logged
      note = 'Depleted beyond logged shipments ⚠'
    } else if (unexplained > 0 && expectedDelta < 0) {
      // We shipped, but on-hand barely dropped (or rose) — net receipt mixed in
      note = 'Shipped less than expected ⚠'
    } else if (unexplained > 0 && expectedDelta === 0) {
      note = 'PO receipt likely'
    } else if (unexplained < 0 && expectedDelta === 0) {
      note = 'No shipment logged ⚠'
    } else {
      note = 'Partial mismatch ⚠'
    }

    const partInfo = partsDir[t.part_id] || {}
    const displayName = partInfo.name || y.part_type || 'unknown part'

    anomalies.push({
      part_id: t.part_id,
      name:    displayName,
      vendor:  partInfo.vendor || null,
      before:  r2(Number(y.qty_on_hand)),
      after:   r2(Number(t.qty_on_hand)),
      delta:   r2(actualDelta),
      shipped: r2(Math.abs(expectedDelta)),
      unexplained: r2(unexplained),
      note,
    })
  }
  anomalies.sort((a, b) => Math.abs(b.unexplained) - Math.abs(a.unexplained))
  return anomalies
}

function findStatusChanges(todaySnap, yestByPart) {
  const newWarnings = []
  const recovered   = []
  for (const t of todaySnap) {
    const y = yestByPart[t.part_id]
    if (!y) continue
    if (y.stock_status === 'healthy' && t.stock_status !== 'healthy') {
      newWarnings.push({ part_id: t.part_id, status: t.stock_status, days: t.days_remaining })
    }
    if (y.stock_status !== 'healthy' && t.stock_status === 'healthy') {
      recovered.push({ part_id: t.part_id, was: y.stock_status })
    }
  }
  return { newWarnings, recovered }
}

// ─── Email rendering ──────────────────────────────────────────────────────

function buildSubject(todayStr, shippedSummary, anomalies) {
  const d = new Date(todayStr + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const parts = [`Wrangl Daily — ${dateLabel}`]
  if (shippedSummary.unitsTotal > 0) {
    parts.push(`${rd(shippedSummary.unitsTotal)} units shipped`)
  } else {
    parts.push('quiet overnight')
  }
  if (anomalies.length > 0) parts.push(`${anomalies.length} flagged`)
  return parts.join(' · ')
}

function buildEmailBody({ todayStr, yestStr, epicStatus, snapshotCount, shippedSummary, anomalies, statusChanges }) {
  const d = new Date(todayStr + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const lines = []
  lines.push(`WRANGL DAILY DIGEST · ${dateLabel}`)
  lines.push('')

  // ePIC syncs
  lines.push('ePIC SYNCS OVERNIGHT')
  lines.push('─'.repeat(45))
  const fmtSync = (label, match) => {
    if (match) {
      const t = new Date(match.imported_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      return `  ✓ ${label.padEnd(22)} ${t}`
    } else {
      return `  ✗ ${label.padEnd(22)} not received`
    }
  }
  const m = epicStatus.matched || {}
  lines.push(fmtSync('Parts Shipped',        m.parts_shipped))
  lines.push(fmtSync('Faux Shipped',         m.faux_shipped))
  lines.push(fmtSync('Committed Stock',      m.committed_stock))
  lines.push(fmtSync('Faux Committed',       m.faux_committed))
  lines.push(fmtSync('Committed Extrusions', m.extr_committed))
  lines.push('')
  lines.push(`  Snapshot captured: ${snapshotCount} active parts`)
  lines.push('')
  lines.push('')

  // Shipped section
  lines.push('SHIPPED YESTERDAY')
  lines.push('─'.repeat(45))
  if (shippedSummary.rows.length === 0) {
    lines.push('  Nothing shipped (or shipped reports not yet ingested)')
  } else {
    lines.push(`  ${rd(shippedSummary.unitsTotal)} units across ${shippedSummary.partsCount} parts`)
    lines.push('')
    const top = shippedSummary.rows.slice(0, 12)
    for (const r of top) {
      const beforeAfter = (r.before != null && r.after != null)
        ? `${rd(r.before)} → ${rd(r.after)}`
        : '—'
      lines.push(`  ${(r.name || '?').slice(0, 42).padEnd(44)} ${beforeAfter.padEnd(16)} -${rd(r.shipped)}`)
    }
    if (shippedSummary.rows.length > 12) {
      lines.push(`  ... (${shippedSummary.rows.length - 12} more)`)
    }
  }
  lines.push('')
  lines.push('')

  // Anomalies
  lines.push('ON-HAND CHANGES NOT EXPLAINED BY SHIPMENTS')
  lines.push('─'.repeat(45))
  if (anomalies.length === 0) {
    lines.push('  None — every change matched a shipment, receipt, or cut ✓')
  } else {
    lines.push(`  ${anomalies.length} parts flagged for review`)
    lines.push('')
    for (const a of anomalies.slice(0, 15)) {
      const change = `${rd(a.before)} → ${rd(a.after)} (${sign(a.delta)}${rd(a.delta)})`
      const namePart = a.vendor ? `${a.name} (${a.vendor})` : a.name
      lines.push(`  ${namePart.slice(0, 42).padEnd(44)} ${change.padEnd(24)} ${a.note}`)
    }
    if (anomalies.length > 15) {
      lines.push(`  ... (${anomalies.length - 15} more)`)
    }
  }
  lines.push('')
  lines.push('')

  // Status changes
  lines.push('STOCK STATUS CHANGES')
  lines.push('─'.repeat(45))
  if (statusChanges.newWarnings.length === 0 && statusChanges.recovered.length === 0) {
    lines.push('  No status changes')
  } else {
    if (statusChanges.newWarnings.length > 0) {
      lines.push(`  ↓ ${statusChanges.newWarnings.length} new warning${statusChanges.newWarnings.length === 1 ? '' : 's'} (≤ 7 days of supply)`)
    }
    if (statusChanges.recovered.length > 0) {
      lines.push(`  ↑ ${statusChanges.recovered.length} recovered to healthy`)
    }
  }
  lines.push('')
  lines.push('─'.repeat(45))
  lines.push('View inventory → https://wrangl.berkelydistribution.com/inventory')
  lines.push('')

  return lines.join('\n')
}

// ─── Email + utility helpers ──────────────────────────────────────────────

async function sendEmail({ subject, body }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    WRANGL_FROM,
      to:      [RECIPIENT],
      subject,
      text:    body,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Resend failed: ${res.status} ${t}`)
  }
}

function authHeaders() {
  return {
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type':  'application/json',
  }
}

function indexBy(rows, key) {
  const map = {}
  for (const r of rows) map[r[key]] = r
  return map
}
