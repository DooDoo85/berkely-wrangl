// Berkely Wrangl — Send Order to ePIC
// Called when a Wrangl order is submitted
// Sends formatted email to EPIC_ENTRY_EMAIL for manual ePIC entry

const RESEND_API_KEY   = process.env.RESEND_API_KEY
const FROM_EMAIL       = process.env.FROM_EMAIL || 'noreply@berkelydistribution.com'
const EPIC_ENTRY_EMAIL = process.env.EPIC_ENTRY_EMAIL || 'david@berkelydistribution.com'

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  try {
    const { order, items, repEmail, repName } = JSON.parse(event.body)
    if (!order) return { statusCode: 400, body: 'Missing order data' }

    // Build line items HTML
    const itemsHtml = items && items.length > 0
      ? items.map((item, i) => `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${i + 1}</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;">
            <strong>${item.group_name || ''}</strong><br/>
            ${item.product_name || ''}
            ${item.notes ? `<br/><span style="color:#6b7280;font-size:12px;">${item.notes}</span>` : ''}
          </td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">
            ${item.width_inches && item.height_inches ? `${item.width_inches}" × ${item.height_inches}"` : '—'}
          </td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${item.quantity || 1}</td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">
            ${item.unit_price ? '$' + Number(item.unit_price).toFixed(2) : '—'}
          </td>
          <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#111827;text-align:right;">
            ${item.line_total ? '$' + Number(item.line_total).toFixed(2) : '—'}
          </td>
        </tr>`).join('')
      : `<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No line items — see notes</td></tr>`

    const subtotal = order.subtotal
      ? '$' + Number(order.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2 })
      : '—'

    const orderDate = order.order_date
      ? new Date(order.order_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '—'

    const shipDate = order.requested_ship_date
      ? new Date(order.requested_ship_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '—'

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f6f8;">
<div style="max-width:680px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:#1C2B1E;padding:24px 32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#C9943A;margin-bottom:6px;">BERKELY WRANGL</div>
    <div style="font-size:22px;font-weight:800;color:white;">New Order — Enter in ePIC</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">
      Submitted by ${repName || 'Sales Rep'} · ${orderDate}
    </div>
  </div>

  <!-- Order Info -->
  <div style="padding:24px 32px;border-bottom:1px solid #f3f4f6;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0;width:50%;vertical-align:top;">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Customer</div>
          <div style="font-size:15px;font-weight:700;color:#111827;">${order.customer_name || '—'}</div>
        </td>
        <td style="padding:8px 0;width:50%;vertical-align:top;">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Sidemark</div>
          <div style="font-size:15px;font-weight:700;color:#111827;">${order.sidemark || '—'}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;vertical-align:top;">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">PO Number</div>
          <div style="font-size:14px;color:#374151;">${order.po_number || '—'}</div>
        </td>
        <td style="padding:8px 0;vertical-align:top;">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Requested Ship Date</div>
          <div style="font-size:14px;color:#374151;">${shipDate}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;vertical-align:top;">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Ship Via</div>
          <div style="font-size:14px;color:#374151;">${order.ship_via || '—'}</div>
        </td>
        <td style="padding:8px 0;vertical-align:top;">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Sales Rep</div>
          <div style="font-size:14px;color:#374151;">${order.sales_rep || repName || '—'}</div>
        </td>
      </tr>
    </table>
    ${order.notes ? `
    <div style="margin-top:12px;padding:12px;background:#f9fafb;border-radius:8px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Notes</div>
      <div style="font-size:13px;color:#374151;">${order.notes}</div>
    </div>` : ''}
  </div>

  <!-- Line Items -->
  <div style="padding:24px 32px;border-bottom:1px solid #f3f4f6;">
    <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;margin-bottom:16px;">Line Items</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">#</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Product</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Size</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Unit</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot>
        <tr style="background:#f9fafb;border-top:2px solid #e5e7eb;">
          <td colspan="5" style="padding:12px;text-align:right;font-size:13px;font-weight:700;color:#374151;">Order Total</td>
          <td style="padding:12px;text-align:right;font-size:15px;font-weight:800;color:#111827;">${subtotal}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:20px 32px;background:#f9fafb;">
    <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
      This order was created in <strong>Berkely Wrangl</strong> and needs to be entered in ePIC.
      Reply to this email to reach ${repName || 'the sales rep'} at ${repEmail || ''}.
    </div>
  </div>

</div>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:     FROM_EMAIL,
        to:       [EPIC_ENTRY_EMAIL],
        reply_to: repEmail || FROM_EMAIL,
        subject:  `New Order — ${order.customer_name || 'Unknown Customer'} | ${order.sidemark || order.order_number}`,
        html,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Resend error')

    console.log(`✅ Order email sent to ${EPIC_ENTRY_EMAIL} — Order #${order.order_number}`)
    return { statusCode: 200, body: JSON.stringify({ success: true, id: data.id }) }

  } catch (err) {
    console.error('send-order-to-epic error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
