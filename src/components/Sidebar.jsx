import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

// Old western — worn saddle leather
const BG_BASE       = 'bg-[#261810]'
const BG_HOVER      = 'hover:bg-[#382618]'
const BG_ACTIVE     = 'bg-[#5a3a24]'
const BG_GROUP_OPEN = 'bg-[#382618]'
const BORDER        = 'border-[#382618]'
const TEXT_MUTED    = 'text-[#b89878]'
const TEXT_HOVER    = 'hover:text-[#f5e6d0]'
const TEXT_SECTION  = 'text-[#d4aa70]'

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
      { to: '/ops/production', label: 'Start Production' },
      { to: '/ops',            label: 'Warehouse'        },
      { to: '/purchasing',     label: 'Purchasing'       },
      { to: '/freight',        label: 'Freight'          },
    ],
  },

  // ── INSIGHTS ── (collapsible)
  {
    type: 'section', label: 'Insights', collapsible: true,
    items: [
      {
        type: 'group', label: 'Reports', icon: '📊',
        children: [
          { to: '/reports',                 label: 'Overview'       },
          { to: '/reports/sales-activity',  label: 'Sales Activity' },
          { to: '/reports/production',      label: 'Production'     },
          { to: '/reports/rep-activity',    label: 'Rep Activity'   },
        ],
      },
    ],
  },

  // ── SYSTEM ── (collapsible)
  {
    type: 'section', label: 'System', collapsible: true,
    items: [
      { type: 'link', to: '/inventory/committed-import', icon: '📥', label: 'Committed Import' },
      { type: 'link', to: '/inventory/match-review',     icon: '🔍', label: 'Match Review'     },
      { type: 'link', to: '/inventory/price-grids',      icon: '💲', label: 'Price Grids'      },
    ],
  },
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
    const scanItems = (items) => {
      items.forEach(item => {
        if (item.type === 'group') {
          initial[item.label] = item.children.some(c =>
            location.pathname === c.to || location.pathname.startsWith(c.to + '/')
          )
        }
        if (item.type === 'section' && item.items) {
          scanItems(item.items)
        }
      })
    }
    scanItems(NAV)
    return initial
  })

  const [openSections, setOpenSections] = useState(() => {
    const initial = {}
    NAV.forEach(item => {
      if (item.type === 'section' && item.collapsible) {
        // Auto-open if any child route is active
        const isActive = (item.items || []).some(sub => {
          if (sub.type === 'link') return location.pathname === sub.to || location.pathname.startsWith(sub.to + '/')
          if (sub.type === 'group') return sub.children.some(c => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))
          return false
        })
        initial[item.label] = isActive
      }
    })
    return initial
  })

  const toggleGroup = (label) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const toggleSection = (label) =>
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }))

  const isGroupActive = (item) =>
    item.children.some(c => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))

  function renderNavItem(item) {
    if (item.type === 'group') {
      const open   = openGroups[item.label]
      const active = isGroupActive(item)
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleGroup(item.label)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors duration-150
              ${active ? `text-[#f5e6d0] ${BG_GROUP_OPEN}` : `${TEXT_MUTED} ${TEXT_HOVER} ${BG_HOVER}`}`}
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
                    ${isActive ? `text-[#f5e6d0] ${BG_ACTIVE} font-medium` : `${TEXT_MUTED} ${TEXT_HOVER} ${BG_HOVER}`}`
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
          `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150
          ${isActive ? `${BG_ACTIVE} text-[#f5e6d0] font-medium` : `${TEXT_MUTED} ${TEXT_HOVER} ${BG_HOVER}`}`
        }>
        <span className="text-base">{item.icon}</span>
        <span className="font-medium">{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div className={`w-60 ${BG_BASE} text-[#f5e6d0] flex flex-col h-full flex-shrink-0`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐄</span>
          <span className="text-lg font-bold text-[#f5e6d0] tracking-tight">Wrangl</span>
        </div>
        <div className={`text-xs ${TEXT_MUTED} mt-0.5`}>Berkely Distribution</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {NAV.map((item, idx) => {

          {/* Section header */}
          if (item.type === 'section') {
            const isCollapsible = item.collapsible
            const isOpen = !isCollapsible || openSections[item.label]
            return (
              <div key={item.label}>
                {isCollapsible ? (
                  <button
                    onClick={() => toggleSection(item.label)}
                    className="w-full pt-4 pb-1 px-3 flex items-center justify-between"
                  >
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest ${TEXT_SECTION}`}>
                      {item.label}
                    </span>
                    <span className={`text-[10px] ${TEXT_SECTION} transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                ) : (
                  <div className="pt-4 pb-1 px-3">
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest ${TEXT_SECTION} border-b border-[#4a3020] pb-1 block`}>
                      {item.label}
                    </span>
                  </div>
                )}
                {isOpen && item.items && (
                  <div className="space-y-0.5 mt-0.5">
                    {item.items.map(sub => renderNavItem(sub))}
                  </div>
                )}
              </div>
            )
          }

          return renderNavItem(item)
        })}
      </nav>

      {/* User footer */}
      <div className={`px-4 py-4 border-t ${BORDER}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#5a3a24] flex items-center justify-center text-[#f5e6d0] text-xs font-semibold flex-shrink-0">
            {getInitials(profile)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[#f5e6d0] truncate font-medium">{profile?.email}</div>
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
