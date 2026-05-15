import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import MoreDrawer from './MoreDrawer'

// ═══════════════════════════════════════════════════════════════════════
// MobileBottomNav — fixed bottom navigation for mobile viewports
//
// Five slots: Home · Customers · LOG (raised) · Orders · More
//
// LOG is the action button — larger, centered, accent-colored. Tapping
// it routes to /activities/new which opens the activity form, regardless
// of which page the user is currently on.
//
// More opens a slide-up drawer with everything else (Reports, Inventory,
// Calendar, Settings, etc.) so any future page slots in without
// redesigning the nav.
//
// Active state determined by current pathname.
// ═══════════════════════════════════════════════════════════════════════

const NAV_ITEMS = [
  { to: '/',          label: 'Home',      icon: HomeIcon,      matchPaths: ['/', '/dashboard'] },
  { to: '/customers', label: 'Customers', icon: CustomersIcon, matchPaths: ['/customers'] },
  // [3rd slot is the Log button — handled specially in render]
  { to: '/orders',    label: 'Orders',    icon: OrdersIcon,    matchPaths: ['/orders'] },
  // [5th slot is More — opens drawer]
]

function isActive(pathname, item) {
  return item.matchPaths.some((p) => {
    if (p === '/') return pathname === '/'
    return pathname === p || pathname.startsWith(p + '/')
  })
}

export default function MobileBottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-end justify-around
                   border-t shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
        style={{
          background: '#f4eee2',
          borderColor: 'rgba(92,67,42,0.10)',
          // iOS safe-area inset so the nav doesn't sit under the home indicator
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Slot 1 — Home */}
        <NavButton item={NAV_ITEMS[0]} active={isActive(location.pathname, NAV_ITEMS[0])} onClick={() => navigate(NAV_ITEMS[0].to)} />

        {/* Slot 2 — Customers */}
        <NavButton item={NAV_ITEMS[1]} active={isActive(location.pathname, NAV_ITEMS[1])} onClick={() => navigate(NAV_ITEMS[1].to)} />

        {/* Slot 3 — LOG (raised center button) */}
        <button
          onClick={() => navigate('/activities/new')}
          aria-label="Log activity"
          className="relative flex flex-col items-center justify-center
                     transition-transform active:scale-95"
          style={{ width: 64, height: 64, marginTop: -20 }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center
                       shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
            style={{
              background: 'linear-gradient(135deg, #c89860 0%, #9d4f30 100%)',
              color: '#1a0f08',
            }}
          >
            <PlusIcon />
          </div>
          <span
            className="text-[10px] font-semibold uppercase tracking-wider mt-1"
            style={{ color: '#5a3a24' }}
          >
            Log
          </span>
        </button>

        {/* Slot 4 — Orders */}
        <NavButton item={NAV_ITEMS[2]} active={isActive(location.pathname, NAV_ITEMS[2])} onClick={() => navigate(NAV_ITEMS[2].to)} />

        {/* Slot 5 — More */}
        <NavButton
          item={{ label: 'More', icon: MoreIcon }}
          active={moreOpen}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}

// ─── Standard nav button ────────────────────────────────────────────
function NavButton({ item, active, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      className="flex flex-col items-center justify-center gap-1 transition-colors
                 active:scale-95"
      style={{
        width: 64,
        height: 64,
        color: active ? '#5a3a24' : '#8c7758',
      }}
    >
      <Icon active={active} />
      <span className={`text-[11px] ${active ? 'font-semibold' : 'font-medium'}`}>
        {item.label}
      </span>
    </button>
  )
}

// ─── Icons (inline SVG so no extra dependency) ──────────────────────
function HomeIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M3 11l9-8 9 8v10a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2V11z" strokeLinejoin="round" />
    </svg>
  )
}

function CustomersIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15 20c0-2 1.5-4 4-4s4 1.5 4 3.5" strokeLinecap="round" />
    </svg>
  )
}

function OrdersIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round" />
    </svg>
  )
}

function MoreIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
