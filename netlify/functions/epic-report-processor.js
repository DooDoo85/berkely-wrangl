// Berkely Wrangl — ePIC Report Processor
// Netlify scheduled function — runs every 15 minutes
// Reads Gmail, processes ePIC CSV reports, updates Wrangl Supabase
//
// Reports handled:
//   (DEPRECATED — handlers removed 2026-05-29) Roller/Faux Full Ship, Roller/Faux
//   Printed, Printed Orders, Roller Shade WIP, Credit Hold/OK Orders — all folded
//   into MASTER SALES REPORT; ePIC subscriptions turned off.
//   ROLLER SHADE INVOICE BY PRODUCT → product_line_sales (Roller Shades)
//   COMBINED ROLLER/FAUX            → product_line_sales (both lines)
//   COMITTED STOCK                  → epic_committed_stock, qty_committed on parts (RS PART only)
//   COMMITTED EXTRUSIONS            → epic_committed_stock, qty_committed on extrusion parts (RS COMP)
//   FAUX COMMITTED                  → epic_committed_stock, qty_committed on blind parts (FW)
//   COMMITTED FABRIC                → epic_committed_fabric, qty_committed on fabric parts (NEW)
//   PARTS SHIPPED (daily)           → inventory_transactions (consume), qty_on_hand decrement
//   FAUX SHIPPED (daily)            → inventory_transactions (consume), qty_on_hand decrement
//   FABRIC COMPLETED (daily)        → inventory_transactions (consume), qty_on_hand decrement on fabrics (NEW)
//   DAILY INVENTORY SNAPSHOT (daily) → parts.qty_on_hand + qty_committed (FW only), epic_inventory_snapshot
//   OPEN PO SNAPSHOT (daily)         → epic_open_pos, parts.qty_on_order (NEW)

const GMAIL_CLIENT_ID     = process.env.GMAIL_CLIENT_ID
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN
const EPIC_SENDER         = process.env.EPIC_SENDER || 'noreply@picbusiness.com'
const SUPABASE_URL        = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_KEY

// ── Fabric unit conversion ────────────────────────────────────────────────────
// PIC reports fabric in square yards (SY). Wrangl stores fabric in linear inches.
// All fabric assumed to be 118" wide. If a non-standard width is ever introduced,
// this becomes a per-fabric field on the parts table.
const FABRIC_ROLL_WIDTH_INCHES = 118
const SY_TO_INCHES = (sy) => (parseFloat(sy) || 0) * 1296 / FABRIC_ROLL_WIDTH_INCHES
const INCHES_TO_SY = (inches) => (parseFloat(inches) || 0) * FABRIC_ROLL_WIDTH_INCHES / 1296

// ── Fabric name normalization ─────────────────────────────────────────────────
// PIC emits descriptions like "LA ROCHELLE LF - TAUPE - FABRIC" or
// "ORLEANS 1% - BLACK/BRONZE - SCREEN" with all-caps, no accents, and a trailing
// type tag. Wrangl stores names like "La Rochelle LF - Taupe" or "Orléans 1% - Black/Bronze".
// Normalize aggressively (strip accents, strip trailing tags, uppercase) before matching.
function normalizeFabricName(s) {
  if (!s) return ''
  return s
    .normalize('NFD')                       // decompose accents (é → e + combining mark)
    .replace(/[\u0300-\u036f]/g, '')        // strip combining marks
    .replace(/\s*-\s*(FABRIC|SCREEN)\s*$/i, '')  // strip trailing " - FABRIC" / " - SCREEN"
    .trim()
    .toUpperCase()
}

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

function getEmailBody(msg) {
  const parts = msg.payload?.parts || []
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      const b64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/')
      return Buffer.from(b64, 'base64').toString('utf-8')
    }
  }
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

async function sbInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:        'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  return res.ok
}

async function sbDelete(table, match) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${match}`, {
    method:  'DELETE',
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer:        'return=minimal',
    },
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

// ── Fuzzy matching ────────────────────────────────────────────────────────────
function stringSimilarity(a, b) {
  const s1 = a.toLowerCase().trim()
  const s2 = b.toLowerCase().trim()
  if (s1 === s2) return 1.0

  const tokens1 = new Set(s1.split(/\s+|[-\/|"']/))
  const tokens2 = new Set(s2.split(/\s+|[-\/|"']/))
  const intersection = [...tokens1].filter(t => tokens2.has(t)).length
  const union = new Set([...tokens1, ...tokens2]).size
  const tokenScore = union > 0 ? intersection / union : 0

  const m = s1.length, n = s2.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s1[i-1] === s2[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  const charScore = 1 - dp[m][n] / Math.max(m, n)

  return (tokenScore * 0.6 + charScore * 0.4)
}

// ── Report processors ─────────────────────────────────────────────────────────

// Map ProductType from CSV → product_line in DB
function productTypeToLine(productType) {
  if (!productType) return null
  const t = productType.toUpperCase()
  if (t.includes('FAUX'))   return 'faux'
  if (t.includes('ROLLER')) return 'roller'
  return null  // OTHER, blank, unknown — leave null
}

// Normalize rep names — ePIC sends 'PETE BOLENUS' uppercase, customers table has 'Pete Bolenus'.
// Title-case it so the dashboard groups consistently.
function normalizeRepName(s) {
  const v = (s || '').trim()
  if (!v) return ''
  // Only title-case strings that are entirely uppercase. Preserve mixed case as-is
  // ('JT D\'Emidio', 'Christian Heffernan' shouldn't be mangled).
  if (v === v.toUpperCase()) {
    return v.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  }
  return v
}

function parseCurrency(str) {
  if (!str) return 0
  return parseFloat(str.replace(/[$,]/g, '')) || 0
}

async function upsertProductLine(productLine, fields) {
  const ok = await sbUpdate(
    'product_line_sales',
    `product_line=eq.${encodeURIComponent(productLine)}`,
    { ...fields, updated_at: new Date().toISOString() }
  )
  if (!ok) {
    await sbUpsert('product_line_sales', [{
      product_line: productLine,
      ...fields,
      updated_at: new Date().toISOString(),
    }])
  }
}

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

async function processCombinedCSV(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  COMBINED CSV: ${rows.length} rows`)

  const shipped = rows.filter(r => (r.Metric || '').includes('Shipped to Complete'))

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

// ─── PromptAnswers decoder ────────────────────────────────────────────────
// Format: "PromptID\fCode\fValue\f\vPromptID\fCode\fValue\f\v..."
// where \f = 0x0c (form feed) and \v = 0x0b (vertical tab)
function decodePromptAnswers(raw) {
  if (!raw) return {}
  const decoded = {}
  const rows = raw.split('\v')
  for (const row of rows) {
    const cleaned = row.replace(/\f$/, '')
    if (!cleaned) continue
    const parts = cleaned.split('\f')
    if (parts.length >= 3) {
      const promptId = parts[0]
      const value = parts[2]
      decoded[promptId] = value
    }
  }
  return decoded
}

// Map decoded prompt IDs to friendly column names. Mapping derived from
// observed quote PDFs vs decoded blobs (see Quote 114958 reference).
function promptAnswersToFields(raw) {
  const d = decodePromptAnswers(raw)
  const numOrNull = v => {
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }
  return {
    width:               numOrNull(d['1']),
    height:              numOrNull(d['2']),
    mount:               d['3'] || null,            // IM / OM
    top_treatment:       d['8'] || null,            // 3SQF, etc.
    top_treatment_color: d['9'] || null,            // W = White
    room_location:       d['10'] || null,
    light_block:         d['12'] || null,           // Y / N
    channel:             d['13'] || null,           // Y / N (often blank)
  }
}

