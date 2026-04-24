// Berkely Wrangl — ePIC Report Processor
// Netlify scheduled function — runs every 15 minutes
// Reads Gmail, processes ePIC CSV reports, updates Wrangl Supabase
//
// Reports handled:
//   BERKELY ROLLER SHADE FULL SHIP  → orders.status = 'complete'
//   BERKELY FAUX FULL SHIP          → orders.status = 'complete'
//   BERKELY ROLLER SHADE PRINTED    → orders.status = 'printed'
//   BERKELY FAUX PRINTED            → orders.status = 'printed'
//   COMBINED ROLLER/FAUX            → inventory dashboard (future)
//   ROLLER SHADE INVOICE BY PRODUCT → st_roller_sales

const GMAIL_CLIENT_ID     = process.env.GMAIL_CLIENT_ID
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN
const EPIC_SENDER         = process.env.EPIC_SENDER || 'noreply@picbusiness.com'
const SUPABASE_URL        = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_KEY

// ── Gmail helpers ─────────────────────────────────────────────────────────────
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`OAuth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

async function gmailSearch(token, query) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  return data.messages || []
}

async function gmailGetMessage(token, id) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

async function gmailGetAttachment(token, messageId, attachmentId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  const b64  = data.data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64').toString('utf-8')
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbQuery(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  })
  return res.json()
}

async function sbUpdate(table, match, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${match}`, {
    method:  'PATCH',
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:        'return=minimal',
    },
    body: JSON.stringify(body),
  })
  return res.ok
}

async function sbUpsert(table, rows, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:        `resolution=merge-duplicates,return=minimal`,
    },
    body: JSON.stringify(rows),
  })
  return res.ok
}

async function alreadyProcessed(messageId) {
  const rows = await sbQuery('epic_sync_log', `message_id=eq.${messageId}&select=id&limit=1`)
  return Array.isArray(rows) && rows.length > 0
}

async function markProcessed(messageId, reportType, count) {
  await sbUpsert('epic_sync_log', [{
    entity_type:  reportType,
    entity_id:    '00000000-0000-0000-0000-000000000000',
    direction:    'from_epic',
    operation:    'update',
    status:       'acked',
    message_id:   messageId,
    payload:      { count },
    processed_at: new Date().toISOString(),
  }], 'message_id')
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = []
  let current  = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes }
    else if (line[i] === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += line[i] }
  }
  result.push(current)
  return result
}

function parseCSV(csvText) {
  const lines   = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/"/g, ''))
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line)
    const row  = {}
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/"/g, '').trim() })
    return row
  })
}

// ── Report processors ─────────────────────────────────────────────────────────

// FULL SHIP — mark orders as complete
async function processFullShip(csvText, orderType) {
  const rows = parseCSV(csvText)
  console.log(`  ${orderType.toUpperCase()} FULL SHIP: ${rows.length} rows`)
  let updated = 0

  for (const row of rows) {
    const orderNo = (row.OrderNo || row.Wo || '').trim()
    if (!orderNo) continue

    const ok = await sbUpdate(
      'orders',
      `epic_id=eq.${orderNo}`,
      { status: 'complete', actual_ship_date: row.ShippedDate || null, updated_at: new Date().toISOString() }
    )
    if (ok) updated++
  }
  console.log(`  Updated ${updated} orders to complete`)
  return updated
}

// PRINTED — mark orders as printed
async function processPrinted(csvText, orderType) {
  const rows = parseCSV(csvText)
  console.log(`  ${orderType.toUpperCase()} PRINTED: ${rows.length} rows`)
  let updated = 0

  for (const row of rows) {
    const orderNo = (row.OrderNo || row.Wo || '').trim()
    if (!orderNo) continue

    // Only update if currently submitted (don't downgrade complete orders)
    const existing = await sbQuery('orders', `epic_id=eq.${orderNo}&select=id,status&limit=1`)
    if (!Array.isArray(existing) || !existing[0]) {
      // Order doesn't exist yet — insert it
      await sbUpsert('orders', [{
        epic_id:       orderNo,
        order_number:  orderNo,
        customer_name: row.Customer || row.CustomerName || '',
        status:        'printed',
        order_date:    row.PrintedDate || row.OrderDate || null,
        sales_rep:     row.Salesperson || null,
        source:        'epic',
        read_only:     true,
      }], 'epic_id')
      updated++
      continue
    }

    const current = existing[0].status
    if (['draft', 'submitted'].includes(current)) {
      await sbUpdate('orders', `epic_id=eq.${orderNo}`, {
        status:     'printed',
        updated_at: new Date().toISOString(),
      })
      updated++
    }
  }
  console.log(`  Updated ${updated} orders to printed`)
  return updated
}

