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

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      needsPassword,
      isPasswordRecovery,
      signIn,
      signOut,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
