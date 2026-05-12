import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

// ═══════════════════════════════════════════════════════════════════════
// Sidebar — premium dark brown with gradient, gold accent for active state
// Uses new design tokens; same nav structure as before.
// ═══════════════════════════════════════════════════════════════════════

const EXEC_NAV = [
  { type: 'link', to: '/', icon: '🏠', label: 'Home', exact: true },

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
      { to: '/ops/production',   label: 'Start Production' },
      { to: '/ops',              label: 'Warehouse'        },
      { to: '/ops/cycle-counts', label: 'Cycle Counts'     },
      { to: '/purchasing',       label: 'Purchasing'       },
      { to: '/freight',          label: 'Freight'          },
    ],
  },

  {
    type: 'section', label: 'Reports', collapsible: true,
    items: [
      {
        type: 'group', label: 'Reports', icon: '📊',
        children: [
          { to: '/reports/sales-activity', label: 'Sales Activity' },
          { to: '/reports/faux-usage',     label: 'Faux Usage'     },
        ],
      },
    ],
  },

  {
    type: 'section', label: 'System', collapsible: true,
    items: [
      { type: 'link', to: '/system/users',               icon: '👤', label: 'Users',             ownerOnly: true },
      { type: 'link', to: '/system/tickets',             icon: '💬', label: 'Feedback Tickets' },
      { type: 'link', to: '/inventory/committed-import', icon: '📥', label: 'Committed Import' },
      { type: 'link', to: '/inventory/match-review',     icon: '🔍', label: 'Match Review'     },
      { type: 'link', to: '/inventory/price-grids',      icon: '💲', label: 'Price Grids'      },
    ],
  },
]

const SALES_NAV = [
  { type: 'link', to: '/', icon: '🏠', label: 'Home', exact: true },
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
    children: [{ to: '/orders', label: 'All Orders' }],
  },
]

const PRODUCTION_NAV = [
  { type: 'link', to: '/', icon: '🏠', label: 'Home', exact: true },
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
      { to: '/ops/production',   label: 'Start Production' },
      { to: '/orders/on-hold',   label: 'Orders on Hold'   },
      { to: '/ops',              label: 'Warehouse'        },
      { to: '/ops/receive',      label: 'Receive Stock'    },
      { to: '/ops/cycle-counts', label: 'Cycle Counts'     },
      { to: '/purchasing',       label: 'Purchasing'       },
    ],
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────

function getInitials(profile) {
  if (profile?.full_name) {
    const parts = profile.full_name.trim().split(/\s+/)
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
  }
  if (profile?.email) return profile.email.slice(0, 2).toUpperCase()
  return '··'
}

function roleLabel(role) {
  if (role === 'owner')      return 'Owner'
  if (role === 'sales')      return 'Sales Representative'
  if (role === 'sales_rep')  return 'Sales Representative'
  if (role === 'executive')  return 'Executive'
  if (role === 'admin')      return 'Executive'
  if (role === 'production') return 'Production Lead'
  return role || ''
}

// ── Component ───────────────────────────────────────────────────────────

