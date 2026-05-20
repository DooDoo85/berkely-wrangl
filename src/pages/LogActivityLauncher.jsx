import { useRef } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'

/**
 * LogActivityLauncher — handles the /log route.
 *
 * Dispatches the modal-open event synchronously during render, then redirects
 * to home (or wherever ?from= points). The persistent GlobalActivityModal in
 * Layout hears the event and opens — so the user sees the modal land on top
 * of the destination page.
 *
 * Why no useEffect: <Navigate> unmounts this component synchronously after
 * render, which would clear any pending timer/effect cleanup before it fires.
 * Dispatching during render is safe because GlobalActivityModal's listener
 * was registered at app startup and is always present.
 *
 * Why the ref: React StrictMode renders components twice in dev. The ref
 * ensures we only fire the event once per mount.
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

  // useRef survives both renders of StrictMode's double-mount, so we only
  // dispatch the event once even if React renders this component twice.
  const dispatched = useRef(false)

  if (!dispatched.current) {
    dispatched.current = true
    window.dispatchEvent(new CustomEvent('wrangl:open-activity-modal', {
      detail: {
        customerId: customerId || null,
        orderId:    orderId    || null,
      },
    }))
  }

  return <Navigate to={from} replace />
}