// ROLLER SHADE INVOICE BY PRODUCT
async function processRollerSales(csvText) {
  const rows = parseCSV(csvText)
  const toUpsert = []
  for (const row of rows) {
    if (!row.ProductLine) continue
    toUpsert.push({
      product_line: row.ProductLine,
      units_mtd:    parseInt(row.UnitsMTD)   || 0,
      sales_mtd:    parseFloat(row.SalesMTD) || 0,
      units_ytd:    parseInt(row.UnitsYTD)   || 0,
      sales_ytd:    parseFloat(row.SalesYTD) || 0,
      updated_at:   new Date().toISOString(),
    })
  }
  if (toUpsert.length) await sbUpsert('st_roller_sales', toUpsert, 'product_line')
  return toUpsert.length
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async function(event, context) {
  console.log('\n🤠 Berkely Wrangl — ePIC Report Processor')
  console.log('─'.repeat(40))

  try {
    const token    = await getAccessToken()
    const query    = `from:${EPIC_SENDER} has:attachment newer_than:3d`
    const messages = await gmailSearch(token, query)
    console.log(`Found ${messages.length} emails from ${EPIC_SENDER}`)

    const results = { processed: 0, skipped: 0 }

    for (const { id: messageId } of messages) {
      if (await alreadyProcessed(messageId)) {
        results.skipped++
        continue
      }

      const msg     = await gmailGetMessage(token, messageId)
      const headers = msg.payload?.headers || []
      const subject = headers.find(h => h.name === 'Subject')?.value || ''
      console.log(`\n  Email: ${subject}`)

      // Find CSV attachment
      const parts = msg.payload?.parts || []
      const att   = parts.find(p => p.filename?.endsWith('.csv') || p.mimeType === 'text/csv')
      if (!att?.body?.attachmentId) {
        console.log('    No CSV attachment')
        continue
      }

      const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)

      try {
        let count = 0

        if (subject.includes('BERKELY ROLLER SHADE FULL SHIP')) {
          count = await processFullShip(csvText, 'roller')
          await markProcessed(messageId, 'roller_full_ship', count)
          results.processed++
        } else if (subject.includes('BERKELY FAUX FULL SHIP')) {
          count = await processFullShip(csvText, 'faux')
          await markProcessed(messageId, 'faux_full_ship', count)
          results.processed++
        } else if (subject.includes('BERKELY ROLLER SHADE PRINTED')) {
          count = await processPrinted(csvText, 'roller')
          await markProcessed(messageId, 'roller_printed', count)
          results.processed++
        } else if (subject.includes('BERKELY FAUX PRINTED')) {
          count = await processPrinted(csvText, 'faux')
          await markProcessed(messageId, 'faux_printed', count)
          results.processed++
        } else if (subject.includes('ROLLER SHADE INVOICE BY PRODUCT')) {
          count = await processRollerSales(csvText)
          await markProcessed(messageId, 'roller_sales', count)
          results.processed++
        } else {
          console.log(`    Unrecognized subject: ${subject}`)
        }
      } catch (err) {
        console.error(`    Error processing ${subject}:`, err.message)
      }
    }

    console.log(`\n✅ Done — processed: ${results.processed}, skipped: ${results.skipped}`)
    return { statusCode: 200, body: JSON.stringify(results) }

  } catch (err) {
    console.error('Fatal error:', err)
    return { statusCode: 500, body: err.message }
  }
}
