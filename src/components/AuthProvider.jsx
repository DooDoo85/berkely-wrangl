import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

// A user has a password set if 'email' is in their identity providers.
// Magic-link-only users won't have 'email' in providers until they set a password.
function userHasPassword(user) {
  if (!user) return false
  const providers = user.app_metadata?.providers || []
  const identities = user.identities || []
  // Either app_metadata.providers contains 'email', or there's an email identity
  return providers.includes('email') || identities.some(i => i.provider === 'email')
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  // ── Impersonation state ───────────────────────────────────────────────
  // Owner-only feature. impersonatedProfile is the target user's profile row
  // when an owner has used "View as User"; null otherwise. Persisted in
  // sessionStorage so it survives page reloads but clears on tab close.
  const [impersonatedProfile, setImpersonatedProfile] = useState(() => {
    try {
      const raw = sessionStorage.getItem('wrangl_impersonation')
      return raw ? JSON.parse(raw).profile : null
    } catch { return null }
  })
  const impersonationSessionIdRef = useRef(
    (() => {
      try {
        const raw = sessionStorage.getItem('wrangl_impersonation')
        return raw ? JSON.parse(raw).sessionId : null
      } catch { return null }
    })()
  )
  const isImpersonating = !!impersonatedProfile

  // Ref mirror of isPasswordRecovery so the auth-state callback (which captures
  // a stale closure) can always read the current value.
  const recoveryRef = useRef(false)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setNeedsPassword(session?.user ? !userHasPassword(session.user) : false)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // ── Password recovery: user clicked reset link ──────────────────────
      // Supabase fires PASSWORD_RECOVERY when the user lands from a reset
      // email. Force them through the password-set modal even though they
      // already have an email identity (they're an existing user resetting).
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRef.current = true
        setIsPasswordRecovery(true)
        setNeedsPassword(true)
        setUser(session?.user ?? null)
        if (session?.user) fetchProfile(session.user.id)
        return
      }

      setUser(session?.user ?? null)

      // If we're mid-recovery, keep the modal up regardless of identity state.
      if (recoveryRef.current) {
        setNeedsPassword(true)
      } else {
        // Normal flow: invited users (no email identity yet) need to set a password
        setNeedsPassword(session?.user ? !userHasPassword(session.user) : false)
      }

      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    recoveryRef.current = false
    setIsPasswordRecovery(false)
    setNeedsPassword(false)
    // Clear impersonation state too — stale sessionStorage shouldn't survive a sign-out
    sessionStorage.removeItem('wrangl_impersonation')
    impersonationSessionIdRef.current = null
    setImpersonatedProfile(null)
    await supabase.auth.signOut()
  }

  // Called after the password-set modal completes successfully
  async function refreshUser() {
    const { data: { user: refreshedUser } } = await supabase.auth.getUser()
    setUser(refreshedUser)
    recoveryRef.current = false
    setIsPasswordRecovery(false)
    setNeedsPassword(refreshedUser ? !userHasPassword(refreshedUser) : false)
  }

  // ── Impersonation: start ──────────────────────────────────────────────
  // Owners only (RLS on impersonation_sessions enforces this server-side too).
  // Fetches the target user's profile, persists it to sessionStorage so it
  // survives page reloads, and inserts an audit row.
  async function startImpersonation(targetUserId, reason) {
    if (!profile || profile.role !== 'owner') {
      console.warn('Impersonation requires owner role')
      return { error: new Error('Forbidden') }
    }
    if (targetUserId === user?.id) {
      return { error: new Error("Can't impersonate yourself") }
    }

    // Fetch the target profile
    const { data: target, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single()

    if (profileError || !target) {
      return { error: profileError || new Error('Target user not found') }
    }

    // Audit row — RLS rejects this if caller isn't owner
    const { data: session, error: sessionError } = await supabase
      .from('impersonation_sessions')
      .insert({
        real_user_id:   user.id,
        target_user_id: targetUserId,
        reason:         reason || null,
      })
      .select()
      .single()

    if (sessionError) {
      return { error: sessionError }
    }

    // Persist to sessionStorage so page reloads survive it
    sessionStorage.setItem('wrangl_impersonation', JSON.stringify({
      profile:   target,
      sessionId: session.id,
    }))

    impersonationSessionIdRef.current = session.id
    setImpersonatedProfile(target)
    return { data: session }
  }

  // ── Impersonation: end ────────────────────────────────────────────────
  async function endImpersonation() {
    // Close out the audit row
    if (impersonationSessionIdRef.current) {
      await supabase
        .from('impersonation_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', impersonationSessionIdRef.current)
    }
    sessionStorage.removeItem('wrangl_impersonation')
    impersonationSessionIdRef.current = null
    setImpersonatedProfile(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      // When impersonating, profile returns the target user's profile.
      // This is what 99% of the app should read — gives accurate UI.
      profile: impersonatedProfile || profile,
      // realProfile always returns the actual signed-in user — for permission
      // checks, audit logging, and the impersonation banner.
      realProfile: profile,
      loading,
      needsPassword,
      isPasswordRecovery,
      isImpersonating,
      signIn,
      signOut,
      refreshUser,
      startImpersonation,
      endImpersonation,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
