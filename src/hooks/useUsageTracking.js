import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'

// ═══════════════════════════════════════════════════════════════════════
// useUsageTracking — fires a 'pageview' event into usage_events on every
// route change.
//
// MOUNT THIS ONCE inside Layout.jsx. Don't sprinkle it across pages or
// you'll get duplicate events.
//
// Failure mode: silent. If the insert fails for any reason (network,
// RLS, user not logged in yet), the event is dropped. We never want
// analytics to break the user experience.
// ═══════════════════════════════════════════════════════════════════════

// ─── Path-template mapping ──────────────────────────────────────────
// Converts a concrete URL into a groupable pattern.
//   /customers/abc-123 → /customers/:id
//   /orders/45678      → /orders/:id
//
// Order matters — more specific patterns must come before less specific.
// The first regex that matches wins.

const PATH_TEMPLATES = [
  { pattern: /^\/customers\/[^/]+\/?$/,           template: '/customers/:id' },
  { pattern: /^\/customers\/[^/]+\/.+/,           template: '/customers/:id/*' },
  { pattern: /^\/orders\/[^/]+\/?$/,              template: '/orders/:id' },
  { pattern: /^\/orders\/on-hold\/?$/,            template: '/orders/on-hold' },
  { pattern: /^\/activities\/new\/?$/,            template: '/activities/new' },
  { pattern: /^\/activities\/[^/]+\/?$/,          template: '/activities/:id' },
  { pattern: /^\/quotes\/[^/]+\/?$/,              template: '/quotes/:id' },
  { pattern: /^\/inventory\/[^/]+\/?$/,           template: '/inventory/:section' },
  { pattern: /^\/reports\/[^/]+\/?$/,             template: '/reports/:name' },
  { pattern: /^\/ops\/[^/]+\/?$/,                 template: '/ops/:section' },
  { pattern: /^\/system\/[^/]+\/?$/,              template: '/system/:section' },
  { pattern: /^\/purchase-orders\/[^/]+\/?$/,     template: '/purchase-orders/:id' },
  { pattern: /^\/containers\/[^/]+\/?$/,          template: '/containers/:id' },
]

function templatize(path) {
  // Strip query string and hash for grouping
  const cleanPath = path.split('?')[0].split('#')[0]
  for (const { pattern, template } of PATH_TEMPLATES) {
    if (pattern.test(cleanPath)) return template
  }
  return cleanPath  // static paths group as themselves
}

// ─── Session ID ─────────────────────────────────────────────────────
// A session is a continuous run of activity. We rotate the ID after
// 30 minutes of inactivity, so going to lunch and coming back gives us
// a new session — which is the natural human definition.

const SESSION_KEY      = 'wrangl_usage_session_id'
const SESSION_TIME_KEY = 'wrangl_usage_session_last'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000  // 30 minutes

function getOrCreateSessionId() {
  try {
    const lastTouchStr = sessionStorage.getItem(SESSION_TIME_KEY)
    const lastTouch = lastTouchStr ? parseInt(lastTouchStr, 10) : 0
    const now = Date.now()

    let sessionId = sessionStorage.getItem(SESSION_KEY)

    // Rotate if expired or missing
    if (!sessionId || (now - lastTouch) > SESSION_TIMEOUT_MS) {
      sessionId = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, sessionId)
    }

    sessionStorage.setItem(SESSION_TIME_KEY, String(now))
    return sessionId
  } catch {
    // sessionStorage can throw in private mode — just generate fresh
    return crypto.randomUUID()
  }
}

// ─── Viewport classification ────────────────────────────────────────

function getViewport() {
  if (typeof window === 'undefined') return null
  return window.innerWidth < 768 ? 'mobile' : 'desktop'
}

// ─── The hook ───────────────────────────────────────────────────────

export function useUsageTracking() {
  const location = useLocation()
  const { profile, user } = useAuth()

  // Keep track of where we just came from so we can record referrer
  const previousPathRef = useRef(null)

  // Stable refs to profile fields — these change on every auth refresh,
  // but we don't want that to re-trigger the effect. Snapshot inside.
  const profileRef = useRef(profile)
  profileRef.current = profile

  useEffect(() => {
    // Don't fire if no authenticated user yet
    if (!user?.id) return

    // Don't fire if we just logged this exact path (double-render guard).
    // React StrictMode and some auth flows can cause a mount to fire twice.
    if (previousPathRef.current === location.pathname) return

    const currentProfile = profileRef.current
    const path           = location.pathname
    const path_template  = templatize(path)
    const referrer_path  = previousPathRef.current
    const viewport       = getViewport()
    const session_id     = getOrCreateSessionId()

    // Update ref BEFORE the async insert so a fast second render
    // doesn't fire a duplicate
    previousPathRef.current = path

    // Fire-and-forget. We never await this — page navigation should not
    // wait on analytics. If it fails, we just drop the event silently.
    supabase
      .from('usage_events')
      .insert({
        user_id:       user.id,
        email:         currentProfile?.email || null,
        role:          currentProfile?.role || null,
        event_type:    'pageview',
        path,
        path_template,
        referrer_path,
        viewport,
        session_id,
      })
      .then(() => {})
      .catch(() => {})
  }, [location.pathname, user?.id])
}
