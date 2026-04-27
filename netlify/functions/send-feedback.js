// Berkely Wrangl — Send Feedback
// Triggered when a user submits feedback via the in-app feedback modal
// Emails feedback to david@berkelydistribution.com via Resend

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL     = process.env.FROM_EMAIL || 'noreply@berkelydistribution.com'
const TO_EMAIL       = 'david@berkelydistribution.com'

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { message, repName, repEmail, role, page } = JSON.parse(event.body)

    if (!message?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Message is required' }) }
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a1a; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="color: #d4a843; margin: 0; font-size: 16px; letter-spacing: 0.05em;">WRANGL FEEDBACK</h2>
        </div>
        <div style="background: #f9f7f4; padding: 24px; border: 1px solid #e5e0d8; border-top: none; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; margin-bottom: 20px; font-size: 13px; color: #666;">
            <tr>
              <td style="padding: 4px 0; width: 100px; color: #999;">From</td>
              <td style="padding: 4px 0; font-weight: 600; color: #333;">${repName || 'Unknown'} ${repEmail ? `(${repEmail})` : ''}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #999;">Role</td>
              <td style="padding: 4px 0; color: #333; text-transform: capitalize;">${role || 'Unknown'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #999;">Page</td>
              <td style="padding: 4px 0; color: #333;">${page || 'Unknown'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #999;">Time</td>
              <td style="padding: 4px 0; color: #333;">${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</td>
            </tr>
          </table>
          <div style="background: white; border: 1px solid #e5e0d8; border-radius: 6px; padding: 16px;">
            <p style="margin: 0; font-size: 15px; color: #333; line-height: 1.6; white-space: pre-wrap;">${message.trim()}</p>
          </div>
        </div>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [TO_EMAIL],
        subject: `Wrangl Feedback — ${repName || 'Unknown'} (${role || 'user'})`,
        html,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Resend error')

    console.log(`Feedback sent from ${repName} (${repEmail})`)
    return { statusCode: 200, body: JSON.stringify({ success: true }) }

  } catch (err) {
    console.error('send-feedback error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
