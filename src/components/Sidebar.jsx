import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

// Deep forest green palette
const BG_BASE       = 'bg-[#0a2e22]'
const BG_HOVER      = 'hover:bg-[#143f30]'
const BG_ACTIVE     = 'bg-[#1f6b4d]'
const BG_GROUP_OPEN = 'bg-[#143f30]'
const BORDER        = 'border-[#143f30]'
const TEXT_MUTED    = 'text-[#9bb8a8]'
const TEXT_HOVER    = 'hover:text-white'
const TEXT_SECTION  = 'text-[#5e8a75]'

// ── Nav structure ─────────────────────────────────────────────────────────────
// type: 'section' → non-collapsible section header
// type: 'link'    → single nav item
// type: 'group'   → collapsible group with children

const EXEC_NAV = [
  { type: 'link', to: '/', icon: '🏠', label: 'Home', exact: true },

  // ── SALES ──
  { type: 'section', label: 'Sales' },
  { type: 'link', to: '/customers',  icon: '👥', label: 'Customers'  },
  { type: 'link', to: '/activities', icon: '📝', label: 'Activities' },
  { type: 'link', to: '/calendar',   icon: '📅', label: 'Calendar'   },
  {
    type: 'group', label: 'Quotes', icon: '💬',
    children: [
      { to: '/quotes',     label: 'All Quotes' },
      { to: '/quotes/new', label: 'New Quote'  },
    ],
  },
  {
    type: 'group', label: 'Orders', icon: '📋',
    children: [
      { to: '/orders',         label: 'All Orders'     },
      { to: '/orders/on-hold', label: 'Orders on Hold' },
    ],
  },

  // ── OPERATIONS ──
  { type: 'section', label: 'Operations' },
  {
    type: 'group', label: 'Inventory', icon: '📦',
    children: [
      { to: '/inventory',             label: 'All Parts'   },
      { to: '/inventory/fabrics',     label: 'Fabrics'     },
      { to: '/inventory/components',  label: 'Components'  },
      { to: '/inventory/extrusions',  label: 'Extrusions'  },
      { to: '/inventory/faux-blinds', label: 'Faux Blinds' },
    ],
  },
  {
    type: 'group', label: 'Production', icon: '🏭',
    children: [
      { to: '/ops/production', label: 'Production Board' },
      { to: '/ops',            label: 'Warehouse'        },
      { to: '/purchasing',     label: 'Purchasing'       },
      { to: '/freight',        label: 'Freight'          },
    ],
  },

  // ── INSIGHTS ──
  { type: 'section', label: 'Insights' },
  {
    type: 'group', label: 'Reports', icon: '📊',
    children: [
      { to: '/reports',                 label: 'Overview'       },
      { to: '/reports/sales-activity',  label: 'Sales Activity' },
      { to: '/reports/production',      label: 'Production'     },
      { to: '/reports/rep-activity',    label: 'Rep Activity'   },
    ],
  },

  // ── SYSTEM ──
  { type: 'section', label: 'System' },
  { type: 'link', to: '/inventory/committed-import', icon: '📥', label: 'Committed Import' },
  { type: 'link', to: '/inventory/match-review',     icon: '🔍', label: 'Match Review'     },
  { type: 'link', to: '/inventory/price-grids',      icon: '💲', label: 'Price Grids'      },
]

const SALES_NAV = [
  { type: 'link', to: '/', icon: '🏠', label: 'Home', exact: true },

  // ── SALES ──
  { type: 'section', label: 'Sales' },
  { type: 'link', to: '/customers',  icon: '👥', label: 'Customers'  },
  { type: 'link', to: '/activities', icon: '📝', label: 'Activities' },
  { type: 'link', to: '/calendar',   icon: '📅', label: 'Calendar'   },
  {
    type: 'group', label: 'Quotes', icon: '💬',
    children: [
      { to: '/quotes',     label: 'All Quotes' },
      { to: '/quotes/new', label: 'New Quote'  },
    ],
  },
  {
    type: 'group', label: 'Orders', icon: '📋',
    children: [
      { to: '/orders', label: 'All Orders' },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(profile) {
  if (profile?.full_name) {
    const parts = profile.full_name.trim().split(/\s+/)
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
  }
  if (profile?.email) return profile.email.slice(0, 2).toUpperCase()
  return '··'
}

function roleLabel(role) {
  if (role === 'sales')  return 'Sales Representative'
  if (role === 'admin')  return 'Executive'
  return role || ''
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const role = profile?.role
  const NAV = (role === 'sales') ? SALES_NAV : EXEC_NAV

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {}
    NAV.forEach(item => {
      if (item.type === 'group') {
        initial[item.label] = item.children.some(c =>
          location.pathname === c.to || location.pathname.startsWith(c.to + '/')
        )
      }
    })
    return initial
  })

  const toggleGroup = (label) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const isGroupActive = (item) =>
    item.children.some(c => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))

  return (
    <div className={`w-60 ${BG_BASE} text-white flex flex-col h-full flex-shrink-0`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐄</span>
          <span className="text-lg font-bold text-white tracking-tight">Wrangl</span>
        </div>
        <div className={`text-xs ${TEXT_MUTED} mt-0.5`}>Berkely Distribution</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {NAV.map((item, idx) => {

          {/* Section header */}
          if (item.type === 'section') {
            return (
              <div key={item.label} className="pt-5 pb-1.5 px-3">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${TEXT_SECTION}`}>
                  {item.label}
                </span>
              </div>
            )
          }

          {/* Collapsible group */}
          if (item.type === 'group') {
            const open   = openGroups[item.label]
            const active = isGroupActive(item)
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors duration-150
                    ${active ? `text-white ${BG_GROUP_OPEN}` : `${TEXT_MUTED} ${TEXT_HOVER} ${BG_HOVER}`}`}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-base">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </span>
                  <span className={`text-[10px] transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>›</span>
                </button>
                {open && (
                  <div className="ml-9 mt-0.5 space-y-0.5">
                    {item.children.map(child => (
                      <NavLink key={child.to} to={child.to}
                        className={({ isActive }) =>
                          `block px-3 py-1.5 rounded-md text-xs transition-colors duration-150
                          ${isActive ? `text-white ${BG_ACTIVE} font-medium` : `${TEXT_MUTED} ${TEXT_HOVER} ${BG_HOVER}`}`
                        }>
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          {/* Single nav link */}
          return (
            <NavLink key={item.to} to={item.to} end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors duration-150
                ${isActive ? `${BG_ACTIVE} text-white font-medium` : `${TEXT_MUTED} ${TEXT_HOVER} ${BG_HOVER}`}`
              }>
              <span className="text-base">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* User footer */}
      <div className={`px-4 py-4 border-t ${BORDER}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#1f6b4d] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {getInitials(profile)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white truncate font-medium">{profile?.email}</div>
            <div className={`text-[11px] ${TEXT_MUTED} truncate`}>{roleLabel(role)}</div>
          </div>
        </div>
        <button onClick={signOut}
          className={`flex items-center gap-2 text-xs ${TEXT_MUTED} ${TEXT_HOVER} transition-colors duration-150`}>
          <span>↪</span> Sign out
        </button>
      </div>
    </div>
  )
}
