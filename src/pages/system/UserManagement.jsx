import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const ROLE_LABELS = {
  owner:      'Owner',
  admin:      'Executive',
  sales:      'Sales Rep',
  production: 'Production Lead',
  ops:        'Operations',
  purchasing: 'Purchasing',
  viewer:     'Viewer',
}

const ROLE_BADGE = {
  owner:      'bg-purple-50 text-purple-700 border-purple-200',
  admin:      'bg-blue-50 text-blue-700 border-blue-200',
  sales:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  production: 'bg-amber-50 text-amber-700 border-amber-200',
  ops:        'bg-stone-50 text-stone-600 border-stone-200',
  purchasing: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  viewer:     'bg-stone-50 text-stone-500 border-stone-200',
}

const ROLE_OPTIONS = ['admin', 'sales', 'production', 'ops', 'purchasing', 'viewer']

async function callManageUser(action, body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch('/.netlify/functions/manage-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [createdInfo, setCreatedInfo] = useState(null) // for showing temp password
  const [resetting, setResetting] = useState(null) // user_id currently sending reset
  const [resetInfo, setResetInfo] = useState(null) // success/failure message

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, active, created_at')
      .order('role', { ascending: true })
      .order('email', { ascending: true })
    setUsers(data || [])
    setLoading(false)
  }

  async function sendPasswordReset(user) {
    if (!confirm(`Send password reset email to ${user.email}?`)) return
    setResetting(user.id)
    setResetInfo(null)
    try {
      const result = await callManageUser('send_password_reset', {
        user_id: user.id,
        email: user.email,
      })
      setResetInfo({
        type: result.email_sent ? 'success' : 'warning',
        email: user.email,
        message: result.email_sent
          ? `Password reset email sent to ${user.email}`
          : result.warning || 'Reset link generated',
        reset_link: result.reset_link,
      })
      setTimeout(() => setResetInfo(null), 8000)
    } catch (e) {
      setResetInfo({ type: 'error', message: e.message })
    }
    setResetting(null)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-stone-800">Users</h1>
          <p className="text-sm text-stone-400 mt-0.5">{users.length} accounts · {users.filter(u => u.active !== false).length} active</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-[#5a3a24] text-[#f5e6d0] font-semibold rounded-xl hover:bg-[#6e4a30] transition-colors text-sm"
        >
          + Add User
        </button>
      </div>

      {/* Password reset result */}
      {resetInfo && (
        <div className={`card p-4 mb-5 border-2 ${
          resetInfo.type === 'success' ? 'border-green-200 bg-green-50' :
          resetInfo.type === 'warning' ? 'border-amber-200 bg-amber-50' :
          'border-red-200 bg-red-50'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className={`text-sm font-semibold ${
                resetInfo.type === 'success' ? 'text-green-800' :
                resetInfo.type === 'warning' ? 'text-amber-800' :
                'text-red-800'
              }`}>
                {resetInfo.type === 'success' ? '✓' : resetInfo.type === 'warning' ? '⚠' : '✕'} {resetInfo.message}
              </p>
              {resetInfo.reset_link && (
                <div className="flex items-center gap-2 mt-2">
                  <code className="bg-white border border-stone-300 px-2 py-1 rounded font-mono text-xs text-stone-800 truncate max-w-md">
                    {resetInfo.reset_link}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(resetInfo.reset_link)}
                    className="text-xs px-2 py-1 bg-white border border-stone-200 rounded hover:bg-stone-100"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setResetInfo(null)} className="text-stone-500 hover:text-stone-700">✕</button>
          </div>
        </div>
      )}

      {/* Created success card */}
      {createdInfo && (
        <div className={`card p-5 mb-5 border-2 ${createdInfo.warning ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className={`font-bold mb-1 ${createdInfo.warning ? 'text-amber-800' : 'text-green-800'}`}>
                ✓ User created — {createdInfo.email}
              </p>

              {createdInfo.warning && (
                <p className="text-sm text-amber-700 mb-3">{createdInfo.warning}</p>
              )}

              {createdInfo.email_sent && createdInfo.method === 'invite_email' && (
                <p className="text-sm text-green-700">📧 Invite email sent. They'll click a link to set their password.</p>
              )}

              {createdInfo.email_sent && createdInfo.method === 'password_email' && (
                <p className="text-sm text-green-700">📧 Welcome email sent with their login credentials.</p>
              )}

              {createdInfo.temp_password && (
                <>
                  <p className="text-sm text-stone-700 mt-2 mb-2">Temporary password:</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white border border-stone-300 px-3 py-2 rounded-lg font-mono text-sm font-bold text-stone-800">
                      {createdInfo.temp_password}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(createdInfo.temp_password)}
                      className="text-xs px-2 py-1 bg-white border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </>
              )}

              {createdInfo.invite_link && createdInfo.method !== 'invite_email' && (
                <>
                  <p className="text-sm text-stone-700 mt-2 mb-2">Invite link:</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white border border-stone-300 px-3 py-2 rounded-lg font-mono text-xs text-stone-800 truncate max-w-md">
                      {createdInfo.invite_link}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(createdInfo.invite_link)}
                      className="text-xs px-2 py-1 bg-white border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setCreatedInfo(null)} className="text-stone-500 hover:text-stone-700 text-xl leading-none">✕</button>
          </div>
        </div>
      )}

      {/* User list */}
      {loading ? (
        <div className="card p-8 text-center text-stone-400 text-sm">Loading users...</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Email</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Created</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={`border-b border-stone-50 ${u.active === false ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-medium text-stone-800">{u.full_name || '—'}</td>
                  <td className="px-5 py-3 text-stone-600">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${ROLE_BADGE[u.role] || 'bg-stone-50 text-stone-500 border-stone-200'}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {u.active === false ? (
                      <span className="text-xs text-red-600 font-semibold">Deactivated</span>
                    ) : (
                      <span className="text-xs text-green-600 font-semibold">Active</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-stone-400">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {u.role !== 'owner' && u.active !== false && (
                        <button
                          onClick={() => sendPasswordReset(u)}
                          disabled={resetting === u.id}
                          className="text-xs font-semibold text-stone-500 hover:text-[#5a3a24] hover:underline disabled:opacity-40"
                          title="Send password reset email"
                        >
                          {resetting === u.id ? 'Sending...' : '🔑 Reset'}
                        </button>
                      )}
                      {u.role !== 'owner' && (
                        <button
                          onClick={() => setEditing(u)}
                          className="text-xs font-semibold text-[#5a3a24] hover:underline"
                        >
                          Edit →
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User Modal */}
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={(info) => { setCreatedInfo(info); setShowAdd(false); loadUsers() }} />}

      {/* Edit User Modal */}
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadUsers() }} />}
    </div>
  )
}

// ── Add User Modal ────────────────────────────────────────────────────────────

function AddUserModal({ onClose, onCreated }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('sales')
  const [method, setMethod] = useState('invite_email')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!email.trim()) { setError('Email is required'); return }
    setSaving(true)
    setError(null)
    try {
      const result = await callManageUser('create', {
        email: email.trim(),
        full_name: fullName.trim() || null,
        role,
        method,
      })
      onCreated(result)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-display font-bold text-stone-800">Add User</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-xl leading-none">✕</button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@berkelydistribution.com"
              className="input w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Full Name <span className="font-normal normal-case text-stone-300">(optional)</span></label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Doe"
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="input w-full"
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">How to Onboard</label>
            <div className="space-y-2">
              <button
                onClick={() => setMethod('invite_email')}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  method === 'invite_email' ? 'border-[#5a3a24] bg-[#5a3a24]/5' : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <p className="text-sm font-semibold text-stone-800">📧 Email Invite Link <span className="text-[10px] font-normal text-stone-400 ml-1">recommended</span></p>
                <p className="text-xs text-stone-500 mt-0.5">They click a link in the email to set their own password</p>
              </button>
              <button
                onClick={() => setMethod('password_email')}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  method === 'password_email' ? 'border-[#5a3a24] bg-[#5a3a24]/5' : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <p className="text-sm font-semibold text-stone-800">🔑 Email Password</p>
                <p className="text-xs text-stone-500 mt-0.5">Generate a temp password and email it directly to them</p>
              </button>
              <button
                onClick={() => setMethod('show_password')}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  method === 'show_password' ? 'border-[#5a3a24] bg-[#5a3a24]/5' : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <p className="text-sm font-semibold text-stone-800">👁️ Show Password On Screen</p>
                <p className="text-xs text-stone-500 mt-0.5">No email sent — share manually (text, Slack, etc.)</p>
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 rounded-xl border border-stone-200 text-sm text-stone-500 hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !email.trim()}
            className="flex-1 py-2 px-4 rounded-xl bg-[#5a3a24] text-[#f5e6d0] text-sm font-semibold hover:bg-[#6e4a30] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit User Modal ───────────────────────────────────────────────────────────

function EditUserModal({ user, onClose, onSaved }) {
  const [fullName, setFullName] = useState(user.full_name || '')
  const [role, setRole] = useState(user.role)
  const [active, setActive] = useState(user.active !== false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // Update name and role
      await callManageUser('update', {
        user_id: user.id,
        full_name: fullName.trim() || null,
        role,
      })

      // Toggle active state if changed
      if (active !== (user.active !== false)) {
        await callManageUser(active ? 'reactivate' : 'deactivate', { user_id: user.id })
      }

      onSaved()
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-display font-bold text-stone-800">Edit User</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-xl leading-none">✕</button>
        </div>

        <div className="bg-stone-50 rounded-xl p-3 mb-4">
          <p className="text-sm font-semibold text-stone-700">{user.email}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="input w-full"
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={e => setActive(e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 cursor-pointer"
              />
              <span className="text-sm text-stone-700">Active (can log in)</span>
            </label>
            {!active && (
              <p className="text-xs text-red-600 mt-1 ml-6">⚠️ Deactivating will prevent this user from logging in</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 rounded-xl border border-stone-200 text-sm text-stone-500 hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 px-4 rounded-xl bg-[#5a3a24] text-[#f5e6d0] text-sm font-semibold hover:bg-[#6e4a30] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
