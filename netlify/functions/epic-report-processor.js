// Berkely Wrangl — ePIC Report Processor
// Netlify scheduled function — runs every 15 minutes
// Reads Gmail, processes ePIC CSV reports, updates Wrangl Supabase
//
// Reports handled:
//   BERKELY ROLLER SHADE FULL SHIP  → orders.status = 'complete'
//   BERKELY FAUX FULL SHIP          → orders.status = 'complete'
//   BEREKLY FAUX FULL SHIP          → orders.status = 'complete' (typo variant)
//   BERKELY ROLLER SHADE PRINTED    → orders.status = 'printed'
//   BERKELY FAUX PRINTED            → orders.status = 'printed'
//   ROLLER SHADE INVOICE BY PRODUCT → product_line_sales (Roller Shades)
//   COMBINED ROLLER/FAUX            → product_line_sales (both lines)

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

// Get plain text body of email (for emails without CSV attachments)
function getEmailBody(msg) {
  const parts = msg.payload?.parts || []

  // Try multipart first
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      const b64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/')
      return Buffer.from(b64, 'base64').toString('utf-8')
    }
  }

  // Fallback to top-level body
  if (msg.payload?.body?.data) {
    const b64 = msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(b64, 'base64').toString('utf-8')
  }

  return ''
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbQuery(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey:        SUPABASE_KEY,
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

async function sbUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:        'resolution=merge-duplicates,return=minimal',
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
  }])
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

    const existing = await sbQuery('orders', `epic_id=eq.${orderNo}&select=id,status&limit=1`)
    if (!Array.isArray(existing) || !existing[0]) {
      await sbUpsert('orders', [{
        epic_id:       orderNo,
        order_number:  orderNo,
        customer_name: row.Customer || row.CustomerName || '',
        status:        'printed',
        order_date:    row.PrintedDate || row.OrderDate || null,
        sales_rep:     row.Salesperson || null,
        source:        'epic',
        read_only:     true,
      }])
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

// ── Product line sales helpers ────────────────────────────────────────────────

// Parse a currency string like "$1,234.56" or "1234.56" → float
function parseCurrency(str) {
  if (!str) return 0
  return parseFloat(str.replace(/[$,]/g, '')) || 0
}

// Upsert a single product line into product_line_sales
async function upsertProductLine(productLine, fields) {
  await sbUpsert('product_line_sales', [{
    product_line: productLine,
    ...fields,
    updated_at: new Date().toISOString(),
  }])
}

// ROLLER SHADE INVOICE BY PRODUCT — CSV with roller shade product line data
async function processRollerSalesCSV(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  ROLLER SALES CSV: ${rows.length} rows`)
  let count = 0

  for (const row of rows) {
    const line = (row.ProductLine || row.Product || row['Product Line'] || '').trim()
    if (!line) continue

    // Map to our canonical product lines
    const productLine = line.toUpperCase().includes('ROLLER') ? 'Roller Shades' : 'Faux Wood Blinds'

    await upsertProductLine(productLine, {
      units_mtd: parseInt(row.UnitsMTD || row.Units_MTD || row['Units MTD']) || 0,
      sales_mtd: parseCurrency(row.SalesMTD || row.Sales_MTD || row['Sales MTD']),
      units_ytd: parseInt(row.UnitsYTD || row.Units_YTD || row['Units YTD']) || 0,
      sales_ytd: parseCurrency(row.SalesYTD || row.Sales_YTD || row['Sales YTD']),
    })
    count++
  }
  return count
}

// COMBINED ROLLER/FAUX — typically an email body with summary numbers
// Logs the raw content so we can see the format and parse it next iteration
async function processCombinedReport(msg) {
  const body = getEmailBody(msg)
  console.log('  COMBINED ROLLER/FAUX body preview:')
  console.log('  ' + body.slice(0, 500).replace(/\n/g, '\n  '))

  // Try to extract numbers from common formats:
  // "Faux Wood: 1234 units / $56,789"
  // "Roller Shades: 456 units / $12,345"
  const fauxUnits   = body.match(/faux[^:]*:\s*([\d,]+)\s*units?/i)
  const fauxSales   = body.match(/faux[^:]*:.*?\$([\d,]+\.?\d*)/i)
  const rollerUnits = body.match(/roller[^:]*:\s*([\d,]+)\s*units?/i)
  const rollerSales = body.match(/roller[^:]*:.*?\$([\d,]+\.?\d*)/i)

  if (fauxUnits || fauxSales) {
    await upsertProductLine('Faux Wood Blinds', {
      units_mtd: parseInt((fauxUnits?.[1] || '0').replace(/,/g, '')) || 0,
      sales_mtd: parseCurrency(fauxSales?.[1] || '0'),
    })
    console.log('  Parsed Faux Wood data from email body')
  }

  if (rollerUnits || rollerSales) {
    await upsertProductLine('Roller Shades', {
      units_mtd: parseInt((rollerUnits?.[1] || '0').replace(/,/g, '')) || 0,
      sales_mtd: parseCurrency(rollerSales?.[1] || '0'),
    })
    console.log('  Parsed Roller Shades data from email body')
  }

  return 1
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async function(event, context) {
  console.log('\n🤠 Berkely Wrangl — ePIC Report Processor')
  console.log('─'.repeat(40))

  try {
    const token    = await getAccessToken()
    // Widen search to catch emails with or without attachments
    const query    = `from:${EPIC_SENDER} newer_than:3d`
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
      const subject = (headers.find(h => h.name === 'Subject')?.value || '').toUpperCase()
      console.log(`\n  Email: ${subject}`)

      // Find CSV attachment if present
      const parts = msg.payload?.parts || []
      const att   = parts.find(p => p.filename?.endsWith('.csv') || p.mimeType === 'text/csv')
      const hasCSV = !!(att?.body?.attachmentId)

      try {
        let count = 0

        // ── Order status updates ──
        if (subject.includes('ROLLER SHADE FULL SHIP')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processFullShip(csvText, 'roller')
          await markProcessed(messageId, 'roller_full_ship', count)
          results.processed++

        } else if (subject.includes('FAUX FULL SHIP')) {
          // Matches both "BERKELY FAUX FULL SHIP" and "BEREKLY FAUX FULL SHIP" (typo)
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processFullShip(csvText, 'faux')
          await markProcessed(messageId, 'faux_full_ship', count)
          results.processed++

        } else if (subject.includes('ROLLER SHADE PRINTED')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processPrinted(csvText, 'roller')
          await markProcessed(messageId, 'roller_printed', count)
          results.processed++

        } else if (subject.includes('FAUX PRINTED')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processPrinted(csvText, 'faux')
          await markProcessed(messageId, 'faux_printed', count)
          results.processed++

        // ── Product line sales ──
        } else if (subject.includes('ROLLER SHADE INVOICE BY PRODUCT')) {
          if (hasCSV) {
            const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
            count = await processRollerSalesCSV(csvText)
          } else {
            // No CSV — log body for inspection and try to parse
            count = await processCombinedReport(msg)
          }
          await markProcessed(messageId, 'roller_sales', count)
          results.processed++

        } else if (subject.includes('COMBINED ROLLER') || subject.includes('COMBINED ROLLER/FAUX')) {
          count = await processCombinedReport(msg)
          await markProcessed(messageId, 'combined_report', count)
          results.processed++

        } else {
          console.log(`  Unrecognized subject: ${subject}`)
        }

      } catch (err) {
        console.error(`  Error processing ${subject}:`, err.message)
      }
    }

    console.log(`\n✅ Done — processed: ${results.processed}, skipped: ${results.skipped}`)
    return { statusCode: 200, body: JSON.stringify(results) }

  } catch (err) {
    console.error('Fatal error:', err)
    return { statusCode: 500, body: err.message }
  }
}
