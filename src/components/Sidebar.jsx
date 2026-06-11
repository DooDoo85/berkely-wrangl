import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import WranglBadge from './WranglBadge'

// ═══════════════════════════════════════════════════════════════════════
// Sidebar — premium dark brown with gradient, gold accent for active state
// Uses new design tokens; same nav structure as before.
// ═══════════════════════════════════════════════════════════════════════

const EXEC_NAV = [
  { type: 'link', to: '/', icon: '🏠', label: 'Home', exact: true },
  { type: 'link', to: '/cockpit', icon: '🎛️', label: 'COO Cockpit' },
  { type: 'link', to: '/calendar', icon: '📅', label: 'Calendar' },

  { type: 'section', label: 'Inventory' },
  { type: 'link', to: '/inventory',             icon: '📦', label: 'All Parts', exact: true },
  { type: 'link', to: '/inventory/faux-blinds', icon: '🪟', label: 'Faux Blinds' },
  { type: 'link', to: '/inventory/fabrics',     icon: '🧵', label: 'Fabrics'     },
  { type: 'link', to: '/inventory/components',  icon: '🔩', label: 'Components'  },
  { type: 'link', to: '/inventory/extrusions',  icon: '📏', label: 'Extrusions'  },

  { type: 'section', label: 'Operations' },
  {
    type: 'group', label: 'Production', icon: '🏭',
    children: [
      { to: '/ops/production',   label: 'Start Production' },
      { to: '/ops',              label: 'Warehouse'        },
      { to: '/ops/cycle-counts', label: 'Cycle Counts'     },
      { to: '/inventory/committed', label: 'Committed Orders' },
      { to: '/inventory/adjust',    label: 'Adjust On-Hand' },
      { to: '/purchasing',       label: 'Purchasing'       },
      { to: '/freight',          label: 'Freight'          },
    ],
  },
  { type: 'link', to: '/requests', icon: '📥', label: 'Requests' },

  { type: 'section', label: 'Sales' },
  { type: 'link', to: '/customers',  icon: '👥', label: 'Customers'  },
  { type: 'link', to: '/activities', icon: '📝', label: 'Activities' },
  {
    type: 'group', label: 'Orders', icon: '📋',
    children: [
      { to: '/orders',         label: 'All Orders'     },
      { to: '/orders/on-hold', label: 'Orders on Hold' },
    ],
  },

  {
    type: 'section', label: 'Reports', collapsible: true,
    items: [
      {
        type: 'group', label: 'Reports', icon: '📊',
        children: [
          { to: '/reports/sales-activity', label: 'Sales Activity' },
          { to: '/reports/remakes',        label: 'Remakes' },
          { to: '/reports/parts-cost',     label: 'Parts Cost Quote' },
          { to: '/reports/vendor-pricing', label: 'Vendor Pricing' },
          { to: '/reports/vendor-purchasing', label: 'Vendor Purchasing' },
        ],
      },
    ],
  },

  {
    type: 'section', label: 'System', collapsible: true,
    items: [
      { type: 'link', to: '/system/users',               icon: '👤', label: 'Users',             ownerOnly: true },
      { type: 'link', to: '/system/usage',               icon: '📊', label: 'Usage Analytics',   ownerOnly: true },
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
      { to: '/inventory/committed',   label: 'Committed Orders' },
      { to: '/inventory/adjust',      label: 'Adjust On-Hand' },
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
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm
                       transition-colors duration-150
                       ${active
                          ? 'text-[#f7f0e0] bg-[rgba(247,240,224,0.06)]'
                          : 'text-[rgba(247,240,224,0.82)] hover:text-[#f7f0e0] hover:bg-[rgba(247,240,224,0.06)]'}`}
          >
            <span className="flex items-center gap-2.5">
              <span className="text-sm opacity-90">{item.icon}</span>
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
                      `block px-3 py-1 rounded-md text-xs transition-colors duration-150
                       ${isActive
                          ? 'text-[#c89860] bg-[rgba(200,152,96,0.08)] font-semibold'
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
          `flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors duration-150
           border-l-2 ${isActive
              ? 'text-[#c89860] bg-[rgba(200,152,96,0.08)] border-[#c89860] font-semibold'
              : 'text-[rgba(247,240,224,0.82)] hover:text-[#f7f0e0] hover:bg-[rgba(247,240,224,0.06)] border-transparent'}`
        }>
        <span className="text-sm opacity-90">{item.icon}</span>
        <span className="font-medium">{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div
      className="w-56 flex flex-col h-full flex-shrink-0"
      style={{
        background: 'linear-gradient(180deg, #23180f 0%, #2e2014 100%)',
        color: '#f7f0e0',
      }}
    >
      {/* Header — compact: badge + "Wrangl" only (tagline dropped to save vertical) */}
      <div className="px-4 pt-3 pb-2.5 border-b border-[rgba(247,240,224,0.08)]">
        <div className="flex items-center gap-2.5">
          <WranglBadge size={32} />
          <div
            className="text-base font-bold tracking-tight leading-tight"
            style={{ fontFamily: 'Merriweather, Georgia, serif', color: '#f7f0e0' }}
          >
            Wrangl
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-0.5">
        {NAV.map((item, idx) => {
          if (item.type === 'section') {
            const isCollapsible = item.collapsible
            const isOpen = !isCollapsible || openSections[item.label]
            return (
              <div key={item.label} className={idx > 0 ? 'mt-2' : ''}>
                {/* Hairline divider above each section, except the first item */}
                {idx > 1 && <div className="border-t border-[rgba(247,240,224,0.06)] mx-3" />}

                {isCollapsible ? (
                  <button
                    onClick={() => toggleSection(item.label)}
                    className="w-full pt-2.5 pb-1 px-3 flex items-center justify-between"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7758]">
                      {item.label}
                    </span>
                    <span className={`text-[10px] text-[#8c7758] transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                ) : (
                  <div className="pt-2.5 pb-1 px-3">
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

      {/* User footer — compact single row */}
      <div className="px-3 py-3 border-t border-[rgba(247,240,224,0.08)]">
        <div className="flex items-center gap-2.5 mb-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #c89860 0%, #9d4f30 100%)',
              color: '#1a0f08',
            }}
          >
            {getInitials(profile)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[#f7f0e0] truncate font-medium">{profile?.email}</div>
            <div className="text-[10px] text-[rgba(247,240,224,0.65)] truncate">{roleLabel(role)}</div>
          </div>
        </div>
        <button onClick={signOut}
          className="flex items-center gap-1.5 text-[11px] text-[rgba(247,240,224,0.7)] hover:text-[#f7f0e0] transition-colors duration-150">
          <span>↪</span> Sign out
        </button>
      </div>
    </div>
  )
}