async function processQuoteDetail(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  QUOTE DETAIL: ${rows.length} line items total`)

  // Group by quote number
  const quotesMap = {}    // quote_no -> header info (built once per quote)
  const lineItems = []    // all line items

  for (const row of rows) {
    const quoteNo = (row.QuoteNo || '').trim()
    if (!quoteNo) continue
    const lineNumber = parseInt(row.LineNumber || 0)
    if (!lineNumber) continue

    // First time seeing this quote — build the header
    if (!quotesMap[quoteNo]) {
      quotesMap[quoteNo] = {
        quote_no:      quoteNo,
        customer_name: (row.CustomerName || '').trim(),
        salesperson:   normalizeRepName((row.Salesperson || '').trim()),
        quote_date:    row.QuoteDate || null,
        status:        (row.QuoteStatus || 'QUOTE').trim(),
        subtotal:      parseCurrency(row.QuoteSubtotal || 0),
        freight:       parseCurrency(row.Freight || 0),
        total:         parseCurrency(row.Total || 0),
        line_count:    0,
        synced_at:     new Date().toISOString(),
      }
    }
    quotesMap[quoteNo].line_count += 1

    // Decode shade specs from PromptAnswers blob
    const specs = promptAnswersToFields(row.PromptAnswers || '')

    lineItems.push({
      quote_no:            quoteNo,
      line_number:         lineNumber,
      product_desc:        (row.ProductDescription || '').trim(),
      fabric_color:        (row.FabricColor || '').trim() || null,
      fabric_spec:         (row.FabricSpec || '').trim() || null,
      room:                (row.Room || '').trim() || null,
      window_no:           (row.WindowNo || '').trim() || null,
      quantity:            parseInt(row.Quantity || 0) || 0,
      unit_price:          parseCurrency(row.UnitPrice || 0),
      line_extended:       parseCurrency(row.LineExtended || 0),
      ...specs,
      prompt_answers_raw:  row.PromptAnswers || null,
      synced_at:           new Date().toISOString(),
    })
  }

  const quotes = Object.values(quotesMap)
  console.log(`  Distinct quotes: ${quotes.length}, line items: ${lineItems.length}`)

  // Upsert quotes in batches
  let qUpserted = 0
  for (let i = 0; i < quotes.length; i += 200) {
    const batch = quotes.slice(i, i + 200)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/epic_quotes?on_conflict=quote_no`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      console.error(`  Quotes batch error: ${res.status} ${await res.text()}`)
    } else {
      qUpserted += batch.length
    }
  }

  // Upsert line items in batches
  let liUpserted = 0
  for (let i = 0; i < lineItems.length; i += 500) {
    const batch = lineItems.slice(i, i + 500)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/epic_quote_line_items?on_conflict=quote_no,line_number`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      console.error(`  Line items batch error: ${res.status} ${await res.text()}`)
    } else {
      liUpserted += batch.length
    }
  }

  console.log(`  Quote detail done — quotes: ${qUpserted}, line items: ${liUpserted}`)
  return qUpserted
}

async function processMasterSalesReport(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  MASTER SALES REPORT: ${rows.length} rows total`)

  const mapStatus = (s) => {
    const upper = (s || '').trim().toUpperCase()
    if (upper === 'QUOTE')        return 'quote'
    if (upper === 'CREDIT HOLD')  return 'credit_hold'
    if (upper === 'CREDIT OK')    return 'credit_ok'
    if (upper === 'PO SENT')      return 'po_sent'
    if (upper === 'PRINTED')      return 'printed'
    if (upper === 'FULL SHIP')    return 'invoiced'   // NEW: shipped = invoiced
    if (upper === 'INVOICED')     return 'invoiced'
    if (upper === 'PAID')         return 'invoiced'
    // skip REVIEW HOLD, MANUAL HOLD, FULL PACK, UNPACKED, PARTIAL SHIP
    return null
  }

  const mapProductLine = (pt) => {
    const upper = (pt || '').trim().toUpperCase()
    if (upper === 'FAUX')   return 'faux'
    if (upper === 'ROLLER') return 'roller'
    return null
  }

  const cleanDate = (s) => {
    const t = (s || '').trim()
    if (!t || t === '0000-00-00') return null
    return t
  }

  // 1. Build incoming data per order_number
  const incomingMap = {}
  for (const row of rows) {
    const orderNo = (row.OrderNo || '').trim()
    if (!orderNo) continue
    const wranglStatus = mapStatus(row.OrderStatus)
    if (!wranglStatus) continue

    incomingMap[orderNo] = {
      epicStatus:    (row.OrderStatus || '').trim().toUpperCase(),
      wranglStatus,
      productLine:   mapProductLine(row.ProductType),
      salesRep:      normalizeRepName(row.Salesperson),
      customerName:  (row.CustomerName || '').trim(),
      totalUnits:    parseInt(row.TotalUnits || 0) || 0,
      orderAmount:   parseCurrency(row.OrderAmount || 0),
      enteredDate:   cleanDate(row.EnteredDate),
      statusDate:    cleanDate(row.StatusDate),
      printedDate:   cleanDate(row.PrintedDate),
      invoicedDate:  cleanDate(row.InvoicedDate),
      daysInStatus:  parseInt(row.DaysInStatus || 0) || 0,
    }
  }

  // 2. Look up existing orders to detect status transitions
  const orderNumbers = Object.keys(incomingMap)
  const existingMap  = {}
  for (let i = 0; i < orderNumbers.length; i += 500) {
    const batch = orderNumbers.slice(i, i + 500)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?select=id,order_number,status,sales_rep,customer_name&order_number=in.(${batch.map(n => `"${n}"`).join(',')})`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    if (res.ok) {
      const data = await res.json()
      data.forEach(o => { existingMap[o.order_number] = o })
    }
  }

  // 2.5. Build a normalized customer_name → customer_id map.
  //      Auto-create customers that show up in the report but don't exist yet.
  //      This is what fixes the "Customer 360 shows zeros" bug — without it,
  //      orders.customer_id stays NULL and Customer 360 has nothing to join on.
  const norm = (s) => (s || '').trim().toUpperCase()

  // Pull all customers (small table; ~160 rows)
  const customerMap = {}  // normalized account_name → customer_id
  {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/customers?select=id,account_name`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    if (res.ok) {
      const data = await res.json()
      data.forEach(c => {
        const key = norm(c.account_name)
        if (key) customerMap[key] = c.id
      })
    }
  }

  // Find names in this report that have no matching customer record
  const reportNames = new Set()
  for (const inc of Object.values(incomingMap)) {
    if (inc.customerName) reportNames.add(norm(inc.customerName))
  }
  const missingNames = []
  for (const key of reportNames) {
    if (!customerMap[key]) {
      // Skip obvious test data — we don't want auto-created junk customers
      if (key.includes('TEST CUSTOMER') || key.includes('TEST ACCOUNT') || key.startsWith('TEST ')) continue
      missingNames.push(key)
    }
  }

  // Auto-create the missing customers in one batch
  if (missingNames.length > 0) {
    // Look up each missing name's display form (use first occurrence's salesRep)
    const newCustomers = missingNames.map(key => {
      // Find first incoming order matching this normalized name to grab original casing + sales_rep
      const sample = Object.values(incomingMap).find(inc => norm(inc.customerName) === key)
      return {
        account_name: sample?.customerName || key,
        sales_rep:    sample?.salesRep || null,
        status:       'active',
        active:       true,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      }
    })

    const res = await fetch(`${SUPABASE_URL}/rest/v1/customers`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(newCustomers),
    })
    if (res.ok) {
      const created = await res.json()
      created.forEach(c => { customerMap[norm(c.account_name)] = c.id })
      console.log(`  Auto-created ${created.length} new customer record(s) from report`)
    } else {
      console.error(`  Customer auto-create failed: ${res.status} ${await res.text()}`)
    }
  }

  // 3. Build upserts + status history
  const toUpsert = []
  const historyRows = []
  let transitions = 0
  const today = new Date().toISOString().slice(0, 10)

  for (const [orderNo, inc] of Object.entries(incomingMap)) {
    const existing   = existingMap[orderNo]
    const prevStatus = existing?.status || null

    const upsertRow = {
      order_number:     orderNo,
      epic_status:      inc.epicStatus,
      epic_status_date: inc.statusDate,
      status:           inc.wranglStatus,
      product_line:     inc.productLine,
      total_units:      inc.totalUnits,
      order_amount:     inc.orderAmount,
      order_date:       inc.enteredDate,
      customer_name:    inc.customerName || existing?.customer_name || null,
      customer_id:      customerMap[norm(inc.customerName)] || null,
      updated_at:       new Date().toISOString(),
    }
    // Preserve existing sales_rep if set; otherwise populate from report
    if (existing?.sales_rep) {
      upsertRow.sales_rep = existing.sales_rep
    } else if (inc.salesRep) {
      upsertRow.sales_rep = inc.salesRep
    }

    toUpsert.push(upsertRow)

    // Log status transition (skip if currently in_production — manual override)
    if (prevStatus && prevStatus !== inc.wranglStatus && prevStatus !== 'in_production') {
      historyRows.push({
        order_number: orderNo,
        order_id:     existing?.id || null,
        from_status:  prevStatus,
        to_status:    inc.wranglStatus,
        status_date:  inc.statusDate || today,
        source:       'epic',
        notes:        'Master Sales Report sync',
      })
      transitions++
    } else if (!prevStatus) {
      historyRows.push({
        order_number: orderNo,
        order_id:     null,
        from_status:  null,
        to_status:    inc.wranglStatus,
        status_date:  inc.statusDate || today,
        source:       'epic',
        notes:        'New order from Master Sales Report',
      })
    }
  }

  // 4. Upsert orders in batches
  let upserted = 0
  for (let i = 0; i < toUpsert.length; i += 500) {
    const batch = toUpsert.slice(i, i + 500)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?on_conflict=order_number`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      console.error(`  Batch error: ${res.status} ${await res.text()}`)
    } else {
      upserted += batch.length
    }
  }

  // 5. Log status transitions
  if (historyRows.length > 0) {
    for (let i = 0; i < historyRows.length; i += 500) {
      const batch = historyRows.slice(i, i + 500)
      await fetch(`${SUPABASE_URL}/rest/v1/order_status_history`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      })
    }
    console.log(`  Status transitions logged: ${transitions}`)
  }

  // 6. Preserve in_production manual flags (sticky until ePIC marks invoiced)
  await fetch(`${SUPABASE_URL}/rest/v1/orders?wrangl_status=eq.in_production&epic_status=not.in.(INVOICED,PAID,FULL SHIP)`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'in_production' }),
  })
  // Clear wrangl_status once ePIC moves to invoiced
  await fetch(`${SUPABASE_URL}/rest/v1/orders?wrangl_status=eq.in_production&epic_status=in.(INVOICED,PAID,FULL SHIP)`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ wrangl_status: null }),
  })

  console.log(`  Master sales report done — upserted: ${upserted}, transitions: ${transitions}`)
  return upserted
}

async function processSalesReport(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  SALES REPORT: ${rows.length} rows total`)

  const mapStatus = (s) => {
    const upper = (s || '').trim().toUpperCase()
    if (upper === 'QUOTE')        return 'quote'
    if (upper === 'CREDIT HOLD')  return 'credit_hold'
    if (upper === 'CREDIT OK')    return 'credit_ok'
    if (upper === 'PO SENT')      return 'po_sent'
    if (upper === 'PRINTED')      return 'printed'
    if (upper === 'INVOICED')     return 'invoiced'
    if (upper === 'PAID')         return 'invoiced'
    return null
  }

  let upserted = 0
  let skipped  = 0
  let transitions = 0
  const toUpsert = []

  const incomingMap = {}
  for (const row of rows) {
    if ((row.RowType || '').trim().toUpperCase() !== 'DETAIL') continue
    const epicStatus   = (row.OrderStatus || '').trim().toUpperCase()
    const wranglStatus = mapStatus(epicStatus)
    if (!wranglStatus) continue
    const orderNo = (row.OrderNo || '').trim()
    if (!orderNo) continue
    incomingMap[orderNo] = { epicStatus, wranglStatus, statusDate: row.StatusDate || null }
  }

  const orderNumbers = Object.keys(incomingMap)
  const existingMap  = {}
  for (let i = 0; i < orderNumbers.length; i += 500) {
    const batch = orderNumbers.slice(i, i + 500)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?select=id,order_number,status,epic_status&order_number=in.(${batch.map(n => `"${n}"`).join(',')})`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    if (res.ok) {
      const data = await res.json()
      data.forEach(o => { existingMap[o.order_number] = o })
    }
  }

  const historyRows = []
  const today = new Date().toISOString().slice(0, 10)

  for (const [orderNo, incoming] of Object.entries(incomingMap)) {
    const existing   = existingMap[orderNo]
    const prevStatus = existing?.status || null

    toUpsert.push({
      order_number:     orderNo,
      epic_status:      incoming.epicStatus,
      epic_status_date: incoming.statusDate || null,
      status:           incoming.wranglStatus,
      updated_at:       new Date().toISOString(),
    })

    if (prevStatus && prevStatus !== incoming.wranglStatus && prevStatus !== 'in_production') {
      historyRows.push({
        order_number: orderNo,
        order_id:     existing?.id || null,
        from_status:  prevStatus,
        to_status:    incoming.wranglStatus,
        status_date:  incoming.statusDate || today,
        source:       'epic',
        notes:        'Daily SALES REPORT sync',
      })
      transitions++
    } else if (!prevStatus) {
      historyRows.push({
        order_number: orderNo,
        order_id:     null,
        from_status:  null,
        to_status:    incoming.wranglStatus,
        status_date:  incoming.statusDate || today,
        source:       'epic',
        notes:        'New order from SALES REPORT',
      })
    }
  }

  for (let i = 0; i < toUpsert.length; i += 500) {
    const batch = toUpsert.slice(i, i + 500)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?on_conflict=order_number`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      console.error(`  Batch error: ${res.status} ${await res.text()}`)
    } else {
      upserted += batch.length
    }
  }

  if (historyRows.length > 0) {
    for (let i = 0; i < historyRows.length; i += 500) {
      const batch = historyRows.slice(i, i + 500)
      await fetch(`${SUPABASE_URL}/rest/v1/order_status_history`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      })
    }
    console.log(`  Status transitions logged: ${transitions}`)
  }

  await fetch(`${SUPABASE_URL}/rest/v1/orders?wrangl_status=eq.in_production&epic_status=not.in.(INVOICED,PAID)`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'in_production' }),
  })

  await fetch(`${SUPABASE_URL}/rest/v1/orders?wrangl_status=eq.in_production&epic_status=in.(INVOICED,PAID)`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ wrangl_status: null }),
  })

  await fetch(`${SUPABASE_URL}/rest/v1/sales_report_log`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ total_rows: rows.length, rows_upserted: upserted, rows_skipped: skipped }),
  })

  console.log(`  Sales report done — upserted: ${upserted}, transitions: ${transitions}, skipped: ${skipped}`)
  return upserted
}

