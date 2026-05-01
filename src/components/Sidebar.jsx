import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

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
    <div className="w-56 bg-gray-900 text-white flex flex-col h-full flex-shrink-0">
      <div className="px-4 py-4 border-b border-gray-700">
        <div className="text-lg font-bold text-white tracking-tight">🐄 Wrangl</div>
        <div className="text-xs text-gray-400">Berkely Distribution</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {NAV.map((item) => {
          if (item.group) {
            const open   = openGroups[item.label]
            const active = isGroupActive(item.children)
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${active ? 'text-white bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}
                >
                  <span className="flex items-center gap-2">
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  <span className={`text-xs transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
                </button>
                {open && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-700 pl-3">
                    {item.children.map(child => (
                      <NavLink key={child.to} to={child.to}
                        className={({ isActive }) =>
                          `block px-2 py-1.5 rounded text-xs transition-colors
                          ${isActive ? 'text-white bg-gray-600 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`
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
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                ${isActive ? 'bg-blue-600 text-white font-medium' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`
              }>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}

        {role !== 'sales' && location.pathname.startsWith('/inventory') && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-700 pl-3">
            <NavLink to="/inventory/committed-import"
              className={({ isActive }) => `block px-2 py-1.5 rounded text-xs transition-colors
                ${isActive ? 'text-white bg-gray-600 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              Committed Import
            </NavLink>
            <NavLink to="/inventory/match-review"
              className={({ isActive }) => `block px-2 py-1.5 rounded text-xs transition-colors
                ${isActive ? 'text-white bg-gray-600 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              Match Review
            </NavLink>
            <NavLink to="/inventory/price-grids"
              className={({ isActive }) => `block px-2 py-1.5 rounded text-xs transition-colors
                ${isActive ? 'text-white bg-gray-600 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              Price Grids
            </NavLink>
          </div>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-gray-700">
        <div className="text-xs text-gray-400 truncate mb-1">{profile?.email}</div>
        <div className="text-xs text-gray-600 mb-2 capitalize">{role}</div>
        <button onClick={signOut}
          className="w-full text-xs text-gray-400 hover:text-white text-left transition-colors">
          Sign out
        </button>
      </div>
    </div>
  )
}
