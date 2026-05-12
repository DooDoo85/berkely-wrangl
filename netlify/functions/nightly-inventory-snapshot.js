// =====================================================================
// nightly-inventory-snapshot.js
// =====================================================================
// Netlify scheduled function — runs at 12:05 AM daily.
// Captures one inventory_snapshots row per active part.
//
// Idempotent: rerunning for the same date updates existing rows
// (ON CONFLICT (snapshot_date, part_id) DO UPDATE).
//
// Reads from parts; writes to inventory_snapshots. Never touches parts.
// =====================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

export const config = {
  schedule: '0 11 * * *'    // 11:00 AM UTC = 6:00 AM Central during DST
}

export default async (request) => {
  const startedAt = Date.now()
  const today     = new Date().toISOString().slice(0, 10)

  console.log('')
  console.log('🌙 Wrangl — Nightly Inventory Snapshot')
  console.log('────────────────────────────────────────')
  console.log(`  Snapshot date: ${today}`)

  try {
    // 1) Pull active parts
    const partsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/parts?active=eq.true` +
      `&select=id,part_type,category,vendor_id,vendor,qty_on_hand,qty_committed,velocity_4mo_avg`,
      { headers: authHeaders() }
    )
    if (!partsRes.ok) throw new Error(`Fetch parts failed: ${partsRes.status}`)
    const parts = await partsRes.json()
    console.log(`  Found ${parts.length} active parts`)

    // 2) Compute snapshot rows
    const rows = parts.map(p => {
      const onHand    = Number(p.qty_on_hand)   || 0
      const committed = Number(p.qty_committed) || 0
      const available = Math.max(onHand - committed, 0)
      const velocity  = p.velocity_4mo_avg ? Number(p.velocity_4mo_avg) : null

      const daysRemaining = (velocity && velocity > 0)
        ? Math.round((available / velocity) * 10) / 10
        : null

      let stockStatus
      if (available <= 0)                                          stockStatus = 'critical'
      else if (daysRemaining !== null && daysRemaining <= 7)       stockStatus = 'warning'
      else                                                          stockStatus = 'healthy'

      return {
        snapshot_date:    today,
        part_id:          p.id,
        part_type:        p.part_type,
        category:         p.category,
        vendor_id:        p.vendor_id,
        vendor:           p.vendor,
        qty_on_hand:      onHand,
        qty_committed:    committed,
        qty_available:    available,
        velocity_4mo_avg: velocity,
        days_remaining:   daysRemaining,
        stock_status:     stockStatus,
      }
    })

    // 3) Upsert in batches (Supabase REST limit ~1000 per request)
    const batchSize = 500
    let written = 0
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const upsertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/inventory_snapshots?on_conflict=snapshot_date,part_id`,
        {
          method: 'POST',
          headers: { ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(batch),
        }
      )
      if (!upsertRes.ok) {
        const text = await upsertRes.text()
        throw new Error(`Upsert batch ${i / batchSize + 1} failed: ${upsertRes.status} ${text}`)
      }
      written += batch.length
    }

    // 4) Prune snapshots older than 90 days
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const pruneRes = await fetch(
      `${SUPABASE_URL}/rest/v1/inventory_snapshots?snapshot_date=lt.${cutoffStr}`,
      { method: 'DELETE', headers: authHeaders() }
    )
    const prunedOk = pruneRes.ok
    if (!prunedOk) console.warn(`  ⚠ Prune of pre-${cutoffStr} snapshots failed (non-fatal)`)

    const durationMs = Date.now() - startedAt
    console.log(`  ✅ Wrote ${written} rows in ${durationMs}ms`)
    console.log(`  ${prunedOk ? '🧹' : '⚠'} Pruned snapshots older than ${cutoffStr}`)

    return new Response(JSON.stringify({
      ok: true,
      snapshot_date: today,
      rows_written: written,
      duration_ms: durationMs,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('  ❌ Snapshot failed:', err.message)
    return new Response(JSON.stringify({
      ok: false,
      snapshot_date: today,
      error: err.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

function authHeaders() {
  return {
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type':  'application/json',
  }
}
