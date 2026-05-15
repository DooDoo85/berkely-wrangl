import { useState, useEffect } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// useIsMobile — viewport detection hook
//
// Returns true when the viewport is narrower than the breakpoint.
// Default breakpoint is 768px (Tailwind's `md`).
//
// Listens to window resize so it updates if the user rotates their phone
// or resizes a desktop browser window.
//
// Usage:
//   const isMobile = useIsMobile()
//   return isMobile ? <BottomNav /> : <Sidebar />
// ═══════════════════════════════════════════════════════════════════════

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < breakpoint
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const check = () => setIsMobile(window.innerWidth < breakpoint)

    // matchMedia is more efficient than resize listener — only fires on
    // breakpoint cross, not every pixel of resize
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e) => setIsMobile(e.matches)

    // Modern browsers
    if (mql.addEventListener) {
      mql.addEventListener('change', handler)
    } else {
      // Safari < 14 fallback
      mql.addListener(handler)
    }

    // Initial sync (handles SSR hydration mismatch)
    check()

    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handler)
      } else {
        mql.removeListener(handler)
      }
    }
  }, [breakpoint])

  return isMobile
}
