// Netlify function: manage-user
// Privileged user management operations using Supabase service role.
// All operations require the caller to be authenticated AND have role='owner'.
//
// Endpoints (POST with action in body):
//   action: 'create'      → { email, full_name, role, method } (method: 'invite' | 'temp_password')
//   action: 'update'      → { user_id, full_name, role }
//   action: 'deactivate'  → { user_id }
//   action: 'reactivate'  → { user_id }

const SUPABASE_URL          = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const SUPABASE_ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY
const RESEND_API_KEY        = process.env.RESEND_API_KEY
const APP_URL               = process.env.URL || 'https://app.berkelydistribution.com'
const FROM_EMAIL            = process.env.WRANGL_FROM_EMAIL || 'Wrangl <noreply@berkelydistribution.com>'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function verifyOwner(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, error: 'Missing auth token' }
  }
  const token = authHeader.replace('Bearer ', '')

  // Verify token and get user
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!userRes.ok) return { ok: false, error: 'Invalid token' }
  const user = await userRes.json()

  // Check role
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  const profiles = await profileRes.json()
  const role = profiles?.[0]?.role

  if (role !== 'owner') {
    return { ok: false, error: 'Only owners can manage users' }
  }
  return { ok: true, user }
}

async function adminFetch(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

function generateTempPassword() {
  // 12-char alphanumeric, no ambiguous chars (no 0/O/1/l/I)
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let pwd = ''
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pwd + '!'  // ensure symbol
}

async function sendViaResend({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data?.message || data?.name || `Resend error (${res.status})` }
  return { ok: true, id: data.id }
}

function welcomeEmailHtml({ fullName, email, loginUrl, tempPassword, inviteLink }) {
  const greeting = fullName ? `Hi ${fullName.split(' ')[0]},` : 'Hi,'
  const credentialsBlock = inviteLink
    ? `
      <p>Click the button below to set up your password and log in:</p>
      <p style="text-align:center;margin:30px 0">
        <a href="${inviteLink}" style="background:#5a3a24;color:#f5e6d0;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Set Password & Log In</a>
      </p>
      <p style="font-size:12px;color:#888">If the button doesn't work, copy this link: <a href="${inviteLink}">${inviteLink}</a></p>
    `
    : `
      <p>Your login details:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 12px;color:#888;font-size:13px">Email</td><td style="padding:6px 12px;font-weight:600">${email}</td></tr>
        <tr><td style="padding:6px 12px;color:#888;font-size:13px">Password</td><td style="padding:6px 12px;font-family:monospace;font-weight:600;background:#f5f1ea;border-radius:4px">${tempPassword}</td></tr>
      </table>
      <p style="text-align:center;margin:30px 0">
        <a href="${loginUrl}" style="background:#5a3a24;color:#f5e6d0;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Log In to Wrangl</a>
      </p>
      <p style="font-size:13px;color:#666;background:#fef3e2;border-left:3px solid #d4aa70;padding:12px 16px;border-radius:4px">
        <strong>Please change your password</strong> after logging in for the first time.
      </p>
    `

  return `
    <!DOCTYPE html>
    <html>
      <body style="font-family:-apple-system,Segoe UI,sans-serif;color:#333;max-width:560px;margin:0 auto;padding:24px;background:#fafafa">
        <div style="background:white;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
          <h1 style="font-size:22px;margin:0 0 16px;color:#261810">🐄 Welcome to Wrangl</h1>
          <p>${greeting}</p>
          <p>Your Wrangl account has been created at <strong>Berkely Distribution</strong>. Wrangl is our internal system for managing customers, quotes, orders, inventory, and production.</p>
          ${credentialsBlock}
          <p style="font-size:13px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:16px">
            See a floating "Feedback" button on every page once you're in — use it to send me bugs, questions, or ideas anytime.
          </p>
          <p style="font-size:13px;color:#888">— David</p>
        </div>
      </body>
    </html>
  `
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function createUser({ email, full_name, role, method }) {
  const validRoles = ['owner', 'admin', 'sales', 'ops', 'purchasing', 'production', 'viewer']
  if (!validRoles.includes(role)) return { ok: false, error: `Invalid role: ${role}` }
  if (!email) return { ok: false, error: 'Email is required' }

  // method options:
  //   'invite_email'  → email a "set your password" link via Resend (best UX)
  //   'password_email' → generate temp password, email it via Resend
  //   'show_password' → generate temp password, return for manual sharing

  let tempPassword = null
  let inviteLink = null
  let userId = null

  // Step 1: Create the user in Supabase Auth
  if (method === 'invite_email') {
    // Generate an invite link without sending Supabase's default email
    const { ok, status, data } = await adminFetch('/auth/v1/admin/generate_link', 'POST', {
      type: 'invite',
      email,
      data: { full_name: full_name || null },
    })
    if (!ok) return { ok: false, error: data?.msg || data?.error || `Failed to generate invite (${status})` }
    userId = data.user?.id || data.id
    inviteLink = data.action_link || data.properties?.action_link
  } else {
    // Both password methods: create user with a temp password
    tempPassword = generateTempPassword()
    const { ok, status, data } = await adminFetch('/auth/v1/admin/users', 'POST', {
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: full_name || null },
    })
    if (!ok) return { ok: false, error: data?.msg || data?.error || `Failed to create user (${status})` }
    userId = data.id
  }

  // Step 2: Upsert profile with role
  const { ok: pOk } = await adminFetch(
    '/rest/v1/profiles?on_conflict=id',
    'POST',
    [{
      id: userId,
      email,
      full_name: full_name || null,
      role,
      active: true,
      updated_at: new Date().toISOString(),
    }]
  )
  if (!pOk) {
    await adminFetch(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', {
      email, full_name: full_name || null, role, active: true,
      updated_at: new Date().toISOString(),
    })
  }

  // Step 3: Send email if applicable
  let emailResult = null
  if (method === 'invite_email' || method === 'password_email') {
    const html = welcomeEmailHtml({
      fullName: full_name,
      email,
      loginUrl: APP_URL,
      tempPassword,
      inviteLink,
    })
    emailResult = await sendViaResend({
      to: email,
      subject: 'Welcome to Wrangl — your account is ready',
      html,
    })
    if (!emailResult.ok) {
      // User was created but email failed — return password as fallback
      return {
        ok: true,
        user_id: userId,
        email,
        method: tempPassword ? 'show_password' : 'invite_email',
        temp_password: tempPassword,
        invite_link: inviteLink,
        email_error: emailResult.error,
        warning: `User created, but email failed: ${emailResult.error}. ${tempPassword ? 'Share the password manually.' : 'Share the invite link manually.'}`,
      }
    }
  }

  return {
    ok: true,
    user_id: userId,
    email,
    method,
    temp_password: method === 'show_password' ? tempPassword : null,
    invite_link: method === 'show_password' ? null : inviteLink,
    email_sent: emailResult?.ok || false,
  }
}

