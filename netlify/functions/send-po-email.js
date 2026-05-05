// Netlify function: send-po-email
// Generates a PO PDF and emails it to a vendor via Resend.
// Caller must be authenticated.

const SUPABASE_URL          = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const SUPABASE_ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY
const RESEND_API_KEY        = process.env.RESEND_API_KEY
const FROM_EMAIL            = process.env.WRANGL_FROM_EMAIL || 'Wrangl <noreply@berkelydistribution.com>'
const REPLY_TO_EMAIL        = process.env.WRANGL_REPLY_TO || 'parker@berkelydistribution.com'

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify(body),
  }
}

async function verifyUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, error: 'Missing auth token' }
  }
  const token = authHeader.replace('Bearer ', '')
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!userRes.ok) return { ok: false, error: 'Invalid token' }
  const user = await userRes.json()
  return { ok: true, user }
}

async function adminFetch(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  })
  return res.json()
}

function escapeHtml(s) {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function fmtMoney(n) {
  if (!n) return '$0.00'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildEmailHtml({ po, items, vendorName, totalValue, senderName }) {
  const itemRows = items.map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;color:#666">${escapeHtml(item.stock_number || '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(item.part_name)}${item.note ? `<div style="font-size:11px;color:#888;margin-top:2px">${escapeHtml(item.note)}</div>` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.qty_ordered}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmtMoney(item.unit_cost)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmtMoney((item.qty_ordered || 0) * (item.unit_cost || 0))}</td>
    </tr>
  `).join('')

  return `
    <!DOCTYPE html>
    <html>
      <body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#333;max-width:680px;margin:0 auto;padding:24px;background:#fafafa">
        <div style="background:white;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
          <div style="border-bottom:2px solid #5a3a24;padding-bottom:16px;margin-bottom:24px">
            <h1 style="font-size:24px;margin:0;color:#261810">Berkely Distribution</h1>
            <p style="margin:4px 0 0;color:#888;font-size:13px">6951 Virginia Parkway, Suite 301 · McKinney, TX 75071</p>
          </div>

          <div style="display:flex;justify-content:space-between;margin-bottom:24px">
            <div>
              <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;font-weight:bold">Purchase Order</div>
              <div style="font-size:22px;font-weight:bold;color:#261810;margin-top:4px">${escapeHtml(po.wrangl_po_number)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;font-weight:bold">Date</div>
              <div style="font-size:14px;color:#261810;margin-top:4px">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>
          </div>

          <div style="background:#f5f1ea;border-radius:8px;padding:16px;margin-bottom:24px">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;font-weight:bold;margin-bottom:6px">Vendor</div>
            <div style="font-size:16px;font-weight:600;color:#261810">${escapeHtml(vendorName)}</div>
          </div>

          <h3 style="font-size:14px;color:#261810;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px">Items Ordered</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:#f5f1ea">
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:bold">Stock #</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:bold">Description</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:bold">Qty</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:bold">Unit Cost</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:bold">Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr style="background:#fafafa">
                <td colspan="4" style="padding:12px;text-align:right;font-weight:bold;color:#261810;text-transform:uppercase;font-size:11px;letter-spacing:1px">Total Estimated Value</td>
                <td style="padding:12px;text-align:right;font-weight:bold;font-size:16px;color:#5a3a24">${fmtMoney(totalValue)}</td>
              </tr>
            </tfoot>
          </table>

          ${po.notes ? `
            <div style="margin-top:24px;padding:12px;background:#fef3e2;border-left:3px solid #d4aa70;border-radius:4px">
              <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;font-weight:bold;margin-bottom:4px">Notes</div>
              <div style="font-size:13px;color:#666">${escapeHtml(po.notes)}</div>
            </div>
          ` : ''}

          <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee">
            <p style="font-size:14px;color:#444;line-height:1.6;margin:0">
              Please confirm receipt of this purchase order by replying to this email with your acknowledgment, expected ship date, and tracking information when available.
            </p>
            <p style="font-size:13px;color:#888;margin-top:16px">
              Thanks,<br>
              <strong style="color:#444">${escapeHtml(senderName)}</strong><br>
              Berkely Distribution
            </p>
          </div>
        </div>
        <p style="text-align:center;color:#aaa;font-size:11px;margin-top:16px">
          This PO was sent from Berkely Wrangl
        </p>
      </body>
    </html>
  `
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {})
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  if (!RESEND_API_KEY) return jsonResponse(500, { error: 'RESEND_API_KEY not configured' })

  const auth = await verifyUser(event.headers.authorization || event.headers.Authorization)
  if (!auth.ok) return jsonResponse(403, { error: auth.error })

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' })
  }

  const { po_id, vendor_email } = body
  if (!po_id || !vendor_email) return jsonResponse(400, { error: 'po_id and vendor_email required' })

  try {
    const po = await adminFetch(`/rest/v1/purchase_orders?id=eq.${po_id}&select=*`)
    if (!po?.[0]) return jsonResponse(404, { error: 'PO not found' })
    const poData = po[0]

    const items = await adminFetch(`/rest/v1/purchase_order_items?po_id=eq.${po_id}&select=*&order=created_at`)
    if (!items || items.length === 0) return jsonResponse(400, { error: 'PO has no items' })

    // Get sender name from caller's profile
    const profile = await adminFetch(`/rest/v1/profiles?id=eq.${auth.user.id}&select=full_name,email`)
    const senderName = profile?.[0]?.full_name || profile?.[0]?.email || 'Berkely Distribution'

    const totalValue = items.reduce((s, i) => s + ((i.qty_ordered || 0) * (i.unit_cost || 0)), 0)

    const html = buildEmailHtml({
      po:         poData,
      items,
      vendorName: poData.vendor_name,
      totalValue,
      senderName,
    })

    const subject = `Purchase Order ${poData.wrangl_po_number} from Berkely Distribution`

    // Send via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [vendor_email],
        reply_to: REPLY_TO_EMAIL,
        cc: [profile?.[0]?.email].filter(Boolean),
        subject,
        html,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return jsonResponse(500, { error: data?.message || data?.name || `Resend error (${res.status})` })

    return jsonResponse(200, { ok: true, email_id: data.id, sent_to: vendor_email })
  } catch (err) {
    return jsonResponse(500, { error: err.message })
  }
}