// ── Parts/Faux Shipped processor ─────────────────────────────────────────────
// Reads PIC's PARTS_SHIPPED or FAUX_SHIPPED report and applies consumption:
//   - matches each row to a Wrangl part (by name, then by pic_aliases)
//   - skips if already processed (work_order + description + shipped_date key)
//   - writes inventory_transactions row (type='consume', negative quantity)
//   - decrements parts.qty_on_hand (CLAMPED AT 0)
//   - logs unmatched rows to match_failures table for later cleanup
//
// Source argument: 'parts_shipped' or 'faux_shipped' (for audit trail)
async function processPartsShipped(csvText, source) {
  const rows = parseCSV(csvText)
  console.log(`  ${source.toUpperCase()}: ${rows.length} rows`)

  if (rows.length === 0) return 0

  // Filter to expected stock classes — defensive (PARTS_SHIPPED should be RS PART/RS COMP, FAUX_SHIPPED should be FW)
  const allowedClasses = source === 'faux_shipped' ? ['FW'] : ['RS PART', 'RS COMP']
  const validRows = rows.filter(r => allowedClasses.includes((r.StockClass || '').trim()))

  if (validRows.length === 0) {
    console.log(`  No rows matched expected stock classes ${allowedClasses.join('/')} for ${source}`)
    return 0
  }

  // Step 1: load all active parts (id, name, pic_aliases) once
  const partsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/parts?select=id,name,pic_aliases,qty_on_hand&active=eq.true`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  )
  const allParts = await partsRes.json()

  // Build lookup: normalized_name → part_id
  // Each part can be addressed by its primary name OR any pic_alias
  const nameToPartId = new Map()
  for (const p of allParts) {
    const key = (p.name || '').trim().toUpperCase()
    if (key) nameToPartId.set(key, p.id)
    if (Array.isArray(p.pic_aliases)) {
      for (const alias of p.pic_aliases) {
        const aliasKey = (alias || '').trim().toUpperCase()
        if (aliasKey) nameToPartId.set(aliasKey, p.id)
      }
    }
  }

  // Step 2: build a set of already-processed (work_order, description, shipped_date) keys
  // We query existing consume transactions where the reason matches our backfill/sync source
  // Idempotency check: the notes field contains the work_order, so we use that
  const existingTxnsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory_transactions?select=notes&transaction_type=eq.consume&reason=ilike.${encodeURIComponent('%' + source + '%')}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  )
  const existingTxns = await existingTxnsRes.json()
  const processedKeys = new Set()
  for (const t of existingTxns) {
    // Notes format: "Order #114663 · ELEGANT WINDOWS · {description} · qty 2 EA"
    // We extract a stable key from the notes field
    const m = (t.notes || '').match(/Order #(\S+) · [^·]+ · (.+?) · qty/)
    if (m) {
      processedKeys.add(`${m[1].trim()}|${m[2].trim().toUpperCase()}`)
    }
  }
  console.log(`  ${source}: ${processedKeys.size} previously-processed rows will be skipped`)

  // Step 3: aggregate per-part consumption (in case the report has multiple lines for same part on same order)
  const transactions = []
  const partDeltas = new Map()  // part_id → total consumed
  const failures = []
  let skipped = 0

  for (const row of validRows) {
    const workOrder    = (row.WorkOrder || '').trim()
    const shippedDate  = (row.ShippedDate || '').trim()
    const customer     = (row.Customer || '').trim()
    const description  = (row.ComponentDescription || '').trim()
    const stockCode    = (row.StockCode || '').trim()
    const stockClass   = (row.StockClass || '').trim()
    const uom          = (row.UOM || '').trim()
    const qty          = parseFloat(row.TotalRequiredQty)

    if (!workOrder || !description || isNaN(qty) || qty <= 0) continue

    const idempotencyKey = `${workOrder}|${description.toUpperCase()}`
    if (processedKeys.has(idempotencyKey)) {
      skipped++
      continue
    }

    const partId = nameToPartId.get(description.toUpperCase())
    if (!partId) {
      failures.push({
        source: source,
        work_order: workOrder,
        shipped_date: shippedDate || null,
        stock_code: stockCode,
        description: description,
        required_qty: qty,
        uom: uom,
        stock_class: stockClass,
        reason: 'No matching part in Wrangl parts table (name + alias lookup failed)',
      })
      continue
    }

    // Build the consume transaction
    transactions.push({
      transaction_type: 'consume',
      part_id: partId,
      quantity: -qty,
      reason: `${source} daily sync`,
      notes: `Order #${workOrder} · ${customer} · ${description} · qty ${qty} ${uom}`,
      created_at: shippedDate
        ? `${shippedDate}T12:00:00Z`
        : new Date().toISOString(),
    })

    // Track per-part consumption for the on_hand decrement
    partDeltas.set(partId, (partDeltas.get(partId) || 0) + qty)
  }

  console.log(`  ${source}: ${transactions.length} new transactions, ${skipped} skipped (already processed), ${failures.length} unmatched`)

  // Step 4: write transactions in batches (Supabase REST has row limits)
  if (transactions.length > 0) {
    const BATCH_SIZE = 500
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE)
      await fetch(`${SUPABASE_URL}/rest/v1/inventory_transactions`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      })
    }
  }

  // Step 5: decrement on_hand for each affected part (clamped at 0)
  for (const [partId, delta] of partDeltas.entries()) {
    // Find current on_hand
    const part = allParts.find(p => p.id === partId)
    if (!part) continue
    const currentOnHand = Number(part.qty_on_hand) || 0
    const newOnHand = Math.max(0, currentOnHand - delta)

    await fetch(`${SUPABASE_URL}/rest/v1/parts?id=eq.${partId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ qty_on_hand: newOnHand, updated_at: new Date().toISOString() }),
    })
  }

  // Step 6: write match failures
  if (failures.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/match_failures`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(failures),
    })
  }

  console.log(`  ${source} done: applied ${transactions.length} consume txns, decremented ${partDeltas.size} parts, logged ${failures.length} failures`)
  return transactions.length
}


// ── Fabric processors ────────────────────────────────────────────────────────
// Two reports, mirroring the component pattern but with one important difference:
//   - COMMITTED_FABRIC  → bumps qty_committed only (touches epic_committed_fabric)
//   - FABRIC_COMPLETED  → writes consume audit + decrements qty_on_hand
//                         + relieves matching epic_committed_fabric rows (qty_committed)
//
// qty_on_hand is touched ONLY by the consumption handler. qty_committed is touched
// ONLY by the commit/relief cycle. No double-decrement risk.
//
// Matching: ALWAYS by FabricDescription (never SKU), with smart normalization that
// strips accents and trailing type tags (" - FABRIC" / " - SCREEN") before comparing.
// Units: PIC reports SY; Wrangl stores linear inches. Conversion via SY_TO_INCHES().

