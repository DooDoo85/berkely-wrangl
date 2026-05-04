// Berkely Wrangl — ePIC Report Processor
// Netlify scheduled function — runs every 15 minutes
// Reads Gmail, processes ePIC CSV reports, updates Wrangl Supabase
//
// Reports handled:
//   BERKELY ROLLER SHADE FULL SHIP  → orders.status = 'invoiced', roller_shipments_daily, inventory relief
//   BERKELY FAUX FULL SHIP          → orders.status = 'invoiced'
//   BEREKLY FAUX FULL SHIP          → orders.status = 'invoiced' (typo variant)
//   BERKELY ROLLER SHADE PRINTED    → orders.status = 'printed'
//   BERKELY FAUX PRINTED            → orders.status = 'printed'
//   ROLLER SHADE INVOICE BY PRODUCT → product_line_sales (Roller Shades)
//   COMBINED ROLLER/FAUX            → product_line_sales (both lines)
//   COMITTED STOCK                  → epic_committed_stock, qty_committed on parts (RS PART only)
//   COMMITTED EXTRUSIONS            → epic_committed_stock, qty_committed on extrusion parts (RS COMP)
//   FAUX COMMITTED                  → epic_committed_stock, qty_committed on blind parts (FW)

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

  await relieveCommittedForShippedOrders(rows)
  return updated
}

async function relieveCommittedForShippedOrders(rows) {
  const woNumbers = [...new Set(rows.map(r => (r.OrderNo || r.Wo || '').trim()).filter(Boolean))]
  if (!woNumbers.length) return

  console.log(`  Relieving committed stock for ${woNumbers.length} shipped work orders`)
  let relieved = 0

  for (const wo of woNumbers) {
    const committedLines = await sbQuery(
      'epic_committed_stock',
      `work_order=eq.${wo}&relieved=eq.false&part_id=not.is.null&select=id,part_id,required_qty`
    )
    if (!Array.isArray(committedLines) || !committedLines.length) continue

    const partTotals = {}
    for (const line of committedLines) {
      if (!partTotals[line.part_id]) partTotals[line.part_id] = 0
      partTotals[line.part_id] += parseFloat(line.required_qty || 0)
    }

    for (const [partId, qty] of Object.entries(partTotals)) {
      const parts = await sbQuery('parts', `id=eq.${partId}&select=qty_on_hand,qty_committed`)
      if (!Array.isArray(parts) || !parts[0]) continue
      const part = parts[0]
      const newOnHand    = Math.max(0, (parseFloat(part.qty_on_hand) || 0) - qty)
      const newCommitted = Math.max(0, (parseFloat(part.qty_committed) || 0) - qty)
      await sbUpdate('parts', `id=eq.${partId}`, {
        qty_on_hand:    newOnHand,
        qty_committed:  newCommitted,
        updated_at:     new Date().toISOString(),
      })
    }

    await sbUpdate('epic_committed_stock', `work_order=eq.${wo}&relieved=eq.false`, {
      relieved:      true,
      relieved_date: new Date().toISOString().slice(0, 10),
    })
    relieved += committedLines.length
  }

  console.log(`  Relieved ${relieved} committed stock lines`)
}

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

