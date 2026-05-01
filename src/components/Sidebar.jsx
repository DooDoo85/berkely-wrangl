import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

// Dark forest green palette
const SIDEBAR_BG       = 'bg-[#0f3d2e]'      // main bg
const SIDEBAR_BORDER   = 'border-[#1a5240]'  // dividers
const HOVER_BG         = 'hover:bg-[#1a5240]'
const ACTIVE_BG        = 'bg-[#1a5240]'
const ACTIVE_PRIMARY   = 'bg-[#2a7a5a]'      // selected page
const TEXT_DEFAULT     = 'text-[#a8c9b8]'    // muted green-white
const TEXT_HOVER       = 'hover:text-white'
const TEXT_ACTIVE      = 'text-white'

const EXEC_NAV = [
  { to: '/', icon: '🏠', label: 'Home', exact: true },
  {
    label: 'Orders', icon: '📋', group: true,
    children: [
      { to: '/orders',         label: 'All Orders'     },
      { to: '/ops/production', label: 'Production'     },
      { to: '/orders/on-hold', label: 'Orders on Hold' },
    ],
  },
  { to: '/customers',  icon: '👥', label: 'Customers'  },
  { to: '/activities', icon: '📝', label: 'Activities' },
  { to: '/calendar',   icon: '📅', label: 'Calendar'   },
  { to: '/inventory',  icon: '📦', label: 'Inventory'  },
  {
    label: 'Ops / Warehouse', icon: '🏭', group: true,
    children: [
      { to: '/ops',        label: 'Warehouse'  },
      { to: '/purchasing', label: 'Purchasing' },
      { to: '/freight',    label: 'Freight'    },
    ],
  },
  {
    label: 'Quotes', icon: '💬', group: true,
    children: [
      { to: '/quotes',     label: 'All Quotes' },
      { to: '/quotes/new', label: 'New Quote'  },
    ],
  },
  { to: '/reports', icon: '📊', label: 'Reports' },
]

const SALES_NAV = [
  { to: '/', icon: '🏠', label: 'Home', exact: true },
  {
    label: 'Orders', icon: '📋', group: true,
    children: [
      { to: '/orders', label: 'All Orders' },
    ],
  },
  { to: '/customers',  icon: '👥', label: 'Customers'  },
  { to: '/activities', icon: '📝', label: 'Activities' },
  { to: '/calendar',   icon: '📅', label: 'Calendar'   },
  {
    label: 'Quotes', icon: '💬', group: true,
    children: [
      { to: '/quotes',     label: 'All Quotes' },
      { to: '/quotes/new', label: 'New Quote'  },
    ],
  },
]

export default function Sidebar() {
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const role = profile?.role
  const NAV = (role === 'sales') ? SALES_NAV : EXEC_NAV

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {}
    NAV.forEach(item => {
      if (item.group) {
        initial[item.label] = item.children.some(c =>
          location.pathname === c.to || location.pathname.startsWith(c.to + '/')
        )
      }
    })
    return initial
  })

  const toggleGroup = (label) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const isGroupActive = (children) =>
    children.some(c => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))

  return (
    <div className={`w-56 ${SIDEBAR_BG} text-white flex flex-col h-full flex-shrink-0`}>
      {/* Header */}
      <div className={`px-5 py-5 border-b ${SIDEBAR_BORDER}`}>
        <div className="text-lg font-semibold text-white tracking-tight">🐄 Wrangl</div>
        <div className={`text-xs ${TEXT_DEFAULT} mt-0.5`}>Berkely Distribution</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {NAV.map((item) => {
          if (item.group) {
            const open   = openGroups[item.label]
            const active = isGroupActive(item.children)
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150
                    ${active ? `${TEXT_ACTIVE} ${ACTIVE_BG}` : `${TEXT_DEFAULT} ${TEXT_HOVER} ${HOVER_BG}`}`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-sm">{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  <span className={`text-[10px] transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
                </button>
                {open && (
                  <div className={`ml-5 mt-0.5 space-y-0.5 border-l ${SIDEBAR_BORDER} pl-3`}>
                    {item.children.map(child => (
                      <NavLink key={child.to} to={child.to}
                        className={({ isActive }) =>
                          `block px-2.5 py-1.5 rounded text-xs transition-colors duration-150
                          ${isActive ? `${TEXT_ACTIVE} ${ACTIVE_PRIMARY} font-medium` : `${TEXT_DEFAULT} ${TEXT_HOVER} ${HOVER_BG}`}`
                        }>
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          return (
            <NavLink key={item.to} to={item.to} end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-150
                ${isActive ? `${ACTIVE_PRIMARY} ${TEXT_ACTIVE} font-medium` : `${TEXT_DEFAULT} ${TEXT_HOVER} ${HOVER_BG}`}`
              }>
              <span className="text-sm">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}

        {/* Inventory sub-links (exec only) */}
        {role !== 'sales' && location.pathname.startsWith('/inventory') && (
          <div className={`ml-5 mt-0.5 space-y-0.5 border-l ${SIDEBAR_BORDER} pl-3`}>
            <NavLink to="/inventory/committed-import"
              className={({ isActive }) => `block px-2.5 py-1.5 rounded text-xs transition-colors duration-150
                ${isActive ? `${TEXT_ACTIVE} ${ACTIVE_PRIMARY} font-medium` : `${TEXT_DEFAULT} ${TEXT_HOVER} ${HOVER_BG}`}`}>
              Committed Import
            </NavLink>
            <NavLink to="/inventory/match-review"
              className={({ isActive }) => `block px-2.5 py-1.5 rounded text-xs transition-colors duration-150
                ${isActive ? `${TEXT_ACTIVE} ${ACTIVE_PRIMARY} font-medium` : `${TEXT_DEFAULT} ${TEXT_HOVER} ${HOVER_BG}`}`}>
              Match Review
            </NavLink>
            <NavLink to="/inventory/price-grids"
              className={({ isActive }) => `block px-2.5 py-1.5 rounded text-xs transition-colors duration-150
                ${isActive ? `${TEXT_ACTIVE} ${ACTIVE_PRIMARY} font-medium` : `${TEXT_DEFAULT} ${TEXT_HOVER} ${HOVER_BG}`}`}>
              Price Grids
            </NavLink>
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className={`px-4 py-3 border-t ${SIDEBAR_BORDER}`}>
        <div className="text-xs text-white/90 truncate font-medium">{profile?.full_name || profile?.email}</div>
        <div className={`text-xs ${TEXT_DEFAULT} truncate mt-0.5`}>{profile?.email}</div>
        <button onClick={signOut}
          className={`mt-2 text-xs ${TEXT_DEFAULT} ${TEXT_HOVER} text-left transition-colors duration-150`}>
          Sign out →
        </button>
      </div>
    </div>
  )
}
