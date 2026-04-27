// Berkely Wrangl — Send DocuSeal New Account Agreement
// Triggered when a new customer is created
// Sends account agreement form via DocuSeal to customer
// CC's parker@, customerservice@, abigail@berkelydistribution.com

const DOCUSEAL_API_KEY  = process.env.DOCUSEAL_API_KEY
const TEMPLATE_ID       = 3190649
const DOCUSEAL_API_URL  = 'https://api.docuseal.com/submissions'

const CC_EMAILS = [
  'douglasd1885@gmail.com',
]

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { customerName, contactName, contactEmail } = JSON.parse(event.body)

    if (!contactEmail || !contactName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'contactName and contactEmail are required' }),
      }
    }

    console.log(`DocuSeal request for: ${contactEmail} ${customerName}`)

    // Build submitters array — primary contact + CC's as observers
    const submitters = [
      {
        role:  'First Party',
        name:  contactName,
        email: contactEmail,
      },
      ...CC_EMAILS.map(email => ({
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
        customer_name: customerName,
        contact_name:  contactName,
        contact_email: contactEmail,
      },
    }

    const res = await fetch(DOCUSEAL_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Auth-Token':  DOCUSEAL_API_KEY,
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
        success:       true,
        submissionId:  submission?.submission_id,
        slug:          submission?.slug,
        embedSrc:      submission?.embed_src,
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
