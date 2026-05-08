import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

export default function SetPasswordRequired() {
  const { user, refreshUser, signOut, isPasswordRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    // Refresh user to update needsPassword + isPasswordRecovery state
    await refreshUser()
    setSaving(false)
  }

  // Copy varies based on whether user is resetting vs setting up for the first time
  const heading = isPasswordRecovery ? 'Reset Your Password' : 'Welcome to Wrangl'
  const subtext = isPasswordRecovery
    ? 'Enter a new password below. You\'ll use this to log in going forward.'
    : 'One last step — set a password so you can log in directly next time.'
  const submitLabel = isPasswordRecovery ? 'Update Password' : 'Set Password & Continue'

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">{isPasswordRecovery ? '🔑' : '🐄'}</div>
          <h2 className="text-2xl font-display font-bold text-stone-800">{heading}</h2>
          <p className="text-sm text-stone-500 mt-2">
            {subtext}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 block">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-400 text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 block">New Password</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm pr-16 focus:outline-none focus:border-stone-500"
                autoFocus
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 block">Confirm Password</label>
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
              required
              minLength={8}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !password || !confirm}
            className="w-full py-2.5 rounded-xl bg-[#5a3a24] text-[#f5e6d0] text-sm font-semibold hover:bg-[#6e4a30] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : submitLabel}
          </button>

          <button
            type="button"
            onClick={signOut}
            className="w-full text-xs text-stone-400 hover:text-stone-600"
          >
            {isPasswordRecovery ? 'Cancel and sign out' : 'Log out'}
          </button>
        </form>
      </div>
    </div>
  )
}
