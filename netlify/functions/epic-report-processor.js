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

// FULL SHIP — mark orders as invoiced + update daily shipment totals for roller
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
      { status: 'invoiced', actual_ship_date: row.ShippedDate || null, updated_at: new Date().toISOString() }
    )
    if (ok) updated++
  }
  console.log(`  Updated ${updated} orders to invoiced`)

  // For roller orders — aggregate by ship date and upsert into roller_shipments_daily
  if (orderType === 'roller') {
    const dayMap = {}
    for (const row of rows) {
      const date = (row.ShippedDate || '').trim().slice(0, 10)
      if (!date) continue
      if (!dayMap[date]) dayMap[date] = { orders: 0, units: 0, revenue: 0 }
      dayMap[date].orders++
      dayMap[date].units   += parseInt(row.TotalUnits || 0) || 0
      dayMap[date].revenue += parseFloat(row.TotalSales || 0) || 0
    }

    for (const [ship_date, totals] of Object.entries(dayMap)) {
      // Try update first, then insert if not exists
      const ok = await sbUpdate(
        'roller_shipments_daily',
        `ship_date=eq.${ship_date}`,
        { orders: totals.orders, units: totals.units, revenue: totals.revenue, updated_at: new Date().toISOString() }
      )
      if (!ok) {
        await sbUpsert('roller_shipments_daily', [{
          ship_date,
          orders:   totals.orders,
          units:    totals.units,
          revenue:  totals.revenue,
          updated_at: new Date().toISOString(),
        }])
      }
    }
    console.log(`  Updated roller_shipments_daily for ${Object.keys(dayMap).length} dates`)
  }

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
  // Use PATCH to update existing row matched by product_line
  const ok = await sbUpdate(
    'product_line_sales',
    `product_line=eq.${encodeURIComponent(productLine)}`,
    { ...fields, updated_at: new Date().toISOString() }
  )
  if (!ok) {
    // Row doesn't exist yet — insert it
    await sbUpsert('product_line_sales', [{
      product_line: productLine,
      ...fields,
      updated_at: new Date().toISOString(),
    }])
  }
}

// ROLLER SHADE INVOICE BY PRODUCT — writes per-product breakdown to roller_product_breakdown
async function processRollerSalesCSV(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  ROLLER SALES CSV: ${rows.length} rows`)

  const toUpsert = []
  for (const row of rows) {
    const line = (row.ProductLine || row.Product || row['Product Line'] || '').trim()
    if (!line) continue
    toUpsert.push({
      product_line: line,
      units_wtd:    parseInt(row.UnitsWTD  || 0) || 0,
      sales_wtd:    parseCurrency(row.SalesWTD  || 0),
      units_mtd:    parseInt(row.UnitsMTD  || 0) || 0,
      sales_mtd:    parseCurrency(row.SalesMTD  || 0),
      units_ytd:    parseInt(row.UnitsYTD  || 0) || 0,
      sales_ytd:    parseCurrency(row.SalesYTD  || 0),
      updated_at:   new Date().toISOString(),
    })
  }

  if (toUpsert.length) await sbUpsert('roller_product_breakdown', toUpsert)
  console.log(`  Wrote ${toUpsert.length} product lines to roller_product_breakdown`)
  return toUpsert.length
}

// COMBINED ROLLER/FAUX — parses CSV to get units/revenue WTD/MTD/YTD per product line
async function processCombinedCSV(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  COMBINED CSV: ${rows.length} rows`)

  // Find "Shipped to Complete" rows for each category
  const shipped = rows.filter(r =>
    (r.Metric || '').includes('Shipped to Complete')
  )

  for (const row of shipped) {
    const cat = (row.Category || '').trim()
    if (!cat) continue

    const productLine = cat.toLowerCase().includes('faux') ? 'Faux Wood Blinds' : 'Roller Shades'

    await upsertProductLine(productLine, {
      units_wtd: parseInt(row.UnitsWTD  || 0) || 0,
      sales_wtd: parseCurrency(row.SalesWTD  || 0),
      units_mtd: parseInt(row.UnitsMTD  || 0) || 0,
      sales_mtd: parseCurrency(row.SalesMTD  || 0),
      units_ytd: parseInt(row.UnitsYTD  || 0) || 0,
      sales_ytd: parseCurrency(row.SalesYTD  || 0),
    })
    console.log(`  Updated ${productLine} — MTD: ${row.UnitsMTD} units / $${row.SalesMTD}`)
  }

  return shipped.length
}

// ROLLER SHADE WIP — full replacement of roller_wip table with latest data
async function processRollerWIP(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  ROLLER SHADE WIP: ${rows.length} rows`)

  // Delete existing rows and replace with fresh data
  await fetch(`${SUPABASE_URL}/rest/v1/roller_wip?id=neq.00000000-0000-0000-0000-000000000000`, {
    method:  'DELETE',
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  })

  const toInsert = []
  for (const row of rows) {
    const wo = (row.Wo || '').trim()
    if (!wo) continue
    toInsert.push({
      wo,
      order_no:       (row.OrderNo || '').trim(),
      order_date:     row.OrderDate || null,
      sidemark:       (row.Sidemark || '').trim(),
      order_status:   (row.OrderStatus || '').trim(),
      days_in_status: parseInt(row.DaysInStatus || 0) || 0,
      customer:       (row.Customer || '').trim(),
      total_units:    parseInt(row.TotalUnits || 0) || 0,
      total_sales:    parseCurrency(row.TotalSales || 0),
      updated_at:     new Date().toISOString(),
    })
  }

  if (toInsert.length) await sbUpsert('roller_wip', toInsert)

  const creditOK = toInsert.filter(r => r.order_status === 'CREDIT OK')
  const printed  = toInsert.filter(r => r.order_status === 'PRINTED')
  const creditUnits  = creditOK.reduce((s, r) => s + r.total_units, 0)
  const printedUnits = printed.reduce((s, r) => s + r.total_units, 0)

  console.log(`  WIP loaded — Credit OK: ${creditOK.length} orders / ${creditUnits} units | Printed: ${printed.length} orders / ${printedUnits} units`)
  return toInsert.length
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

      // Find CSV attachment — search recursively through nested parts
      function findCsvAttachment(parts) {
        for (const part of parts) {
          if (part.filename?.endsWith('.csv') || part.mimeType === 'text/csv' || part.mimeType === 'application/octet-stream' && part.filename?.endsWith('.csv')) {
            if (part.body?.attachmentId) return part
          }
          if (part.parts?.length) {
            const found = findCsvAttachment(part.parts)
            if (found) return found
          }
        }
        return null
      }

      const allParts = msg.payload?.parts || []
      const att      = findCsvAttachment(allParts)
      const hasCSV   = !!(att?.body?.attachmentId)

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
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCombinedCSV(csvText)
          await markProcessed(messageId, 'combined_report', count)
          results.processed++

        } else if (subject.includes('ROLLER SHADE WIP')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processRollerWIP(csvText)
          await markProcessed(messageId, 'roller_wip', count)
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
