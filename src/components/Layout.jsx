import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileBottomNav from './MobileBottomNav'
import InstallPrompt from './InstallPrompt'
import FeedbackButton from './FeedbackButton'
import ImpersonationBanner from './ImpersonationBanner'
import NotificationBell from './NotificationBell'
import ErrorBoundary from './ErrorBoundary'
import { useIsMobile } from '../hooks/useIsMobile'
import { useUsageTracking } from '../hooks/useUsageTracking'

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
  const isMobile = useIsMobile()
  const title    = PAGE_TITLES[location.pathname] || 'Berkely Wrangl'
  const pageMode = classifyPage(location.pathname)

  // Fire usage_events.pageview on every route change.
  // Owner-only readable per RLS — see usage_analytics_migration.sql.
  useUsageTracking()

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Impersonation banner — only when an owner is viewing-as another user */}
      <ImpersonationBanner />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — desktop only. Hidden on mobile in favor of bottom nav. */}
        {!isMobile && <Sidebar />}

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top bar — same on both, with mobile-friendly adjustments */}
          <header
            className={`h-14 min-h-[56px] flex items-center justify-between flex-shrink-0 border-b ${isMobile ? 'px-4' : 'px-6'}`}
            style={{
              background: '#f4eee2',
              borderColor: 'rgba(92,67,42,0.10)',
            }}
          >
            {/* Mobile: small Wrangl badge on the left so brand stays visible */}
            {isMobile ? (
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #c89860 0%, #9d4f30 100%)',
                    color: '#1a0f08',
                    fontFamily: 'Merriweather, Georgia, serif',
                    fontWeight: 700,
                    fontSize: '14px',
                    lineHeight: 1,
                  }}
                >
                  W
                </div>
                <h1 className="text-base font-semibold text-ink-strong truncate" style={{ fontFamily: 'Inter' }}>
                  {title}
                </h1>
              </div>
            ) : (
              <h1 className="text-base font-semibold text-ink-strong" style={{ fontFamily: 'Inter' }}>
                {title}
              </h1>
            )}

            <div className="flex items-center gap-3 flex-shrink-0">
              <NotificationBell />
              {/* Date hidden on mobile to save horizontal space */}
              {!isMobile && (
                <span className="text-xs text-ink-muted">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </span>
              )}
            </div>
          </header>

          {/* Page content — receives page-mode via data attribute,
              which drives all the CSS custom-property switching.
              Bottom padding on mobile so content doesn't hide behind bottom nav. */}
          <main
            data-page-mode={pageMode}
            className="flex-1 overflow-y-auto page-surface"
            style={isMobile ? { paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' } : undefined}
          >
            <div className="page-enter">
              {/* ErrorBoundary catches render crashes per-page, so a buggy page
                  shows a friendly error UI instead of blanking the whole app.
                  key={pathname} resets the boundary when the user navigates,
                  so a crash on /activities doesn't persist after going to /home. */}
              <ErrorBoundary key={location.pathname} where={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile-only: bottom nav + install prompt */}
      {isMobile && <MobileBottomNav />}
      {isMobile && <InstallPrompt />}

      {/* FeedbackButton — desktop only. On mobile it'd conflict with the bottom nav. */}
      {!isMobile && <FeedbackButton />}
    </div>
  )
}
