import { useEffect } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'

/**
 * LogActivityLauncher — handles the /log route.
 *
 * Mounting this route fires the global activity modal event and immediately
 * redirects the user to home (or wherever they came from via ?from=).
 *
 * Why this exists: lets us point ANY "Log Activity" button at /log via simple
 * navigate('/log'), and the modal opens over the home page. Reps never land on
 * a broken /activities page or have to click through a multi-step flow.
 *
 * Optional query params:
 *   ?customerId=xxx  - pre-select customer in the modal
 *   ?orderId=xxx     - pre-select order
 *   ?from=/path      - redirect target after firing modal (default: /)
 */
export default function LogActivityLauncher() {
  const [params] = useSearchParams()
  const customerId = params.get('customerId')
  const orderId    = params.get('orderId')
  const from       = params.get('from') || '/'

  useEffect(() => {
    // Fire the modal-open event on next tick so the redirect has time to land
    // the user on the home page first. This way they see the modal open over
    // home, not over a flash of the /log "page".
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('wrangl:open-activity-modal', {
        detail: {
          customerId: customerId || null,
          orderId:    orderId    || null,
        },
      }))
    }, 50)
    return () => clearTimeout(t)
  }, [customerId, orderId])

  return <Navigate to={from} replace />
}