async function processCommittedFabric(csvText, orderStatus = 'PRINTED') {
  const rows = parseCSV(csvText)
  console.log(`  COMMITTED_FABRIC [${orderStatus}]: ${rows.length} rows`)

  // Load all active fabric parts once
  const fabricParts = await sbQuery(
    'parts',
    'select=id,name,pic_aliases&part_type=eq.fabric&active=eq.true&limit=1000'
  )
  const fabrics = Array.isArray(fabricParts) ? fabricParts : []
  console.log(`  Loaded ${fabrics.length} active fabric parts for matching`)

  // Build normalized lookup: NORMALIZED_NAME → part_id
  // Includes both the primary name and any pic_aliases the part has.
  const nameToFabricId = new Map()
  for (const f of fabrics) {
    const primary = normalizeFabricName(f.name)
    if (primary) nameToFabricId.set(primary, f.id)
    if (Array.isArray(f.pic_aliases)) {
      for (const alias of f.pic_aliases) {
        const ak = normalizeFabricName(alias)
        if (ak) nameToFabricId.set(ak, f.id)
      }
    }
  }

  // FRESH SNAPSHOT — clear ONLY this status's unrelieved rows.
  // We must NOT clear the other status's rows; both reports coexist.
  // We also do NOT zero out parts.qty_committed here — see reconciliation
  // block at the end, which sums across both status feeds.
  await fetch(`${SUPABASE_URL}/rest/v1/epic_committed_fabric?relieved=eq.false&order_status=eq.${encodeURIComponent(orderStatus)}`, {
    method:  'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })

  const stats    = { new: 0, auto_matched: 0, unmatched: 0 }
  const toCommit = {}  // part_id → total inches to commit
  const failures = []

  for (const row of rows) {
    const wo          = (row.WorkOrder || '').trim()
    // Printed reports use DatePrinted; Credit OK reports use DateEntered.
    const datePrinted = (row.DatePrinted || '').trim().slice(0, 10) || null
    const dateEntered = (row.DateEntered || '').trim().slice(0, 10) || null
    const customer    = (row.Customer || '').trim()
    const description = (row.FabricDescription || '').trim()
    const stockCode   = (row.FabricSKU || '').trim()    // captured for traceability only
    const stockClass  = (row.StockClass || '').trim()
    const qtySY       = parseFloat(row.TotalRequiredQty) || 0
    const uom         = (row.UOM || '').trim()

    if (!wo || !description || qtySY <= 0) continue

    stats.new++

    const qtyInches = SY_TO_INCHES(qtySY)

    // Match by description (NEVER by SKU)
    const normalized = normalizeFabricName(description)
    const partId = nameToFabricId.get(normalized) || null

    let matchStatus = 'unmatched'
    let matchScore  = 0
    if (partId) {
      matchStatus = 'auto_matched'
      matchScore  = 1.0
      stats.auto_matched++
      if (!toCommit[partId]) toCommit[partId] = 0
      toCommit[partId] += qtyInches
    } else {
      stats.unmatched++
      failures.push({
        source:        'committed_fabric',
        work_order:    wo,
        shipped_date:  datePrinted,
        stock_code:    stockCode,
        description:   description,
        required_qty:  qtySY,
        uom:           uom,
        stock_class:   stockClass,
        reason:        'No matching fabric in Wrangl parts table (name lookup failed after normalization)',
      })
    }

    // Insert the commitment row regardless — we want to track unmatched too
    await sbInsert('epic_committed_fabric', [{
      work_order:           wo,
      date_printed:         datePrinted,
      date_entered:         dateEntered,
      order_status:         orderStatus,
      fabric_sku:           stockCode,
      fabric_description:   description,
      required_qty_sy:      qtySY,
      required_qty_inches:  qtyInches,
      uom,
      stock_class:          stockClass,
      part_id:              partId,
      match_status:         matchStatus,
      match_score:          matchScore,
    }])
  }

  // ── Reconcile parts.qty_committed across BOTH status feeds ───────────
  // Both Printed and Credit OK fabric reports write into the same
  // parts.qty_committed column. Recompute from the table itself so neither
  // status's commitments overwrite the other's.
  console.log(`  Reconciling parts.qty_committed for fabric across all statuses...`)
  const partIdsToReconcile = new Set(Object.keys(toCommit))
  const allFabricCommitRows = await sbQuery(
    'epic_committed_fabric',
    `select=part_id&relieved=eq.false&part_id=not.is.null`
  )
  if (Array.isArray(allFabricCommitRows)) {
    for (const r of allFabricCommitRows) if (r.part_id) partIdsToReconcile.add(r.part_id)
  }
  // Include any fabric currently showing qty_committed > 0 so we can zero
  // it if it's no longer in the table.
  const currentlyCommittedFabrics = await sbQuery(
    'parts',
    `select=id&part_type=eq.fabric&active=eq.true&qty_committed=gt.0`
  )
  if (Array.isArray(currentlyCommittedFabrics)) {
    for (const p of currentlyCommittedFabrics) partIdsToReconcile.add(p.id)
  }

  for (const partId of partIdsToReconcile) {
    const sumRes = await sbQuery(
      'epic_committed_fabric',
      `select=required_qty_inches&part_id=eq.${partId}&relieved=eq.false`
    )
    const totalInches = Array.isArray(sumRes)
      ? sumRes.reduce((acc, r) => acc + (parseFloat(r.required_qty_inches) || 0), 0)
      : 0
    await sbUpdate('parts', `id=eq.${partId}`, {
      qty_committed: Math.round(totalInches * 100) / 100,
      updated_at:    new Date().toISOString(),
    })
  }

  if (failures.length > 0) {
    await sbInsert('match_failures', failures)
  }

  await sbInsert('epic_import_log', [{
    import_type:            orderStatus === 'CREDIT OK' ? 'committed_fabric_credit_ok' : 'committed_fabric',
    records_total:          rows.length,
    records_new:            stats.new,
    records_auto_matched:   stats.auto_matched,
    records_unmatched:      stats.unmatched,
    notes:                  `Committed ${Object.keys(toCommit).length} fabrics (${orderStatus})`,
  }])

  console.log(`  COMMITTED_FABRIC [${orderStatus}] done — new: ${stats.new}, matched: ${stats.auto_matched}, unmatched: ${stats.unmatched}`)
  return stats.new
}


async function processFabricCompleted(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  FABRIC_COMPLETED: ${rows.length} rows`)

  // Step 1: load all active fabric parts once
  const fabricParts = await sbQuery(
    'parts',
    'select=id,name,pic_aliases,qty_on_hand,qty_committed&part_type=eq.fabric&active=eq.true&limit=1000'
  )
  const fabrics = Array.isArray(fabricParts) ? fabricParts : []
  const nameToFabricId = new Map()
  for (const f of fabrics) {
    const primary = normalizeFabricName(f.name)
    if (primary) nameToFabricId.set(primary, f.id)
    if (Array.isArray(f.pic_aliases)) {
      for (const alias of f.pic_aliases) {
        const ak = normalizeFabricName(alias)
        if (ak) nameToFabricId.set(ak, f.id)
      }
    }
  }

  // Step 2: idempotency — find existing consume rows already processed for fabric_completed
  const existingTxnsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory_transactions?select=notes&transaction_type=eq.consume&reason=ilike.${encodeURIComponent('%fabric_completed%')}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  )
  const existingTxns = await existingTxnsRes.json()
  const processedKeys = new Set()
  for (const t of existingTxns) {
    // Notes format: "Order #114777 · DID-G2 · LA ROCHELLE BO - BEIGE · qty 9.0888 SY"
    const m = (t.notes || '').match(/Order #(\S+) · [^·]+ · (.+?) · qty/)
    if (m) processedKeys.add(`${m[1].trim()}|${normalizeFabricName(m[2])}`)
  }
  console.log(`  FABRIC_COMPLETED: ${processedKeys.size} previously-processed rows will be skipped`)

  const transactions = []
  const partDeltas   = new Map()   // part_id → total inches consumed
  const woTouched    = new Set()   // work orders we'll relieve commitments for
  const failures     = []
  let skipped = 0

  for (const row of rows) {
    const wo          = (row.WorkOrder || '').trim()
    const shippedDate = (row.ShippedDate || '').trim()
    const customer    = (row.Customer || '').trim()
    const description = (row.FabricDescription || '').trim()
    const stockCode   = (row.FabricSKU || '').trim()  // captured for traceability only
    const stockClass  = (row.StockClass || '').trim()
    const qtySY       = parseFloat(row.TotalRequiredQty) || 0
    const uom         = (row.UOM || '').trim()

    if (!wo || !description || qtySY <= 0) continue

    const normalized = normalizeFabricName(description)
    const idempotencyKey = `${wo}|${normalized}`
    if (processedKeys.has(idempotencyKey)) {
      skipped++
      continue
    }

    const partId = nameToFabricId.get(normalized)
    if (!partId) {
      failures.push({
        source:        'fabric_completed',
        work_order:    wo,
        shipped_date:  shippedDate || null,
        stock_code:    stockCode,
        description:   description,
        required_qty:  qtySY,
        uom:           uom,
        stock_class:   stockClass,
        reason:        'No matching fabric in Wrangl parts table (name lookup failed after normalization)',
      })
      continue
    }

    const qtyInches = SY_TO_INCHES(qtySY)

    transactions.push({
      transaction_type: 'consume',
      part_id:          partId,
      quantity:         -qtyInches,
      reason:           'fabric_completed daily sync',
      notes:            `Order #${wo} · ${customer} · ${description} · qty ${qtySY} ${uom}`,
      created_at:       shippedDate ? `${shippedDate}T12:00:00Z` : new Date().toISOString(),
    })

    partDeltas.set(partId, (partDeltas.get(partId) || 0) + qtyInches)
    woTouched.add(wo)
  }

  console.log(`  FABRIC_COMPLETED: ${transactions.length} new transactions, ${skipped} skipped, ${failures.length} unmatched`)

  // Step 3: write consume audit rows
  if (transactions.length > 0) {
    const BATCH_SIZE = 500
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE)
      await fetch(`${SUPABASE_URL}/rest/v1/inventory_transactions`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      })
    }
  }

  // Step 4: decrement qty_on_hand for each affected fabric (clamped at 0)
  for (const [partId, inchesDelta] of partDeltas.entries()) {
    const part = fabrics.find(f => f.id === partId)
    if (!part) continue
    const currentOnHand = Number(part.qty_on_hand) || 0
    const newOnHand = Math.max(0, currentOnHand - inchesDelta)
    await fetch(`${SUPABASE_URL}/rest/v1/parts?id=eq.${partId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        qty_on_hand: Math.round(newOnHand * 100) / 100,
        updated_at:  new Date().toISOString(),
      }),
    })
  }

  // Step 5: relieve fabric commitments for the work orders we touched
  // Reduces qty_committed by the committed amount (NOT the completed amount) so
  // the commitment is fully released, even if completion overshoot/undershoot the BOM.
  let relievedRows = 0
  for (const wo of woTouched) {
    const committed = await sbQuery(
      'epic_committed_fabric',
      `work_order=eq.${wo}&relieved=eq.false&part_id=not.is.null&select=id,part_id,required_qty_inches`
    )
    if (!Array.isArray(committed) || !committed.length) continue

    // Sum per part
    const partRelief = {}
    for (const line of committed) {
      const id = line.part_id
      const inches = parseFloat(line.required_qty_inches) || 0
      if (!partRelief[id]) partRelief[id] = 0
      partRelief[id] += inches
    }

    // Subtract from qty_committed (clamped at 0)
    for (const [partId, inches] of Object.entries(partRelief)) {
      const parts = await sbQuery('parts', `id=eq.${partId}&select=qty_committed`)
      if (!Array.isArray(parts) || !parts[0]) continue
      const current = parseFloat(parts[0].qty_committed) || 0
      const newCommitted = Math.max(0, current - inches)
      await sbUpdate('parts', `id=eq.${partId}`, {
        qty_committed: Math.round(newCommitted * 100) / 100,
        updated_at:    new Date().toISOString(),
      })
    }

    await sbUpdate('epic_committed_fabric', `work_order=eq.${wo}&relieved=eq.false`, {
      relieved:      true,
      relieved_date: new Date().toISOString().slice(0, 10),
    })
    relievedRows += committed.length
  }

  if (failures.length > 0) {
    await sbInsert('match_failures', failures)
  }

  await sbInsert('epic_import_log', [{
    import_type:            'fabric_completed',
    records_total:          rows.length,
    records_new:            transactions.length,
    records_skipped:        skipped,
    records_auto_matched:   transactions.length,
    records_unmatched:      failures.length,
    records_relieved:       relievedRows,
    notes:                  `Released ${relievedRows} commitment lines across ${woTouched.size} work orders`,
  }])

  console.log(`  FABRIC_COMPLETED done: ${transactions.length} consume txns, ${partDeltas.size} fabrics decremented, ${relievedRows} commitment lines released`)
  return transactions.length
}


// ── Committed stock processor (shared) ───────────────────────────────────────
// Used by all three committed reports — scoped by stockClass and partType so
// each report only touches its own slice of parts and committed stock rows.
//
//   stockClass  partType     Report
//   ----------  ----------   -------------------------
//   RS PART     component    COMITTED STOCK (original)
//   FW          blind        FAUX COMMITTED
//   RS COMP     extrusion    COMMITTED EXTRUSIONS

async function processCommittedByClass(csvText, stockClass, partType, reportName, orderStatus = 'PRINTED') {
  const rows = parseCSV(csvText)
  console.log(`  ${reportName.toUpperCase()} [${orderStatus}]: ${rows.length} rows`)

  // Filter to this stock class only
  const classRows = rows.filter(r => (r.StockClass || '').trim() === stockClass)
  console.log(`  Rows matching stock class '${stockClass}': ${classRows.length}`)

  // FRESH SNAPSHOT — clear ONLY this status's unrelieved rows for this stock class.
  // We must NOT clear the other status's rows; both reports coexist in the same table.
  console.log(`  Clearing previous ${stockClass} / ${orderStatus} committed stock...`)
  await fetch(`${SUPABASE_URL}/rest/v1/epic_committed_stock?relieved=eq.false&stock_class=eq.${encodeURIComponent(stockClass)}&order_status=eq.${encodeURIComponent(orderStatus)}`, {
    method:  'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })

  // NOTE: do NOT zero out parts.qty_committed here. With two status feeds
  // writing into the same column, zeroing on each report would wipe the
  // other's contribution. Instead we recompute qty_committed from BOTH
  // statuses at the end of this function (see "Reconcile" block below).
  console.log(`  Snapshot cleared — importing fresh ${reportName} (${orderStatus}) data...`)

  // Load approved mappings for this part type
  const mappings = await sbQuery(
    'epic_part_mappings',
    `select=epic_description,wrangl_part_id,wrangl_part_name`
  )
  const mappingMap = {}
  if (Array.isArray(mappings)) {
    mappings.forEach(m => { mappingMap[m.epic_description.toLowerCase().trim()] = m })
  }

  // Load only parts of this type for fuzzy matching
  const allParts = await sbQuery('parts', `select=id,name&part_type=eq.${partType}&active=eq.true&limit=1000`)
  const partsList = Array.isArray(allParts) ? allParts : []
  console.log(`  Loaded ${partsList.length} ${partType} parts for matching`)

  const stats    = { new: 0, skipped: 0, auto_matched: 0, pending_review: 0, unmatched: 0 }
  const toCommit = {}

  for (const row of classRows) {
    const wo          = (row.WorkOrder || '').trim()
    const lineItem    = (row.LineItem || row.WorkOrder || '').trim()
    const stockCode   = (row.StockCode || '').trim()
    const description = (row.ComponentDescription || '').trim()
    const requiredQty = parseFloat(row.TotalRequiredQty || row.RequiredQty || 0) || 0
    // Printed reports use DatePrinted; Credit OK reports use DateEntered.
    // We record both — the relevant one per row, the other null.
    const datePrinted = (row.DatePrinted || '').trim().slice(0, 10) || null
    const dateEntered = (row.DateEntered || '').trim().slice(0, 10) || null
    const uom         = (row.UOM || '').trim()

    if (!wo || !lineItem || !description) continue

    stats.new++

    // Check approved mapping first
    let partId      = null
    let matchStatus = 'unmatched'
    let matchScore  = 0

    const descKey = description.toLowerCase().trim()
    if (mappingMap[descKey]) {
      partId      = mappingMap[descKey].wrangl_part_id
      matchStatus = 'auto_matched'
      matchScore  = 1.0
      stats.auto_matched++
    } else {
      // First try exact match with inch-mark (") stripped — handles ePIC vs Wrangl
      // naming difference where ePIC sends '24 X 48 ... 2 FW BLIND' and Wrangl
      // stores '24 X 48 ... 2" FW BLIND'.
      const normalizedDesc = description.replace(/"/g, '').toLowerCase().trim()
      let exactMatch = null
      for (const part of partsList) {
        const normalizedName = part.name.replace(/"/g, '').toLowerCase().trim()
        if (normalizedName === normalizedDesc) {
          exactMatch = part
          break
        }
      }

      if (exactMatch) {
        partId      = exactMatch.id
        matchStatus = 'auto_matched'
        matchScore  = 1.0
        stats.auto_matched++

        // Save mapping for future imports
        await sbUpsert('epic_part_mappings', [{
          epic_description: description,
          wrangl_part_id:   exactMatch.id,
          wrangl_part_name: exactMatch.name,
          approved_at:      new Date().toISOString(),
        }])
      } else {
        // Fall back to fuzzy match
        let bestScore = 0
        let bestPart  = null

        for (const part of partsList) {
          const score = stringSimilarity(description, part.name)
          if (score > bestScore) {
            bestScore = score
            bestPart  = part
          }
        }

        if (bestScore >= 0.95) {
          partId      = bestPart.id
          matchStatus = 'auto_matched'
          matchScore  = bestScore
          stats.auto_matched++

          await sbUpsert('epic_part_mappings', [{
            epic_description: description,
            wrangl_part_id:   bestPart.id,
            wrangl_part_name: bestPart.name,
            approved_at:      new Date().toISOString(),
          }])
        } else if (bestScore >= 0.85) {
          partId      = bestPart.id
          matchStatus = 'pending_review'
          matchScore  = bestScore
          stats.pending_review++
        } else {
          matchStatus = 'unmatched'
          matchScore  = bestScore
          stats.unmatched++
        }
      }
    }

    await sbInsert('epic_committed_stock', [{
      work_order:            wo,
      line_item:             lineItem,
      date_printed:          datePrinted,
      date_entered:          dateEntered,
      order_status:          orderStatus,
      stock_code:            stockCode,
      component_description: description,
      required_qty:          requiredQty,
      uom,
      stock_class:           stockClass,
      part_id:               partId,
      match_status:          matchStatus,
      match_score:           matchScore,
    }])

    if (matchStatus === 'auto_matched' && partId) {
      if (!toCommit[partId]) toCommit[partId] = 0
      toCommit[partId] += requiredQty
    }
  }

  // ── Reconcile parts.qty_committed across BOTH status feeds ───────────
  // We can't just write `qty_committed = qty` here, because the other status
  // feed (Printed or Credit OK) has its own commitments in the table. We
  // recompute from the table itself, summing all unrelieved rows for parts
  // of this part_type across both statuses.
  console.log(`  Reconciling parts.qty_committed for ${partType} across all statuses...`)
  const partIdsToReconcile = new Set(Object.keys(toCommit))
  // Also reconcile any parts that previously had commitments but no longer do
  // (e.g. a row that disappeared from the report). Fetch all parts that had
  // commitments under the OPPOSITE status too, since we don't know which.
  const otherStatusRows = await sbQuery(
    'epic_committed_stock',
    `select=part_id&stock_class=eq.${encodeURIComponent(stockClass)}&relieved=eq.false&part_id=not.is.null`
  )
  if (Array.isArray(otherStatusRows)) {
    for (const r of otherStatusRows) if (r.part_id) partIdsToReconcile.add(r.part_id)
  }
  // Also include parts whose qty_committed is currently > 0 but no longer in
  // the table at all (so we can zero them).
  const currentlyCommitted = await sbQuery(
    'parts',
    `select=id&part_type=eq.${partType}&active=eq.true&qty_committed=gt.0`
  )
  if (Array.isArray(currentlyCommitted)) {
    for (const p of currentlyCommitted) partIdsToReconcile.add(p.id)
  }

  // For each affected part, sum its committed qty across all statuses + relieved=false
  for (const partId of partIdsToReconcile) {
    const sumRes = await sbQuery(
      'epic_committed_stock',
      `select=required_qty&part_id=eq.${partId}&relieved=eq.false&stock_class=eq.${encodeURIComponent(stockClass)}`
    )
    const total = Array.isArray(sumRes)
      ? sumRes.reduce((acc, r) => acc + (parseFloat(r.required_qty) || 0), 0)
      : 0
    await sbUpdate('parts', `id=eq.${partId}`, {
      qty_committed: Math.round(total * 10000) / 10000,
      updated_at:    new Date().toISOString(),
    })
  }

  await sbInsert('epic_import_log', [{
    import_type:            orderStatus === 'CREDIT OK' ? `${reportName}_credit_ok` : reportName,
    records_total:          classRows.length,
    records_new:            stats.new,
    records_skipped:        stats.skipped,
    records_auto_matched:   stats.auto_matched,
    records_pending_review: stats.pending_review,
    records_unmatched:      stats.unmatched,
  }])

  console.log(`  ${reportName} [${orderStatus}] — new: ${stats.new}, auto: ${stats.auto_matched}, review: ${stats.pending_review}, unmatched: ${stats.unmatched}`)
  return stats.new
}

// COMITTED STOCK (original — RS PART components, one-M typo subject)
async function processCommittedStock(csvText) {
  return processCommittedByClass(csvText, 'RS PART', 'component', 'committed_stock')
}


// ── Inventory snapshot processor ─────────────────────────────────────────────
// Ingests the daily DAILY_INVENTORY_SNAPSHOT report from ePIC.
// This is the authoritative source for qty_on_hand and qty_committed
// for FW (faux blinds) ONLY.
//
// INTENTIONALLY SKIPPED stock classes:
//   RS FABRIC — fabric tracked independently in Wrangl (inconsistent ePIC units)
//   RS COMP   — extrusions tracked independently in Wrangl (bundles vs pcs)
//   RS PART   — components Wrangl-owned as of 2026-05-29 (PIC on-hand inaccurate);
//               driven by Wrangl PO receipts + PARTS SHIPPED consumption instead
//
// Match strategy (three-pass):
//   1. epic_stock_code exact match  — fastest, most reliable
//   2. vendor_part_number match     — catches parts where epic code differs from VPN
//   3. description name match       — fallback for anything not yet coded
// Unmatched rows land in match_failures for manual review.
//
// FW (faux blinds) are matched by name since vendor_part_number isn't
// systematically populated for blinds. Components use epic_stock_code first.
//
// After a successful snapshot, parts.qty_on_hand, qty_committed, and
// unit_cost are overwritten with ePIC's authoritative values for the
// matched part types. This eliminates event-replay drift.

// RS PART (components) moved to SKIP on 2026-05-29: PIC's component on-hand is
// not accurate, so Wrangl now owns component qty_on_hand via PO receipts +
// PARTS SHIPPED consumption. Snapshot is authoritative for FW (faux) only.
const SNAPSHOT_SKIP_CLASSES = new Set(['RS FABRIC', 'RS COMP', 'RS PART'])
const SNAPSHOT_WRITE_CLASSES = new Set(['FW'])

// Strip accents, normalize whitespace, uppercase — used for name-based fallback
function normalizeSnapName(s) {
  if (!s) return ''
  return s.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

async function processInventorySnapshot(csvText) {
  const rows = parseCSV(csvText)
  const today = new Date().toISOString().slice(0, 10)
  console.log(`  INVENTORY_SNAPSHOT: ${rows.length} rows for ${today}`)

  // Load all parts (active + inactive) — discontinued components still need authoritative
  // qty syncs from PIC so they don't pollute the unmatched-rows audit. Inactive parts are
  // already filtered out of every UI screen via active=true, so writing to them is invisible.
  const allPartsRes = await sbQuery(
    'parts',
    'select=id,name,part_type,epic_stock_code,vendor_part_number,qty_on_hand,qty_committed,active&limit=2000'
  )
  const allParts = Array.isArray(allPartsRes) ? allPartsRes : []

  // Build three lookup maps for the three-pass match strategy
  const byEpicCode = new Map()   // epic_stock_code.upper → part_id
  const byVpn      = new Map()   // vendor_part_number.upper → part_id
  const byName     = new Map()   // normalizeSnapName(name) → part_id

  for (const p of allParts) {
    const ec = (p.epic_stock_code   || '').trim().toUpperCase()
    const vp = (p.vendor_part_number|| '').trim().toUpperCase()
    const nm = normalizeSnapName(p.name)
    if (ec) byEpicCode.set(ec, p.id)
    if (vp) byVpn.set(vp, p.id)
    if (nm) byName.set(nm, p.id)
  }
  console.log(`  Loaded ${allParts.length} active parts (${byEpicCode.size} with epic_stock_code, ${byVpn.size} with vpn)`)

  const stats = {
    total: 0, skipped_class: 0,
    matched_code: 0, matched_vpn: 0, matched_name: 0, unmatched: 0,
  }
  const snapshotRows  = []
  const partUpdates   = {}
  const failures      = []

  for (const row of rows) {
    const stockCode  = (row.StockCode  || '').trim()
    const stockClass = (row.StockClass || '').trim()
    const desc       = (row.Description || '').trim()
    const qtyOnHand  = parseFloat(row.QtyOnHand   || 0) || 0
    const qtyCommit  = parseFloat(row.QtyCommitted || 0) || 0
    const qtyOnOrder = parseFloat(row.QtyOnOrder   || 0) || 0
    const qtyAvail   = parseFloat(row.QtyAvailable || 0) || 0
    const qtyBo      = parseFloat(row.QtyBackorder || 0) || 0
    const unitCost   = parseFloat(row.UnitCost     || 0) || null
    const lastActRaw = (row.LastActivityDate || '').trim().slice(0, 10)
    // Coerce "0000-00-00" (PIC's "never touched" sentinel) to null — Postgres rejects it
    const lastAct    = (!lastActRaw || lastActRaw === '0000-00-00') ? null : lastActRaw
    const warehouse  = (row.Warehouse || '').trim() || null

    stats.total++

    // Skip classes Wrangl maintains independently
    if (SNAPSHOT_SKIP_CLASSES.has(stockClass)) {
      stats.skipped_class++
      snapshotRows.push({
        stock_code:         stockCode,
        description:        desc,
        stock_class:        stockClass,
        qty_on_hand:        qtyOnHand,
        qty_committed:      qtyCommit,
        qty_on_order:       qtyOnOrder,
        qty_available:      qtyAvail,
        qty_backorder:      qtyBo,
        warehouse,
        unit_cost:          unitCost,
        last_activity_date: lastAct,
        snapshot_date:      today,
        part_id:            null,
        match_status:       'skipped',
      })
      continue
    }

    // Three-pass match for FW and RS PART
    let partId    = null
    let matchPass = null
    const codeUp  = stockCode.toUpperCase()
    const descUp  = normalizeSnapName(desc)

    if (byEpicCode.has(codeUp)) {
      partId = byEpicCode.get(codeUp)
      matchPass = 'epic_code'
      stats.matched_code++
    } else if (byVpn.has(codeUp)) {
      partId = byVpn.get(codeUp)
      matchPass = 'vpn'
      stats.matched_vpn++
    } else if (byName.has(descUp)) {
      partId = byName.get(descUp)
      matchPass = 'name'
      stats.matched_name++
    } else {
      stats.unmatched++
    }

    if (partId) {
      partUpdates[partId] = {
        qty_on_hand:        Math.round(qtyOnHand  * 10000) / 10000,
        qty_committed:      Math.round(qtyCommit  * 10000) / 10000,
        unit_cost:          unitCost,
        last_snapshot_sync: new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }
    } else if (SNAPSHOT_WRITE_CLASSES.has(stockClass)) {
      failures.push({
        source:       'inventory_snapshot',
        work_order:   null,
        stock_code:   stockCode,
        description:  desc,
        required_qty: qtyOnHand,
        uom:          null,
        stock_class:  stockClass,
        reason:       `No match found via epic_stock_code, vendor_part_number, or description name`,
      })
    }

    snapshotRows.push({
      stock_code:         stockCode,
      description:        desc,
      stock_class:        stockClass,
      qty_on_hand:        qtyOnHand,
      qty_committed:      qtyCommit,
      qty_on_order:       qtyOnOrder,
      qty_available:      qtyAvail,
      qty_backorder:      qtyBo,
      warehouse,
      unit_cost:          unitCost,
      last_activity_date: lastAct,
      snapshot_date:      today,
      part_id:            partId,
      match_status:       partId ? 'matched' : 'unmatched',
    })
  }

  // Upsert snapshot rows (idempotent by stock_code + snapshot_date)
  const BATCH = 200
  let storedOK = 0
  let storedFail = 0
  for (let i = 0; i < snapshotRows.length; i += BATCH) {
    const batch = snapshotRows.slice(i, i + BATCH)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/epic_inventory_snapshot`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    })
    if (res.ok) {
      storedOK += batch.length
    } else {
      storedFail += batch.length
      const errBody = await res.text().catch(() => '<unreadable>')
      console.error(`  ❌ SNAPSHOT INSERT FAILED — status: ${res.status}, batch starting at index ${i}`)
      console.error(`     Response body: ${errBody.slice(0, 600)}`)
      // Log first row of batch so we can see what shape was sent
      console.error(`     First row sample: ${JSON.stringify(batch[0]).slice(0, 500)}`)
    }
  }
  console.log(`  Snapshot rows stored: ${storedOK} ok, ${storedFail} failed (of ${snapshotRows.length})`)

  // Write authoritative balances to parts (FW + RS PART only)
  let partsUpdated = 0
  for (const [partId, updates] of Object.entries(partUpdates)) {
    await fetch(`${SUPABASE_URL}/rest/v1/parts?id=eq.${partId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(updates),
    })
    partsUpdated++
  }
  console.log(`  Parts updated: ${partsUpdated}`)

  if (failures.length > 0) {
    await sbInsert('match_failures', failures)
  }

  await sbInsert('epic_import_log', [{
    import_type:            'inventory_snapshot',
    records_total:          stats.total,
    records_new:            stats.matched + stats.unmatched,
    records_skipped:        stats.skipped_class,
    records_auto_matched:   stats.matched,
    records_unmatched:      stats.unmatched,
    notes: `Wrote ${partsUpdated} parts via code/vpn/name match. Skipped ${stats.skipped_class} (RS FABRIC+RS COMP+RS PART). ${failures.length} unmatched.`,
  }])

  console.log(`  INVENTORY_SNAPSHOT done — code: ${stats.matched_code}, vpn: ${stats.matched_vpn}, name: ${stats.matched_name}, unmatched: ${stats.unmatched}, skipped: ${stats.skipped_class}`)
  return stats.matched
}


// ── Open PO snapshot processor ───────────────────────────────────────────────
// Ingests the daily OPEN_PO_SNAPSHOT report from ePIC.
// Provides authoritative "qty on order" per part — fills the gap left by
// the inventory snapshot's QtyOnOrder column (which ePIC doesn't populate).
//
// Filter: only POs entered on or after 2026-04-01 (older POs are stale/noise).
// Skip: MISC stock codes and blank stock codes.
//
// After ingestion, aggregates qty_backorder per matched part and writes
// parts.qty_on_order so the reorder queue and dashboards reflect
// what's actually coming from Rollease and Yamausa.

const OPEN_PO_DATE_CUTOFF = '2026-04-01'

async function processOpenPOSnapshot(csvText) {
  const rows = parseCSV(csvText)
  const today = new Date().toISOString().slice(0, 10)
  console.log(`  OPEN_PO_SNAPSHOT: ${rows.length} rows for ${today}`)

  // Load all parts (active + inactive) — open POs for discontinued components still matter for visibility
  const allPartsRes = await sbQuery(
    'parts',
    'select=id,name,epic_stock_code,vendor_part_number,active&limit=2000'
  )
  const allParts = Array.isArray(allPartsRes) ? allPartsRes : []
  const stockToPartId = new Map()
  for (const p of allParts) {
    const ec = (p.epic_stock_code    || '').trim().toUpperCase()
    const vp = (p.vendor_part_number || '').trim().toUpperCase()
    const nm = normalizeSnapName(p.name)
    // Priority: epic_stock_code > vendor_part_number > name
    // All three map to the same part_id — last write wins per key but
    // since we only care about the lookup result, order doesn't matter
    if (ec) stockToPartId.set(ec, p.id)
    if (vp && !stockToPartId.has(vp)) stockToPartId.set(vp, p.id)
    if (nm && !stockToPartId.has(nm)) stockToPartId.set(nm, p.id)
  }

  // Wipe previous snapshot (fresh load every run)
  await fetch(`${SUPABASE_URL}/rest/v1/epic_open_pos?snapshot_date=neq.9999-01-01`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })

  const stats = { total: 0, before_cutoff: 0, skipped_misc: 0, matched: 0, unmatched: 0 }
  const poRows      = []
  const partOnOrder = {}  // part_id → total qty_backorder across all open PO lines

  for (const row of rows) {
    const poNumber    = (row.PONumber     || '').trim()
    const enteredDate = (row.EnteredDate  || '').trim().slice(0, 10)
    const stockCode   = (row.StockCode    || '').trim()
    const vendorNum   = (row.VendorNumber || '').trim()
    const vendorName  = (row.VendorName   || '').trim()
    const poStatus    = (row.POStatus     || '').trim()
    const lineNum     = parseInt(row.LineNumber || 0) || 0
    const itemDesc    = (row.ItemDescription || '').trim()
    const qtyOrdered  = parseFloat(row.QtyOrdered  || 0) || 0
    const qtyReceived = parseFloat(row.QtyReceived || 0) || 0
    const qtyBackord  = parseFloat(row.QtyBackorder || 0) || 0

    stats.total++

    // Date filter — discard pre-April 2026 POs
    if (enteredDate < OPEN_PO_DATE_CUTOFF) {
      stats.before_cutoff++
      continue
    }

    // Skip MISC and blank stock codes
    if (!stockCode || stockCode.toUpperCase() === 'MISC') {
      stats.skipped_misc++
      continue
    }

    const partId = stockToPartId.get(stockCode.toUpperCase()) || null
    if (partId) {
      stats.matched++
      if (!partOnOrder[partId]) partOnOrder[partId] = 0
      partOnOrder[partId] += qtyBackord
    } else {
      stats.unmatched++
    }

    poRows.push({
      po_number:        poNumber,
      vendor_number:    vendorNum,
      vendor_name:      vendorName,
      po_status:        poStatus,
      entered_date:     enteredDate || null,
      line_number:      lineNum,
      stock_code:       stockCode,
      item_description: itemDesc,
      qty_ordered:      qtyOrdered,
      qty_received:     qtyReceived,
      qty_backorder:    qtyBackord,
      part_id:          partId,
      match_status:     partId ? 'matched' : 'unmatched',
      snapshot_date:    today,
    })
  }

  // Insert fresh PO rows
  const BATCH = 200
  for (let i = 0; i < poRows.length; i += BATCH) {
    await sbInsert('epic_open_pos', poRows.slice(i, i + BATCH))
  }
  console.log(`  Open PO rows stored: ${poRows.length}`)

  // Update parts.qty_on_order from aggregated backorder quantities
  // First reset all to 0 for parts we track (FW + RS PART)
  await fetch(
    `${SUPABASE_URL}/rest/v1/parts?part_type=in.(blind,component)&active=eq.true`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ qty_on_order: 0, updated_at: new Date().toISOString() }),
    }
  )

  // Then write non-zero on-order quantities
  let onOrderUpdated = 0
  for (const [partId, qty] of Object.entries(partOnOrder)) {
    if (qty <= 0) continue
    await fetch(`${SUPABASE_URL}/rest/v1/parts?id=eq.${partId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        qty_on_order: Math.round(qty * 10000) / 10000,
        updated_at:   new Date().toISOString(),
      }),
    })
    onOrderUpdated++
  }
  console.log(`  parts.qty_on_order updated: ${onOrderUpdated} parts`)

  await sbInsert('epic_import_log', [{
    import_type:            'open_po_snapshot',
    records_total:          stats.total,
    records_new:            poRows.length,
    records_skipped:        stats.before_cutoff + stats.skipped_misc,
    records_auto_matched:   stats.matched,
    records_unmatched:      stats.unmatched,
    notes: `Cutoff ${OPEN_PO_DATE_CUTOFF}: kept ${poRows.length}, discarded ${stats.before_cutoff} pre-cutoff + ${stats.skipped_misc} MISC. Updated ${onOrderUpdated} parts.qty_on_order.`,
  }])

  console.log(`  OPEN_PO_SNAPSHOT done — kept: ${poRows.length}, discarded: ${stats.before_cutoff} (pre-cutoff) + ${stats.skipped_misc} (MISC), unmatched: ${stats.unmatched}`)
  return poRows.length
}


