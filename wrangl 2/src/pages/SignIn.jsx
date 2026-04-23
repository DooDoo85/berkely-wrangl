import { useState } from 'react'
import { useAuth } from '../components/AuthProvider'
import { useNavigate } from 'react-router-dom'

export default function SignIn() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) { setError(error.message); setLoading(false) }
    else navigate('/')
  }

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4"
         style={{ backgroundImage: 'radial-gradient(ellipse at 20% 50%, #2D4A31 0%, #1C2B1E 60%)' }}>

      {/* Decorative grain overlay */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none"
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")` }} />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-gold/20 border border-brand-gold/30 mb-4">
            <span className="text-brand-gold text-2xl font-bold font-display">W</span>
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Berkely Wrangl
          </h1>
          <p className="text-stone-400 text-sm mt-1">Operations & Sales Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          <h2 className="text-white font-semibold text-lg mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label text-stone-400">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@berkelydistribution.com"
                required
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-sm
                           text-white placeholder-stone-500 focus:outline-none focus:ring-2
                           focus:ring-brand-gold/40 focus:border-brand-gold/60 transition-all"
              />
            </div>

            <div>
              <label className="label text-stone-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-sm
                           text-white placeholder-stone-500 focus:outline-none focus:ring-2
                           focus:ring-brand-gold/40 focus:border-brand-gold/60 transition-all"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-gold hover:bg-amber-500 disabled:opacity-50
                         text-white font-semibold py-2.5 rounded-lg text-sm
                         transition-all duration-150 mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-stone-600 text-xs mt-6">
          Berkely Distribution LLC · Internal Use Only
        </p>
      </div>
    </div>
  )
}
