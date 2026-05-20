import { useState, useEffect, useCallback } from 'react'
import ActivityForm from '../pages/activities/ActivityForm'

/**
 * GlobalActivityModal — a single ActivityForm modal mounted at the Layout level.
 *
 * Lets any page open the Log Activity modal without navigating away. Removes the
 * need for /activities to render at all for the most common rep workflow.
 *
 * Trigger from anywhere via:
 *   window.dispatchEvent(new CustomEvent('wrangl:open-activity-modal', {
 *     detail: { customerId, orderId }   // both optional
 *   }))
 *
 * Or use the useOpenActivityModal() hook below for a cleaner API.
 */
export default function GlobalActivityModal() {
  const [open, setOpen] = useState(false)
  const [defaultCustomerId, setDefaultCustomerId] = useState(null)
  const [defaultOrderId,    setDefaultOrderId]    = useState(null)

  useEffect(() => {
    function handleOpen(e) {
      setDefaultCustomerId(e.detail?.customerId || null)
      setDefaultOrderId(e.detail?.orderId || null)
      setOpen(true)
    }
    window.addEventListener('wrangl:open-activity-modal', handleOpen)
    return () => window.removeEventListener('wrangl:open-activity-modal', handleOpen)
  }, [])

  // ESC to close
  useEffect(() => {
    if (!open) return
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  const handleSave = useCallback(() => {
    setOpen(false)
    // Notify any listening page (Activity Log, Customer 360) to refresh
    window.dispatchEvent(new CustomEvent('wrangl:activity-saved'))
  }, [])

  const handleCancel = useCallback(() => setOpen(false), [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(26, 15, 8, 0.55)' }}
      onClick={handleCancel}
    >
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <ActivityForm
          onSave={handleSave}
          onCancel={handleCancel}
          defaultCustomerId={defaultCustomerId}
          defaultOrderId={defaultOrderId}
        />
      </div>
    </div>
  )
}

/**
 * Convenience hook. In any component:
 *
 *   const openActivityModal = useOpenActivityModal()
 *   <button onClick={() => openActivityModal()}>Log Activity</button>
 *   <button onClick={() => openActivityModal({ customerId })}>Log for this customer</button>
 */
export function useOpenActivityModal() {
  return useCallback((detail = {}) => {
    window.dispatchEvent(new CustomEvent('wrangl:open-activity-modal', { detail }))
  }, [])
}
