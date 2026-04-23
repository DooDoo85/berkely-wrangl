import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

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
  const title = PAGE_TITLES[location.pathname] || 'Berkely Wrangl'

  return (
    <div className="flex h-screen overflow-hidden bg-brand-cream">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 min-h-[56px] bg-white border-b border-stone-200
                           flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-base font-semibold text-stone-800">{title}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400">
              {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
