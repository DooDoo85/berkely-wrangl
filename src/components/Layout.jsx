import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import FeedbackButton from './FeedbackButton'
import ImpersonationBanner from './ImpersonationBanner'
import NotificationBell from './NotificationBell'

// ═══════════════════════════════════════════════════════════════════════
// Page classification — determines visual intensity (executive ←→ utility)
//
//   executive   → strongest identity, paper grain, warmer cards
//   operational → flatter, white cards on paper bg, readability-first
//   utility     → minimal, near-white, maximum density
//
// Default for unclassified routes is "operational" (safest middle).
// ═══════════════════════════════════════════════════════════════════════
const EXECUTIVE_ROUTES = new Set([
  '/',
  '/dashboard',
  '/reports/sales-activity',
  '/reports/faux-usage',
  '/reports/production',
  '/reports/inventory-health',
  '/reports/order-status',
])

const UTILITY_ROUTES_PREFIX = [
  '/inventory/match-review',
  '/inventory/committed-import',
  '/inventory/price-grids',
  '/ops/cycle-counts',
  '/system/',
  '/settings/',
]

function classifyPage(pathname) {
  if (EXECUTIVE_ROUTES.has(pathname)) return 'executive'
  for (const prefix of UTILITY_ROUTES_PREFIX) {
    if (pathname.startsWith(prefix)) return 'utility'
  }
  return 'operational'
}

const PAGE_TITLES = {
  '/':           'Home',
  '/customers':  'Customers',
  '/activities': 'Activities',
  '/pipeline':   'Pipeline',
  '/orders':     'Orders',
  '/tracker':    'Order Tracker',
  '/inventory':  'Inventory',
  '/freight':    'Freight',
  '/reports':    'Reports',
  '/settings':   'Settings',
}

export default function Layout() {
  const location = useLocation()
  const title    = PAGE_TITLES[location.pathname] || 'Berkely Wrangl'
  const pageMode = classifyPage(location.pathname)

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Impersonation banner — only when an owner is viewing-as another user */}
      <ImpersonationBanner />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top bar — parchment matching page, single hairline border below */}
          <header
            className="h-14 min-h-[56px] flex items-center justify-between px-6 flex-shrink-0 border-b"
            style={{
              background: '#f4eee2',
              borderColor: 'rgba(92,67,42,0.10)',
            }}
          >
            <h1 className="text-base font-semibold text-ink-strong" style={{ fontFamily: 'Inter' }}>
              {title}
            </h1>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <span className="text-xs text-ink-muted">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </span>
            </div>
          </header>

          {/* Page content — receives page-mode via data attribute,
              which drives all the CSS custom-property switching */}
          <main
            data-page-mode={pageMode}
            className="flex-1 overflow-y-auto page-surface"
          >
            <div className="page-enter">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <FeedbackButton />
    </div>
  )
}
