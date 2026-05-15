
import { useState, useEffect } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// InstallPrompt — dismissible toast suggesting Add to Home Screen
//
// iOS Safari doesn't fire the standard beforeinstallprompt event, so
// there's no native "Install" button. Instead we show a small toast
// explaining how to install manually.
//
// Conditions for showing:
//   - User is on iOS Safari (not Chrome, Firefox, etc — those don't
//     support standalone PWA mode the same way)
//   - App is NOT already running in standalone mode
//   - User hasn't dismissed before (stored in localStorage)
//   - User has visited at least 2 times (don't pester first-time users)
//
// On Android, browsers auto-show their own install prompt, so we
// don't need to do anything there.
// ═══════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'wrangl_install_prompt_dismissed'
const VISITS_KEY  = 'wrangl_visits'
const MIN_VISITS_BEFORE_PROMPT = 2

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

function isInStandaloneMode() {
  if (typeof window === 'undefined') return false
  // iOS uses navigator.standalone, others use display-mode media query
  return (
    window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches
  )
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Bump visit counter
    const visits = parseInt(localStorage.getItem(VISITS_KEY) || '0', 10) + 1
    localStorage.setItem(VISITS_KEY, String(visits))

    // Don't show conditions
    if (!isIOS()) return
    if (isInStandaloneMode()) return
    if (localStorage.getItem(STORAGE_KEY) === 'true') return
    if (visits < MIN_VISITS_BEFORE_PROMPT) return

    // Show after a small delay so it doesn't pop up during page load
    const t = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setShow(false)
  }

  return (
    <div
      className="fixed left-3 right-3 z-50 rounded-2xl shadow-lg
                 animate-slide-down"
      style={{
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(135deg, #2e2014 0%, #23180f 100%)',
        color: '#f7f0e0',
        animation: 'slideDown 320ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #c89860 0%, #9d4f30 100%)',
            color: '#1a0f08',
            fontFamily: 'Merriweather, Georgia, serif',
            fontWeight: 700,
            fontSize: '18px',
          }}
        >
          W
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold mb-1">Install Wrangl on your iPhone</div>
          <div className="text-xs leading-relaxed" style={{ color: 'rgba(247,240,224,0.78)' }}>
            Tap the <ShareIcon /> Share button in Safari, then{' '}
            <span className="font-medium" style={{ color: '#f7f0e0' }}>"Add to Home Screen"</span>
          </div>
          <button
            onClick={dismiss}
            className="text-xs mt-2 font-medium underline"
            style={{ color: '#c89860' }}
          >
            Got it
          </button>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(247,240,224,0.08)', color: 'rgba(247,240,224,0.7)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes slideDown { from { transform: translateY(120%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className="inline-block align-text-bottom mx-0.5"
    >
      <path d="M12 3v12M7 8l5-5 5 5M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
    </svg>
  )
}