async function updateUser({ user_id, full_name, role }) {
  if (!user_id) return { ok: false, error: 'user_id required' }
  const updates = {}
  if (full_name !== undefined) updates.full_name = full_name
  if (role !== undefined) updates.role = role
  updates.updated_at = new Date().toISOString()

  const { ok, data, status } = await adminFetch(
    `/rest/v1/profiles?id=eq.${user_id}`,
    'PATCH',
    updates
  )
  if (!ok) return { ok: false, error: data?.message || `Failed to update (${status})` }

  // Also update auth user metadata if name changed
  if (full_name !== undefined) {
    await adminFetch(`/auth/v1/admin/users/${user_id}`, 'PUT', {
      user_metadata: { full_name },
    })
  }

  return { ok: true }
}

async function sendPasswordReset({ user_id, email }) {
  if (!email) return { ok: false, error: 'email required' }

  // Generate a recovery link via admin API (doesn't trigger Supabase's own email)
  const { ok, data, status } = await adminFetch('/auth/v1/admin/generate_link', 'POST', {
    type: 'recovery',
    email,
  })
  if (!ok) return { ok: false, error: data?.msg || data?.error || `Failed to generate reset link (${status})` }

  const resetLink = data.action_link || data.properties?.action_link
  if (!resetLink) return { ok: false, error: 'No reset link returned' }

  // Get the user's name for personalization
  const profileRes = await adminFetch(`/rest/v1/profiles?id=eq.${user_id || ''}&select=full_name`, 'GET')
  const fullName = profileRes.data?.[0]?.full_name || null

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family:-apple-system,Segoe UI,sans-serif;color:#333;max-width:560px;margin:0 auto;padding:24px;background:#fafafa">
        <div style="background:white;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
          <h1 style="font-size:22px;margin:0 0 16px;color:#261810">🐄 Reset your Wrangl password</h1>
          <p>${fullName ? `Hi ${fullName.split(' ')[0]},` : 'Hi,'}</p>
          <p>A password reset was requested for your Wrangl account. Click below to set a new password:</p>
          <p style="text-align:center;margin:30px 0">
            <a href="${resetLink}" style="background:#5a3a24;color:#f5e6d0;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Reset Password</a>
          </p>
          <p style="font-size:12px;color:#888">If you didn't request this, you can ignore this email.</p>
          <p style="font-size:13px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:16px">— David</p>
        </div>
      </body>
    </html>
  `

  const emailResult = await sendViaResend({
    to: email,
    subject: 'Reset your Wrangl password',
    html,
  })

  if (!emailResult.ok) {
    // Email failed — return link as fallback
    return { ok: true, reset_link: resetLink, email_sent: false, warning: `Email failed: ${emailResult.error}. Share the link manually.` }
  }
  return { ok: true, email_sent: true }
}

async function setActive({ user_id, active }) {
  if (!user_id) return { ok: false, error: 'user_id required' }
  const { ok, data, status } = await adminFetch(
    `/rest/v1/profiles?id=eq.${user_id}`,
    'PATCH',
    { active, updated_at: new Date().toISOString() }
  )
  if (!ok) return { ok: false, error: data?.message || `Failed (${status})` }

  // Banned/unbanned in Supabase Auth too
  await adminFetch(`/auth/v1/admin/users/${user_id}`, 'PUT', {
    ban_duration: active ? 'none' : '876000h', // ~100 years if deactivated
  })
  return { ok: true }
}

// ── Main handler ──────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {})
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  // Verify caller is owner
  const auth = await verifyOwner(event.headers.authorization || event.headers.Authorization)
  if (!auth.ok) return jsonResponse(403, { error: auth.error })

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' })
  }

  const { action } = body
  let result

  try {
    switch (action) {
      case 'create':
        result = await createUser(body)
        break
      case 'update':
        result = await updateUser(body)
        break
      case 'deactivate':
        result = await setActive({ user_id: body.user_id, active: false })
        break
      case 'reactivate':
        result = await setActive({ user_id: body.user_id, active: true })
        break
      case 'send_password_reset':
        result = await sendPasswordReset({ user_id: body.user_id, email: body.email })
        break
      default:
        return jsonResponse(400, { error: `Unknown action: ${action}` })
    }
  } catch (err) {
    return jsonResponse(500, { error: err.message })
  }

  if (!result.ok) return jsonResponse(400, { error: result.error })
  return jsonResponse(200, result)
}
