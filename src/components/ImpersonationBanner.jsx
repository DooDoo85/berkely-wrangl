import { useAuth } from './AuthProvider'

// =====================================================================
// ImpersonationBanner
//
// Renders globally in Layout. Only visible when an owner is impersonating
// another user via the "View as" flow. Shows who they're viewing as and
// offers a single-click exit.
// =====================================================================

export default function ImpersonationBanner() {
  const { isImpersonating, profile, realProfile, endImpersonation } = useAuth()

  if (!isImpersonating) return null

  return (
    <div style={styles.bar}>
      <div style={styles.content}>
        <span style={styles.icon}>🎭</span>
        <span style={styles.text}>
          Viewing as <strong>{profile?.full_name || profile?.email || 'User'}</strong>
          <span style={styles.role}>{profile?.role ? ` · ${profile.role}` : ''}</span>
        </span>
        <span style={styles.divider}>·</span>
        <span style={styles.readonly}>read-only mode</span>
        <span style={styles.spacer} />
        <span style={styles.signedInAs}>
          You're signed in as {realProfile?.email}
        </span>
        <button
          onClick={endImpersonation}
          style={styles.exit}
          onMouseEnter={e => { e.currentTarget.style.background = '#3a2818'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#3a2818' }}
        >
          Exit Impersonation
        </button>
      </div>
    </div>
  )
}

const styles = {
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 9999,
    width: '100%',
    background: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
    borderBottom: '2px solid #b45309',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    maxWidth: 1600,
    margin: '0 auto',
    padding: '8px 16px',
    fontSize: 13,
    color: '#3a2818',
  },
  icon: {
    fontSize: 16,
  },
  text: {
    fontWeight: 500,
  },
  role: {
    color: '#5a3a24',
    fontSize: 12,
    opacity: 0.8,
  },
  divider: {
    color: '#5a3a24',
    opacity: 0.5,
  },
  readonly: {
    fontSize: 11,
    fontWeight: 600,
    color: '#7c2d12',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  spacer: {
    flex: 1,
  },
  signedInAs: {
    fontSize: 11,
    color: '#5a3a24',
    opacity: 0.7,
  },
  exit: {
    background: '#fff',
    color: '#3a2818',
    border: '1px solid #3a2818',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 100ms ease',
  },
}