// ── REMAKES ────────────────────────────────────────────────────────────────────
// Parses the ePIC "ROLLER REMAKES" report and upserts into the `remakes` table.
// Keyed on remake_wo; uses merge-duplicates so re-imports refresh the ePIC-sourced
// fields without clobbering the human-entered fault_stage/fault_reason/notes.
//
// Report columns: RemakeWO, OriginalWO, RemakeDate, DateCreditOK, Customer,
//                 Sidemark, UnitCount, CustomerCharge, InternalCost, NetImpact,
//                 CostPerUnit
async function processRemakes(csvText) {
  const rows = parseCSV(csvText)
  if (!rows.length) { console.log('  REMAKES — no rows'); return 0 }

  // ePIC sends 0000-00-00 for an unset DateCreditOK → store as null.
  const cleanDate = (s) => {
    const v = (s || '').trim()
    if (!v || v.startsWith('0000')) return null
    return v
  }
  const num = (s) => {
    const n = parseFloat(String(s ?? '').replace(/[$,]/g, ''))
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null   // round to cents
  }

  const out = []
  for (const r of rows) {
    const remakeWo = (r.RemakeWO || '').trim()
    if (!remakeWo) continue   // skip blank/total rows

    const net = num(r.NetImpact)

    out.push({
      remake_wo:       remakeWo,
      original_wo:     (r.OriginalWO || '').trim() || null,
      product_line:    'roller',
      remake_date:     cleanDate(r.RemakeDate),
      date_credit_ok:  cleanDate(r.DateCreditOK),
      customer:        (r.Customer || '').trim() || null,
      sidemark:        (r.Sidemark || '').trim() || null,
      unit_count:      parseInt(r.UnitCount, 10) || null,
      customer_charge: num(r.CustomerCharge),
      internal_cost:   num(r.InternalCost),
      net_impact:      net,
      cost_per_unit:   num(r.CostPerUnit),
      // Auto-derived hint only — the human fault_reason is the source of truth,
      // and we deliberately DON'T send fault_stage/fault_reason/notes/reviewed_*
      // so merge-duplicates never overwrites what someone entered on the report page.
      fault_bucket:    net === null ? null : (net < 0 ? 'absorbed' : 'recovered'),
      updated_at:      new Date().toISOString(),
    })
  }

  if (!out.length) { console.log('  REMAKES — no valid rows'); return 0 }

  const ok = await sbUpsert('remakes', out)
  console.log(`  REMAKES — upserted ${out.length} rows (ok=${ok})`)
  return out.length
}


