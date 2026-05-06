import { createContext, useContext, useEffect, useState } from 'react'
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

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setNeedsPassword(session?.user ? !userHasPassword(session.user) : false)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setNeedsPassword(session?.user ? !userHasPassword(session.user) : false)
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
    await supabase.auth.signOut()
  }

  // Called after the password-set modal completes successfully
  async function refreshUser() {
    const { data: { user: refreshedUser } } = await supabase.auth.getUser()
    setUser(refreshedUser)
    setNeedsPassword(refreshedUser ? !userHasPassword(refreshedUser) : false)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, needsPassword, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