export default function Sidebar() {
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const role = profile?.role
  const NAV =
    (role === 'sales' || role === 'sales_rep') ? SALES_NAV :
    role === 'production'                       ? PRODUCTION_NAV :
                                                  EXEC_NAV

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {}
    const scan = (items) => {
      items.forEach(item => {
        if (item.type === 'group') {
          initial[item.label] = item.children.some(c =>
            location.pathname === c.to || location.pathname.startsWith(c.to + '/')
          )
        }
        if (item.type === 'section' && item.items) scan(item.items)
      })
    }
    scan(NAV)
    return initial
  })

  const [openSections, setOpenSections] = useState(() => {
    const initial = {}
    NAV.forEach(item => {
      if (item.type === 'section' && item.collapsible) {
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

  const toggleGroup   = (label) => setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))
  const toggleSection = (label) => setOpenSections(prev => ({ ...prev, [label]: !prev[label] }))

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
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm
                       transition-colors duration-150
                       ${active
                          ? 'text-[#f7f0e0] bg-[rgba(247,240,224,0.06)]'
                          : 'text-[rgba(247,240,224,0.82)] hover:text-[#f7f0e0] hover:bg-[rgba(247,240,224,0.06)]'}`}
          >
            <span className="flex items-center gap-3">
              <span className="text-base opacity-90">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </span>
            <span className={`text-[10px] transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>›</span>
          </button>
          {open && (
            <div className="ml-8 mt-0.5 space-y-0.5 border-l border-[rgba(247,240,224,0.08)] pl-3">
              {item.children
                .filter(child => !child.executiveOrOwner || role === 'owner' || role === 'executive')
                .map(child => (
                  <NavLink key={child.to} to={child.to}
                    className={({ isActive }) =>
                      `block px-3 py-1.5 rounded-md text-xs transition-colors duration-150
                       ${isActive
                          ? 'text-[#d4a574] bg-[rgba(212,165,116,0.1)] font-semibold'
                          : 'text-[rgba(247,240,224,0.72)] hover:text-[#f7f0e0] hover:bg-[rgba(247,240,224,0.06)]'}`
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
          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150
           border-l-2 ${isActive
              ? 'text-[#d4a574] bg-[rgba(212,165,116,0.1)] border-[#d4a574] font-semibold'
              : 'text-[rgba(247,240,224,0.82)] hover:text-[#f7f0e0] hover:bg-[rgba(247,240,224,0.06)] border-transparent'}`
        }>
        <span className="text-base opacity-90">{item.icon}</span>
        <span className="font-medium">{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div
      className="w-60 flex flex-col h-full flex-shrink-0"
      style={{
        background: 'linear-gradient(180deg, #1a0f08 0%, #2a1d10 100%)',
        color: '#f7f0e0',
      }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[rgba(247,240,224,0.06)]">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #d4a574 0%, #b85d3a 100%)',
              color: '#1a0f08',
              fontFamily: 'Merriweather, Georgia, serif',
            }}
          >
            W
          </div>
          <div>
            <div
              className="text-lg font-bold tracking-tight"
              style={{ fontFamily: 'Merriweather, Georgia, serif', color: '#f7f0e0' }}
            >
              Wrangl
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[rgba(247,240,224,0.7)] -mt-0.5">
              Berkely Distribution
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {NAV.map((item, idx) => {
          if (item.type === 'section') {
            const isCollapsible = item.collapsible
            const isOpen = !isCollapsible || openSections[item.label]
            return (
              <div key={item.label} className={idx > 0 ? 'mt-3' : ''}>
                {/* Hairline divider above each section, except the first item */}
                {idx > 1 && <div className="border-t border-[rgba(247,240,224,0.06)] mx-3" />}

                {isCollapsible ? (
                  <button
                    onClick={() => toggleSection(item.label)}
                    className="w-full pt-5 pb-1.5 px-3 flex items-center justify-between"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7758]">
                      {item.label}
                    </span>
                    <span className={`text-[10px] text-[#8c7758] transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                ) : (
                  <div className="pt-5 pb-1.5 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7758]">
                      {item.label}
                    </span>
                  </div>
                )}
                {isOpen && item.items && (
                  <div className="space-y-0.5 mt-0.5">
                    {item.items.filter(sub => !sub.ownerOnly || role === 'owner').map(sub => renderNavItem(sub))}
                  </div>
                )}
              </div>
            )
          }

          return renderNavItem(item)
        })}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-[rgba(247,240,224,0.08)]">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #d4a574 0%, #b85d3a 100%)',
              color: '#1a0f08',
            }}
          >
            {getInitials(profile)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[#f7f0e0] truncate font-medium">{profile?.email}</div>
            <div className="text-[11px] text-[rgba(247,240,224,0.72)] truncate">{roleLabel(role)}</div>
          </div>
        </div>
        <button onClick={signOut}
          className="flex items-center gap-2 text-xs text-[rgba(247,240,224,0.78)] hover:text-[#f7f0e0] transition-colors duration-150">
          <span>↪</span> Sign out
        </button>
      </div>
    </div>
  )
}