async function processRollerWIP(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  ROLLER SHADE WIP: ${rows.length} rows`)

  await fetch(`${SUPABASE_URL}/rest/v1/roller_wip?id=neq.00000000-0000-0000-0000-000000000000`, {
    method:  'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
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

  const creditOK     = toInsert.filter(r => r.order_status === 'CREDIT OK')
  const printed      = toInsert.filter(r => r.order_status === 'PRINTED')
  const creditUnits  = creditOK.reduce((s, r) => s + r.total_units, 0)
  const printedUnits = printed.reduce((s, r) => s + r.total_units, 0)
  console.log(`  WIP loaded — Credit OK: ${creditOK.length} orders / ${creditUnits} units | Printed: ${printed.length} orders / ${printedUnits} units`)
  return toInsert.length
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

async function processCreditOk(csvText) {
  const rows = parseCSV(csvText)
  console.log(`  CREDIT HOLD/OK ORDERS: ${rows.length} rows total`)

  await fetch(`${SUPABASE_URL}/rest/v1/credit_ok_orders?order_no=neq.__never__`, {
    method:  'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })

  const toInsert = []
  for (const row of rows) {
    const status = (row.OrderStatus || '').trim().toUpperCase()
    if (status !== 'CREDIT OK') continue

    const orderNo = (row.OrderNo || '').trim()
    if (!orderNo) continue

    toInsert.push({
      order_no:      orderNo,
      salesperson:   (row.Salesperson || '').trim(),
      customer_name: (row.CustomerName || '').trim(),
      order_amount:  parseCurrency(row.OrderAmount || 0),
      entered_date:  row.EnteredDate || null,
      order_status:  'CREDIT OK',
      imported_at:   new Date().toISOString(),
    })
  }

  if (toInsert.length) await sbUpsert('credit_ok_orders', toInsert)

  const totalAmount = toInsert.reduce((s, r) => s + r.order_amount, 0)
  console.log(`  Credit OK loaded: ${toInsert.length} orders / $${totalAmount.toFixed(2)}`)
  return toInsert.length
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

async function processCommittedByClass(csvText, stockClass, partType, reportName) {
  const rows = parseCSV(csvText)
  console.log(`  ${reportName.toUpperCase()}: ${rows.length} rows`)

  // Filter to this stock class only
  const classRows = rows.filter(r => (r.StockClass || '').trim() === stockClass)
  console.log(`  Rows matching stock class '${stockClass}': ${classRows.length}`)

  // FRESH SNAPSHOT — clear only unrelieved rows for this stock class
  console.log(`  Clearing previous ${stockClass} committed stock...`)
  await fetch(`${SUPABASE_URL}/rest/v1/epic_committed_stock?relieved=eq.false&stock_class=eq.${encodeURIComponent(stockClass)}`, {
    method:  'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })

  // Reset qty_committed only for this part type
  await sbUpdate('parts', `part_type=eq.${partType}&active=eq.true`, {
    qty_committed: 0,
    updated_at:    new Date().toISOString(),
  })
  console.log(`  Snapshot cleared — importing fresh ${reportName} data...`)

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
    const datePrinted = (row.DatePrinted || '').trim().slice(0, 10) || null
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
      // Fuzzy match against this part type's parts only
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

        // Save mapping for future imports
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

    await sbInsert('epic_committed_stock', [{
      work_order:            wo,
      line_item:             lineItem,
      date_printed:          datePrinted,
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

  // Update qty_committed on matched parts
  for (const [partId, qty] of Object.entries(toCommit)) {
    await sbUpdate('parts', `id=eq.${partId}`, {
      qty_committed: qty,
      updated_at:    new Date().toISOString(),
    })
  }

  await sbInsert('epic_import_log', [{
    import_type:            reportName,
    records_total:          classRows.length,
    records_new:            stats.new,
    records_skipped:        stats.skipped,
    records_auto_matched:   stats.auto_matched,
    records_pending_review: stats.pending_review,
    records_unmatched:      stats.unmatched,
  }])

  console.log(`  ${reportName} — new: ${stats.new}, auto: ${stats.auto_matched}, review: ${stats.pending_review}, unmatched: ${stats.unmatched}`)
  return stats.new
}

// COMITTED STOCK (original — RS PART components, one-M typo subject)
async function processCommittedStock(csvText) {
  return processCommittedByClass(csvText, 'RS PART', 'component', 'committed_stock')
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

        if (subject.includes('ROLLER SHADE FULL SHIP')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processFullShip(csvText, 'roller')
          await markProcessed(messageId, 'roller_full_ship', count)
          results.processed++

        } else if (subject.includes('FAUX FULL SHIP')) {
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

        } else if (subject.includes('FAUX COMMITTED')) {
          // ── NEW: Faux wood committed stock (FW stock class → blind parts)
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCommittedByClass(csvText, 'FW', 'blind', 'committed_faux')
          await markProcessed(messageId, 'committed_faux', count)
          results.processed++

        } else if (subject.includes('FAUX PRINTED')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processPrinted(csvText, 'faux')
          await markProcessed(messageId, 'faux_printed', count)
          results.processed++

        } else if (subject.includes('ROLLER SHADE INVOICE BY PRODUCT')) {
          if (hasCSV) {
            const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
            count = await processRollerSalesCSV(csvText)
          } else {
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

        } else if (subject.includes('SALES REPORT')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processSalesReport(csvText)
          await markProcessed(messageId, 'sales_report', count)
          results.processed++

        } else if (subject.includes('CREDIT HOLD/OK ORDERS') || subject.includes('CREDIT HOLD') || subject.includes('CREDIT OK ORDERS')) {
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCreditOk(csvText)
          await markProcessed(messageId, 'credit_ok_orders', count)
          results.processed++

        } else if (subject.includes('COMMITTED EXTRUSIONS')) {
          // ── NEW: Extrusion committed stock (RS COMP stock class → extrusion parts)
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCommittedByClass(csvText, 'RS COMP', 'extrusion', 'committed_extrusions')
          await markProcessed(messageId, 'committed_extrusions', count)
          results.processed++

        } else if (subject.includes('COMITTED STOCK')) {
          // Original committed stock handler (note one-M typo in subject)
          if (!hasCSV) { console.log('  No CSV attachment'); continue }
          const csvText = await gmailGetAttachment(token, messageId, att.body.attachmentId)
          count = await processCommittedStock(csvText)
          await markProcessed(messageId, 'committed_stock', count)
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
