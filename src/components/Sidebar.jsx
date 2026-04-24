import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'

const NAV = [
  {
    section: 'MAIN',
    items: [
      { to: '/',          icon: '⌂',  label: 'Home' },
    ]
  },
  {
    section: 'SALES',
    items: [
      { to: '/customers', icon: '◎',  label: 'Customers' },
      { to: '/activities',icon: '◈',  label: 'Activities' },
      { to: '/pipeline',  icon: '▤',  label: 'Pipeline' },
    ]
  },
  {
    section: 'OPERATIONS',
    items: [
      { to: '/orders',    icon: '≡',  label: 'Orders' },
      { to: '/tracker',   icon: '◉',  label: 'Order Tracker' },
      { to: '/inventory', icon: '▦',  label: 'Inventory' },
      { to: '/ops',       icon: '⚙️', label: 'Ops / Warehouse' },
      { to: '/freight',   icon: '▷',  label: 'Freight' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { to: '/reports',   icon: '▣',  label: 'Reports' },
      { to: '/settings',  icon: '◌',  label: 'Settings' },
    ]
  },
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/signin')
  }

  const role = profile?.role || 'user'
  const name = profile?.full_name || profile?.email?.split('@')[0] || 'User'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)

  return (
    <aside className="w-52 min-w-[208px] h-screen flex flex-col bg-brand-dark border-r border-white/[0.06] overflow-y-auto">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-gold/20 border border-brand-gold/30
                          flex items-center justify-center flex-shrink-0">
            <span className="text-brand-gold font-display font-bold text-sm">W</span>
          </div>
          <div>
            <div className="text-white font-display font-bold text-sm leading-tight tracking-wide">
              WRANGL
            </div>
            <div className="text-stone-500 text-[10px] tracking-wider uppercase">
              Berkely Distribution
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(group => (
          <div key={group.section} className="mb-2">
            <div className="px-3 py-1.5 text-[9px] font-bold tracking-[0.15em] text-stone-600 uppercase">
              {group.section}
            </div>
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'active' : ''}`
                }
              >
                <span className="text-base w-5 text-center leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-gold/20 border border-brand-gold/30
                          flex items-center justify-center flex-shrink-0">
            <span className="text-brand-gold text-xs font-bold">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white text-xs font-semibold truncate">{name}</div>
            <div className="text-stone-500 text-[10px] capitalize">{role}</div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full text-left text-stone-500 hover:text-stone-300 text-xs
                     py-1.5 px-2 rounded-lg hover:bg-white/5 transition-all duration-150"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
