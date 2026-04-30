import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from './AuthProvider'

const NAV_EXECUTIVE = [
  {
    section: 'MAIN',
    items: [
      { to: '/',          icon: '⌂',  label: 'Home' },
    ]
  },
  {
    section: 'SALES',
    items: [
      { to: '/customers', icon: '◎',  label: 'Customers' },
      { to: '/activities',icon: '◈',  label: 'Activities' },
      { to: '/pipeline',  icon: '▤',  label: 'Pipeline' },
    ]
  },
  {
    section: 'OPERATIONS',
    items: [
      { to: '/orders',          icon: '≡',  label: 'Orders' },
      { to: '/tracker',         icon: '◉',  label: 'Order Tracker' },
      { to: '/ops/production',  icon: '▶',  label: 'Production' },
      { to: '/orders/on-hold',  icon: '⏸',  label: 'Orders on Hold' },
      { to: '/inventory',       icon: '▦',  label: 'Inventory' },
      { to: '/ops',             icon: '⚙️', label: 'Ops / Warehouse' },
      { to: '/purchasing',      icon: '📦', label: 'Purchasing' },
      { to: '/freight',         icon: '▷',  label: 'Freight' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { to: '/reports',   icon: '▣',  label: 'Reports' },
      { to: '/settings',  icon: '◌',  label: 'Settings' },
    ]
  },
]

const NAV_SALES = [
  {
    section: 'MAIN',
    items: [
      { to: '/',          icon: '⌂',  label: 'Home' },
    ]
  },
  {
    section: 'SALES',
    items: [
      { to: '/customers', icon: '◎',  label: 'Customers' },
      { to: '/activities',icon: '◈',  label: 'Activities' },
    ]
  },
  {
    section: 'OPERATIONS',
    items: [
      { to: '/orders',    icon: '≡',  label: 'Orders' },
    ]
  },
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback,     setFeedback]     = useState('')
  const [sending,      setSending]      = useState(false)
  const [sent,         setSent]         = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/signin')
  }

  async function submitFeedback() {
    if (!feedback.trim()) return
    setSending(true)
    try {
      await fetch('/.netlify/functions/send-feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:  feedback.trim(),
          repName:  name,
          repEmail: profile?.email,
          role:     role,
          page:     location.pathname,
        }),
      })
      setSent(true)
      setFeedback('')
      setTimeout(() => { setSent(false); setShowFeedback(false) }, 2000)
    } catch (err) {
      console.error('Feedback error:', err)
    } finally {
      setSending(false)
    }
  }

  const role     = profile?.role || 'user'
  const isSales  = role === 'sales'
  const NAV      = isSales ? NAV_SALES : NAV_EXECUTIVE
  const name     = profile?.full_name || profile?.email?.split('@')[0] || 'User'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <aside className="w-52 min-w-[208px] h-screen flex flex-col bg-brand-dark border-r border-white/[0.06] overflow-y-auto">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-gold/20 border border-brand-gold/30
                          flex items-center justify-center flex-shrink-0">
            <span className="text-brand-gold font-display font-bold text-sm">W</span>
          </div>
          <div>
            <div className="text-white font-display font-bold text-sm leading-tight tracking-wide">
              WRANGL
            </div>
            <div className="text-stone-500 text-[10px] tracking-wider uppercase">
              Berkely Distribution
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(group => (
          <div key={group.section} className="mb-2">
            <div className="px-3 py-1.5 text-[9px] font-bold tracking-[0.15em] text-stone-600 uppercase">
              {group.section}
            </div>
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'active' : ''}`
                }
              >
                <span className="text-base w-5 text-center leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-gold/20 border border-brand-gold/30
                          flex items-center justify-center flex-shrink-0">
            <span className="text-brand-gold text-xs font-bold">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white text-xs font-semibold truncate">{name}</div>
            <div className="text-stone-500 text-[10px] capitalize">{role}</div>
          </div>
        </div>

        {/* Feedback button */}
        <button
          onClick={() => setShowFeedback(true)}
          className="w-full text-left text-stone-400 hover:text-stone-200 text-xs
                     py-1.5 px-2 rounded-lg hover:bg-white/5 transition-all duration-150 mb-1
                     flex items-center gap-2"
        >
          <span>💬</span> Send Feedback
        </button>

        <button
          onClick={handleSignOut}
          className="w-full text-left text-stone-500 hover:text-stone-300 text-xs
                     py-1.5 px-2 rounded-lg hover:bg-white/5 transition-all duration-150"
        >
          Sign out
        </button>
      </div>

      {/* Feedback modal */}
      {showFeedback && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-stone-800">Send Feedback</h3>
              <button onClick={() => setShowFeedback(false)} className="text-stone-400 hover:text-stone-600 text-xl leading-none">✕</button>
            </div>
            <p className="text-xs text-stone-400 mb-4">
              Share anything — bugs, ideas, confusing parts, or things you'd like to see. David will see this directly.
            </p>
            {sent ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-sm font-semibold text-emerald-700">Feedback sent — thanks!</p>
              </div>
            ) : (
              <>
                <textarea
                  className="w-full border border-stone-200 rounded-xl p-3 text-sm text-stone-700
                             focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold/50
                             resize-none h-32"
                  placeholder="What's on your mind?"
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setShowFeedback(false)}
                    className="flex-1 py-2 px-4 rounded-xl border border-stone-200 text-sm text-stone-500 hover:bg-stone-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitFeedback}
                    disabled={sending || !feedback.trim()}
                    className="flex-1 py-2 px-4 rounded-xl bg-brand-dark text-white text-sm font-semibold
                               hover:bg-brand-dark/90 disabled:opacity-40 transition-colors"
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