// ── PURCHASING ──────────────────────────────────────────────────────────────────
// Parses the ePIC "FACTORY PURCHASING DASHBOARD" report into purchasing_lines.
// Strategy: REPLACE-BY-PO — delete all existing lines for the PO numbers present
// in the file, then insert the file's lines fresh. Robust against ePIC line
// renumbering and removed lines. No human-entered fields, so wholesale replace
// is safe.
//
// Columns: VendorNumber, Vendor, PONumber, PODate, LineNo, StockCode,
//          Description, QtyOrdered, UnitCost, ExtendedCost
async function processPurchasing(csvText) {
  const rows = parseCSV(csvText)
  if (!rows.length) { console.log('  PURCHASING — no rows'); return 0 }

  const num = (s) => {
    const n = parseFloat(String(s ?? '').replace(/[$,]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  const cleanDate = (s) => {
    const v = (s || '').trim()
    if (!v || v.startsWith('0000')) return null
    return v
  }

  const out = []
  const poSet = new Set()
  for (const r of rows) {
    const po = (r.PONumber || '').trim()
    if (!po) continue
    poSet.add(po)
    out.push({
      vendor_number: (r.VendorNumber || '').trim() || null,
      vendor:        (r.Vendor || '').trim() || null,
      po_number:     po,
      po_date:       cleanDate(r.PODate),
      line_no:       parseInt(r.LineNo, 10) || null,
      stock_code:    (r.StockCode || '').trim() || null,
      description:   (r.Description || '').trim() || null,
      qty_ordered:   num(r.QtyOrdered),
      unit_cost:     num(r.UnitCost),
      extended_cost: num(r.ExtendedCost),
    })
  }

  if (!out.length) { console.log('  PURCHASING — no valid rows'); return 0 }

  // Replace-by-PO: clear existing lines for these POs, then insert fresh.
  // PostgREST in-filter: po_number=in.("205644","205645",...)
  const poList = [...poSet]
  // Chunk the delete to keep the URL length sane.
  for (let i = 0; i < poList.length; i += 50) {
    const chunk = poList.slice(i, i + 50)
    const inClause = chunk.map(p => `"${p.replace(/"/g, '')}"`).join(',')
    await sbDelete('purchasing_lines', `po_number=in.(${inClause})`)
  }

  // Insert in batches.
  for (let i = 0; i < out.length; i += 200) {
    await sbInsert('purchasing_lines', out.slice(i, i + 200))
  }

  console.log(`  PURCHASING — replaced ${poList.length} POs, inserted ${out.length} lines`)
  return out.length
}


// ── DAILY SHIPMENTS ─────────────────────────────────────────────────────────────
// Parses the ePIC daily shipment summary (roller + forthcoming faux) into
// daily_shipments. One row per (product_line, ship_date). Upserts on the
// composite PK so the report re-sending the current week's days just refreshes
// them. Product line is passed in by the router based on the report subject.
//
// Columns: ShipDate, DayOfWeek, UnitsFullyShipped, RevenueFullyShipped
async function processDailyShipments(csvText, productLine) {
  const rows = parseCSV(csvText)
  if (!rows.length) { console.log('  DAILY SHIPMENTS — no rows'); return 0 }

  const num = (s) => {
    const n = parseFloat(String(s ?? '').replace(/[$,]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  const cleanDate = (s) => {
    const v = (s || '').trim()
    if (!v || v.startsWith('0000')) return null
    return v
  }

  const out = []
  for (const r of rows) {
    const date = cleanDate(r.ShipDate)
    if (!date) continue
    out.push({
      product_line:    productLine,
      ship_date:       date,
      day_of_week:     (r.DayOfWeek || '').trim() || null,
      units_shipped:   parseInt(r.UnitsFullyShipped, 10) || 0,
      revenue_shipped: Math.round(num(r.RevenueFullyShipped) * 100) / 100,
      updated_at:      new Date().toISOString(),
    })
  }

  if (!out.length) { console.log('  DAILY SHIPMENTS — no valid rows'); return 0 }

  const ok = await sbUpsert('daily_shipments', out)
  console.log(`  DAILY SHIPMENTS (${productLine}) — upserted ${out.length} day rows (ok=${ok})`)
  return out.length
}


// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async function(event, context) {
  console.log('\n🤠 Berkely Wrangl — ePIC Report Processor')
  console.log('─'.repeat(40))

  try {
    const token    = await getAccessToken()
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

      function findCsvAttachment(parts) {
        for (const part of parts) {
          if (part.filename?.endsWith('.csv') || part.mimeType === 'text/csv' || (part.mimeType === 'application/octet-stream' && part.filename?.endsWith('.csv'))) {
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

        // ── DEPRECATED reports (folded into MASTER SALES REPORT; ePIC
        // subscriptions turned off 2026-05-29) ────────────────────────────────
        // Their handlers have been removed. This block stays as a
        // belt-and-suspenders catch so any straggler emails get acknowledged
        // (marked processed) but not acted on.
        const DEPRECATED_SUBJECTS = [
          'ROLLER SHADE FULL SHIP',
          'FAUX FULL SHIP',
          'ROLLER SHADE PRINTED',
          'FAUX PRINTED',
          'PRINTED ORDERS',
          'ROLLER SHADE WIP',
          'CREDIT HOLD/OK ORDERS',
          'CREDIT OK ORDERS',
          'CREDIT HOLD',
        ]
        const matchedDeprecated = DEPRECATED_SUBJECTS.find(s => subject.includes(s))
        if (matchedDeprecated) {
          console.log(`  ⊘ Deprecated subject — skipped (folded into MASTER SALES REPORT): ${matchedDeprecated}`)
          await markProcessed(messageId, 'deprecated_skipped', 0)
          results.skipped++
          continue
        }

        if (subject.includes('DAILY SHIPMENT')) {
          // ROLLERSHADE / FAUX DAILY SHIPMENT SUMMARY → daily_shipments.
          // Product line inferred from subject (default roller).
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          const pl = subject.includes('FAUX') ? 'faux' : 'roller'
          count = await processDailyShipments(csvText, pl)
          await markProcessed(messageId, `daily_shipments_${pl}`, count)
          results.processed++

        } else if (subject.includes('REMAKE')) {
          // ROLLER REMAKES report → upsert into remakes table (keyed on remake_wo).
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processRemakes(csvText)
          await markProcessed(messageId, 'remakes', count)
          results.processed++

        } else if (subject.includes('PURCHASING')) {
          // FACTORY PURCHASING DASHBOARD → replace-by-PO into purchasing_lines.
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processPurchasing(csvText)
          await markProcessed(messageId, 'purchasing', count)
          results.processed++

        } else if (subject.includes('FAUX COMMITTED')) {
          // Faux wood committed stock (FW stock class → blind parts)
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCommittedByClass(csvText, 'FW', 'blind', 'committed_faux')
          await markProcessed(messageId, 'committed_faux', count)
          results.processed++

        } else if (subject.includes('ROLLER SHADE INVOICE BY PRODUCT')) {
          // Roller product-line sales → roller_product_breakdown (read by ExecutiveHome).
          // Report always carries a CSV; no inline fallback.
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processRollerSalesCSV(csvText)
          await markProcessed(messageId, 'roller_sales', count)
          results.processed++

        } else if (subject.includes('COMBINED ROLLER') || subject.includes('COMBINED ROLLER/FAUX')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCombinedCSV(csvText)
          await markProcessed(messageId, 'combined_report', count)
          results.processed++

        } else if (subject.includes('QUOTE DETAIL') || subject.includes('QUOTE_DETAIL')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processQuoteDetail(csvText)
          await markProcessed(messageId, 'quote_detail', count)
          results.processed++

        } else if (subject.includes('MASTER SALES REPORT')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processMasterSalesReport(csvText)
          await markProcessed(messageId, 'master_sales_report', count)
          results.processed++

        } else if (subject.includes('SALES REPORT')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processSalesReport(csvText)
          await markProcessed(messageId, 'sales_report', count)
          results.processed++

        } else if (subject.includes('ROLLER PARTS/EXTRUSIONS SHIPPED') || subject.includes('PARTS SHIPPED') || subject.includes('PARTS_SHIPPED')) {
          // Daily roller parts + extrusions consumption sync
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processPartsShipped(csvText, 'parts_shipped')
          await markProcessed(messageId, 'parts_shipped', count)
          results.processed++

        } else if (subject.includes('FAUX SHIPPED') || subject.includes('FAUX_SHIPPED')) {
          // Daily faux blind consumption sync
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processPartsShipped(csvText, 'faux_shipped')
          await markProcessed(messageId, 'faux_shipped', count)
          results.processed++

        } else if (subject.includes('COMMITTED EXTRUSIONS')) {
          // ── NEW: Extrusion committed stock (RS COMP stock class → extrusion parts)
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCommittedByClass(csvText, 'RS COMP', 'extrusion', 'committed_extrusions')
          await markProcessed(messageId, 'committed_extrusions', count)
          results.processed++

        } else if (subject.includes('COMMITTED STOCK CREDIT OK')) {
          // Credit OK committed stock — same stock class as Printed (RS PART)
          // but the orders are earlier in the pipeline (not yet printed).
          // Placed BEFORE the Printed route below since this is the more
          // specific match. The Printed route's subject has a one-M typo
          // ('COMITTED'), so the two don't overlap, but being explicit.
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCommittedByClass(csvText, 'RS PART', 'component', 'committed_stock', 'CREDIT OK')
          await markProcessed(messageId, 'committed_stock_credit_ok', count)
          results.processed++

        } else if (subject.includes('COMMITTED FARBIC CREDIT OK')) {
          // Credit OK committed fabric. Note "FARBIC" — that's the actual PIC
          // subject typo, carried forward verbatim. (Separate from the
          // Printed route's correct "COMMITTED FABRIC" spelling — distinct
          // strings, no collision.)
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCommittedFabric(csvText, 'CREDIT OK')
          await markProcessed(messageId, 'committed_fabric_credit_ok', count)
          results.processed++

        } else if (subject.includes('COMITTED STOCK')) {
          // Original committed stock handler (note one-M typo in subject)
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCommittedStock(csvText)
          await markProcessed(messageId, 'committed_stock', count)
          results.processed++

        } else if (subject.includes('COMMITTED FABRIC') || subject.includes('COMMITTED_FABRIC')) {
          // Fabric commitments — fabric reserved when BOM is printed
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCommittedFabric(csvText)
          await markProcessed(messageId, 'committed_fabric', count)
          results.processed++

        } else if (subject.includes('FABRIC COMPLETED') || subject.includes('FABRIC_COMPLETED')) {
          // Fabric consumption — fabric actually used when order ships
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processFabricCompleted(csvText)
          await markProcessed(messageId, 'fabric_completed', count)
          results.processed++

        } else if (subject.includes('DAILY INVENTORY SNAPSHOT') || subject.includes('DAILY_INVENTORY_SNAPSHOT')) {
          // Authoritative daily inventory snapshot — overwrites qty_on_hand + qty_committed
          // for FW only. Skips RS FABRIC, RS COMP, and RS PART (Wrangl maintains independently).
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processInventorySnapshot(csvText)
          await markProcessed(messageId, 'inventory_snapshot', count)
          results.processed++

        } else if (subject.includes('OPEN PO SNAPSHOT') || subject.includes('OPEN_PO_SNAPSHOT')) {
          // Daily open PO snapshot — populates epic_open_pos and parts.qty_on_order.
          // Only POs entered on or after 2026-04-01 are ingested.
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processOpenPOSnapshot(csvText)
          await markProcessed(messageId, 'open_po_snapshot', count)
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
