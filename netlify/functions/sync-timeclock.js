// ═══════════════════════════════════════════════════════════════════════
// TIMECLOCK SYNC — Shadeflow → Wrangl
//
// Scheduled Netlify function. Reads timeclock_employees + timeclock_entries
// from the Shadeflow Supabase project and upserts them into Wrangl's
// tc_employees / tc_entries tables, so labor data lives alongside shipment
// and revenue data for company-wide labor cost + efficiency reporting.
//
// The Shadeflow timeclock app is NOT touched — this only reads from it.
//
// Env vars (set in Wrangl's Netlify):
//   SHADEFLOW_URL          — Shadeflow project URL
//   SHADEFLOW_SERVICE_KEY  — Shadeflow service_role key (read)
//   SUPABASE_URL           — Wrangl project URL (existing)
//   SUPABASE_SERVICE_ROLE_KEY — Wrangl service key (existing)
//
// Schedule registered in netlify.toml under [functions."sync-timeclock"].
// ═══════════════════════════════════════════════════════════════════════

const SF_URL = process.env.SHADEFLOW_URL
const SF_KEY = process.env.SHADEFLOW_SERVICE_KEY
const W_URL  = process.env.SUPABASE_URL
const W_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

// Read all rows from a Shadeflow table
async function sfSelect(table, cols) {
  const res = await fetch(`${SF_URL}/rest/v1/${table}?select=${cols}`, {
    headers: { apikey: SF_KEY, Authorization: `Bearer ${SF_KEY}` },
  })
  if (!res.ok) throw new Error(`Shadeflow read ${table} failed (${res.status}): ${await res.text()}`)
  return res.json()
}

// Upsert rows into a Wrangl table (merge on primary key)
async function wUpsert(table, rows) {
  if (!rows.length) return true
  const res = await fetch(`${W_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: W_KEY,
      Authorization: `Bearer ${W_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Wrangl upsert ${table} failed (${res.status}): ${await res.text()}`)
  return true
}

export default async function handler() {
  try {
    const missing = []
    if (!SF_URL) missing.push('SHADEFLOW_URL')
    if (!SF_KEY) missing.push('SHADEFLOW_SERVICE_KEY')
    if (!W_URL)  missing.push('SUPABASE_URL')
    if (!W_KEY)  missing.push('SUPABASE_SERVICE_ROLE_KEY')
    if (missing.length) {
      throw new Error('Missing env vars: ' + missing.join(', '))
    }

    // Employees
    const emps = await sfSelect('timeclock_employees', 'id,name,active')
    const empRows = emps.map(e => ({
      id: e.id, name: e.name, active: e.active, synced_at: new Date().toISOString(),
    }))
    await wUpsert('tc_employees', empRows)

    // Entries
    const entries = await sfSelect('timeclock_entries', 'id,employee_id,date,clock_in,clock_out')
    const entRows = entries.map(e => ({
      id: e.id, employee_id: e.employee_id, date: e.date,
      clock_in: e.clock_in, clock_out: e.clock_out, synced_at: new Date().toISOString(),
    }))
    // Upsert in batches
    for (let i = 0; i < entRows.length; i += 500) {
      await wUpsert('tc_entries', entRows.slice(i, i + 500))
    }

    console.log(`✓ Timeclock sync — ${empRows.length} employees, ${entRows.length} entries`)
    return new Response(JSON.stringify({ ok: true, employees: empRows.length, entries: entRows.length }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('✗ Timeclock sync FAILED:', err.message)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
