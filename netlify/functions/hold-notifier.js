// hold-notifier.js
// Runs daily at 9am — checks for orders on hold >= 5 days and emails the sales rep

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY

// Rep email lookup
const REP_EMAILS = {
  'christian heffernan': 'christian@berkelydistribution.com',
  'jt d\'emidio':        'jt@berkelydistribution.com',
  'jt demidio':          'jt@berkelydistribution.com',
  'abigail davis':       'abigail@berkelydistribution.com',
  'pete boleneus':       'pete.blinds@gmail.com',
  'kevin kimble':        'kevindkimble@gmail.com',
  'parker boleneus':     'parker@berkelydistribution.com',
  'ryan fritz':          'ryan@did-g2.com',
}

function getRepEmail(salesRep) {
  if (!salesRep) return null
  return REP_EMAILS[salesRep.toLowerCase().trim()] || null
}

function daysSince(dateStr) {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

async function sbQuery(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  })
  return res.json()
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Berkely Wrangl <noreply@berkelydistribution.com>',
      to:      [to],
      subject,
      html,
    }),
  })
  return res.json()
}

exports.handler = async function() {
  console.log('\n🔔 Berkely Wrangl — Hold Notifier')
  console.log('─'.repeat(40))

  try {
    // Get all orders on hold
    const orders = await sbQuery('orders',
      'status=eq.on_hold&select=id,order_number,customer_name,sidemark,sales_rep,hold_reason,hold_note,hold_started_at,part_expected_date,expected_ship_date'
    )

    if (!Array.isArray(orders) || orders.length === 0) {
      console.log('No orders on hold.')
      return { statusCode: 200, body: 'No holds to notify' }
    }

    let notified = 0
    let skipped = 0

    for (const order of orders) {
      const days = daysSince(order.hold_started_at)

      // Only notify at exactly 5 days (not every day after)
      if (days !== 5) {
        skipped++
        continue
      }

      const repEmail = getRepEmail(order.sales_rep)
      if (!repEmail) {
        console.log(`  No email found for rep: ${order.sales_rep} — skipping WO ${order.order_number}`)
        skipped++
        continue
      }

      const partDate = order.part_expected_date
        ? new Date(order.part_expected_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : null

      const shipDate = order.expected_ship_date
        ? new Date(order.expected_ship_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : null

      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #92400e;">⚠ Order on Hold — Day 5</p>
          </div>

          <h2 style="font-size: 18px; font-weight: 700; color: #1c1917; margin-bottom: 4px;">
            Order #${order.order_number}
          </h2>
          <p style="color: #78716c; font-size: 14px; margin-top: 0;">${order.customer_name}${order.sidemark ? ` · ${order.sidemark}` : ''}</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <tr style="border-bottom: 1px solid #e7e5e4;">
              <td style="padding: 10px 0; color: #78716c; width: 160px;">Hold Reason</td>
              <td style="padding: 10px 0; font-weight: 600; color: #1c1917;">${order.hold_reason}</td>
            </tr>
            ${order.hold_note ? `
            <tr style="border-bottom: 1px solid #e7e5e4;">
              <td style="padding: 10px 0; color: #78716c;">Note</td>
              <td style="padding: 10px 0; color: #44403c;">${order.hold_note}</td>
            </tr>` : ''}
            <tr style="border-bottom: 1px solid #e7e5e4;">
              <td style="padding: 10px 0; color: #78716c;">Days on Hold</td>
              <td style="padding: 10px 0; font-weight: 600; color: #dc2626;">${days} days</td>
            </tr>
            ${partDate ? `
            <tr style="border-bottom: 1px solid #e7e5e4;">
              <td style="padding: 10px 0; color: #78716c;">Parts Expected</td>
              <td style="padding: 10px 0; font-weight: 600; color: #1c1917;">${partDate}</td>
            </tr>` : ''}
            ${shipDate ? `
            <tr>
              <td style="padding: 10px 0; color: #78716c;">Expected Ship Date</td>
              <td style="padding: 10px 0; font-weight: 600; color: #16a34a;">${shipDate}</td>
            </tr>` : ''}
          </table>

          <p style="font-size: 13px; color: #78716c; margin-top: 24px;">
            This order has been on hold for 5 days. Please review and update the customer if needed.
          </p>
          <p style="font-size: 12px; color: #a8a29e; margin-top: 8px;">
            Berkely Wrangl · Internal notification — do not reply to this email
          </p>
        </div>
      `

      await sendEmail({
        to:      repEmail,
        subject: `[Hold Day 5] Order #${order.order_number} — ${order.customer_name}`,
        html,
      })

      console.log(`  Notified ${repEmail} for order #${order.order_number} (${days} days on hold)`)
      notified++
    }

    console.log(`\n✅ Done — notified: ${notified}, skipped: ${skipped}`)
    return { statusCode: 200, body: JSON.stringify({ notified, skipped }) }

  } catch (err) {
    console.error('Fatal error:', err)
    return { statusCode: 500, body: err.message }
  }
}
