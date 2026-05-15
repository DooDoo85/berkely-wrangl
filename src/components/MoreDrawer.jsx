import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

// ═══════════════════════════════════════════════════════════════════════
// MoreDrawer — slide-up bottom sheet triggered by the "More" tab
//
// Shows all the pages that don't fit in the 4 primary nav slots.
// Role-aware: sales reps see fewer items than executives.
//
// Sections mirror the desktop sidebar grouping so the mental model
// stays consistent between platforms.
// ═══════════════════════════════════════════════════════════════════════

// Map role → set of available items in the drawer.
// Items already in the bottom nav (Home, Customers, Orders) are excluded.
function getDrawerSections(role) {
  const isSales       = role === 'sales' || role === 'sales_rep'
  const isProduction  = role === 'production'
  const isExecOrOwner = role === 'owner' || role === 'admin' || role === 'executive'

  if (isSales) {
    return [
      {
        label: 'Sales',
        items: [
          { to: '/activities',     icon: '📝', label: 'Activities' },
          { to: '/calendar',       icon: '📅', label: 'Calendar' },
          { to: '/my-quotes',      icon: '💬', label: 'My Open Quotes' },
        ],
      },
    ]
  }

  if (isProduction) {
    return [
      {
        label: 'Operations',
        items: [
          { to: '/inventory',             icon: '📦', label: 'Inventory' },
          { to: '/ops/production',        icon: '🏭', label: 'Start Production' },
          { to: '/orders/on-hold',        icon: '🚧', label: 'Orders on Hold' },
          { to: '/ops',                   icon: '🏬', label: 'Warehouse' },
          { to: '/ops/receive',           icon: '📥', label: 'Receive Stock' },
          { to: '/ops/cycle-counts',      icon: '🔄', label: 'Cycle Counts' },
          { to: '/purchasing',            icon: '🛒', label: 'Purchasing' },
        ],
      },
    ]
  }

  // Executive / Owner / Admin — full menu
  return [
    {
      label: 'Sales',
      items: [
        { to: '/activities',     icon: '📝', label: 'Activities' },
        { to: '/calendar',       icon: '📅', label: 'Calendar' },
        { to: '/orders/on-hold', icon: '🚧', label: 'Orders on Hold' },
      ],
    },
    {
      label: 'Operations',
      items: [
        { to: '/inventory',        icon: '📦', label: 'Inventory' },
        { to: '/ops/production',   icon: '🏭', label: 'Production' },
        { to: '/ops',              icon: '🏬', label: 'Warehouse' },
        { to: '/ops/cycle-counts', icon: '🔄', label: 'Cycle Counts' },
        { to: '/purchasing',       icon: '🛒', label: 'Purchasing' },
        { to: '/freight',          icon: '🚚', label: 'Freight' },
      ],
    },
    {
      label: 'Insights',
      items: [
        { to: '/reports/sales-activity', icon: '📊', label: 'Sales Activity' },
      ],
    },
    {
      label: 'System',
      items: [
        { to: '/system/users',               icon: '👤', label: 'Users',            ownerOnly: true },
        { to: '/system/tickets',             icon: '💬', label: 'Feedback Tickets' },
        { to: '/inventory/committed-import', icon: '📥', label: 'Committed Import' },
        { to: '/inventory/match-review',     icon: '🔍', label: 'Match Review' },
        { to: '/inventory/price-grids',      icon: '💲', label: 'Price Grids' },
      ],
    },
  ]
}

export default function MoreDrawer({ open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const role = profile?.role

  const sections = getDrawerSections(role)

  // ESC key to close + body scroll lock while open
  useEffect(() => {
    if (!open) return

    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)

    // Lock body scroll so the drawer doesn't scroll the page underneath
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const handleNavigate = (to) => {
    navigate(to)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <button
        onClick={onClose}
        aria-label="Close menu"
        className="absolute inset-0 bg-black/40 animate-fade-in"
        style={{ animation: 'fadeIn 200ms ease' }}
      />

      {/* Sheet */}
      <div
        className="relative w-full rounded-t-2xl flex flex-col"
        style={{
          background: '#f4eee2',
          maxHeight: '85vh',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          animation: 'slideUp 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(92,67,42,0.20)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b" style={{ borderColor: 'rgba(92,67,42,0.10)' }}>
          <h2 className="text-base font-semibold" style={{ color: '#1e1410', fontFamily: 'Inter' }}>
            Menu
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'rgba(92,67,42,0.06)', color: '#5a3a24' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Scrollable section list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {sections.map((section) => (
            <div key={section.label} className="mb-4">
              <div
                className="px-3 pt-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: '#8c7758' }}
              >
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items
                  .filter((it) => !it.ownerOnly || role === 'owner')
                  .map((it) => {
                    const active = location.pathname === it.to ||
                                   (it.to !== '/' && location.pathname.startsWith(it.to + '/'))
                    return (
                      <button
                        key={it.to}
                        onClick={() => handleNavigate(it.to)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                                   transition-colors active:scale-[0.99]"
                        style={{
                          background: active ? 'rgba(200,152,96,0.12)' : 'transparent',
                          color: active ? '#5a3a24' : '#1e1410',
                        }}
                      >
                        <span className="text-lg w-6 text-center">{it.icon}</span>
                        <span className={`text-sm flex-1 text-left ${active ? 'font-semibold' : 'font-medium'}`}>
                          {it.label}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.4 }}>
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}

          {/* User footer */}
          <div className="border-t pt-3 mt-2 px-3" style={{ borderColor: 'rgba(92,67,42,0.10)' }}>
            <div className="flex items-center gap-3 px-1 pb-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #c89860 0%, #9d4f30 100%)',
                  color: '#1a0f08',
                }}
              >
                {getInitials(profile)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: '#1e1410' }}>
                  {profile?.full_name || profile?.email}
                </div>
                <div className="text-xs truncate" style={{ color: '#8c7758' }}>
                  {profile?.email}
                </div>
              </div>
            </div>
            <button
              onClick={() => { onClose(); signOut() }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg
                         text-sm font-medium transition-colors active:scale-[0.99]"
              style={{
                background: 'rgba(92,67,42,0.06)',
                color: '#5a3a24',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 12H3M9 6l-6 6 6 6" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  )
}

function getInitials(profile) {
  if (profile?.full_name) {
    const parts = profile.full_name.trim().split(/\s+/)
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
  }
  if (profile?.email) return profile.email.slice(0, 2).toUpperCase()
  return '··'
}
