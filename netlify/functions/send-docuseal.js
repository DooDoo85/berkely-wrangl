// Berkely Wrangl — Send DocuSeal New Account Agreement
// Triggered when a new customer is created.
//
// Sends the account agreement form via DocuSeal to the customer's primary
// contact, and CC's four internal people as DocuSeal "CC" submitters:
//   - The Sales Rep who submitted the customer  (dynamic, passed in)
//   - Parker            (Executive)             (fixed)
//   - Customer Service                          (fixed)
//   - Abigail           (Customer Success Rep)  (fixed)
//
// Because all four are added as CC *submitters* on the submission (not just
// CC'd on the initial email), DocuSeal includes them on BOTH events:
//   1. The initial "please sign" email when the agreement goes out
//   2. The completed-document email (signed PDF + audit log) once the
//      customer finishes signing
// No completion webhook is needed — DocuSeal handles the round trip.

const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY
const TEMPLATE_ID      = 3190649
const DOCUSEAL_API_URL = 'https://api.docuseal.com/submissions'

// Fixed internal recipients — copied on every account agreement.
const FIXED_CC_EMAILS = [
  'parker@berkelydistribution.com',          // Executive
  'customerservice@berkelydistribution.com', // Customer Service
  'abigail@berkelydistribution.com',         // Customer Success Rep
]

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { customerName, contactName, contactEmail, salesRepEmail } =
      JSON.parse(event.body)

    if (!contactEmail || !contactName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'contactName and contactEmail are required' }),
      }
    }

    console.log(`DocuSeal request for: ${contactEmail} ${customerName}`)

    // ── Build the CC list ────────────────────────────────────────────
    // Start with the submitting sales rep (if we have their email), then
    // the three fixed internal recipients. Dedupe case-insensitively so
    // that if the rep IS one of the fixed four (e.g. Abigail creates a
    // customer), DocuSeal doesn't get the same email twice.
    const ccCandidates = []
    if (salesRepEmail && salesRepEmail.includes('@')) {
      ccCandidates.push(salesRepEmail.trim())
    }
    ccCandidates.push(...FIXED_CC_EMAILS)

    const seen = new Set()
    const ccEmails = []
    for (const raw of ccCandidates) {
      const email = raw.trim()
      const key = email.toLowerCase()
      // Also skip if it collides with the customer's own contact email —
      // the customer is already the First Party signer.
      if (key === (contactEmail || '').trim().toLowerCase()) continue
      if (seen.has(key)) continue
      seen.add(key)
      ccEmails.push(email)
    }

    console.log(`DocuSeal CC list (${ccEmails.length}): ${ccEmails.join(', ')}`)

    // Build submitters array — primary contact as signer + CC's as observers
    const submitters = [
      {
        role:  'First Party',
        name:  contactName,
        email: contactEmail,
      },
      ...ccEmails.map(email => ({
        role:   'CC',
        email,
        values: {},
        preferences: { send_email: true },
      })),
    ]

    const payload = {
      template_id: TEMPLATE_ID,
      send_email:  true,
      submitters,
      metadata: {
        customer_name:   customerName,
        contact_name:    contactName,
        contact_email:   contactEmail,
        sales_rep_email: salesRepEmail || null,
      },
    }

    const res = await fetch(DOCUSEAL_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': DOCUSEAL_API_KEY,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    console.log(`DocuSeal response status: ${res.status}`)
    console.log(`DocuSeal response: ${JSON.stringify(data)}`)

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: 'DocuSeal error', details: data }),
      }
    }

    // Return submission ID and slug for tracking
    const submission = Array.isArray(data) ? data[0] : data
    return {
      statusCode: 200,
      body: JSON.stringify({
        success:      true,
        submissionId: submission?.submission_id,
        slug:         submission?.slug,
        embedSrc:     submission?.embed_src,
        ccCount:      ccEmails.length,
      }),
    }
  } catch (err) {
    console.error('send-docuseal error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
