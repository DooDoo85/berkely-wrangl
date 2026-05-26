import { supabase } from './supabase'

// ═══════════════════════════════════════════════════════════════════════
// Production stage logging — single source of truth.
//
// Every place that advances an order through production (ProductionHub's
// "Start Production", OrderDetail's "Mark In Production", and the new
// In-Assembly / Shipped station screens) calls logStageEvent() so the
// order_stage_events timeline is written consistently — no drift, no gaps.
//
// This table is append-only. The order's CURRENT stage is the most recent
// row. A skipped or out-of-order log is still recorded (latest event wins
// for display, but the full history is preserved so a skip is visible).
// ═══════════════════════════════════════════════════════════════════════

// The three tracked production stages, in order. STAGE_ORDER is used by
// the tracker UI to render progress; logging itself never enforces order.
export const STAGES = {
  FABRIC_CUT:  'fabric_cut',
  IN_ASSEMBLY: 'in_assembly',
  SHIPPED:     'shipped',
}

export const STAGE_ORDER = [
  STAGES.FABRIC_CUT,
  STAGES.IN_ASSEMBLY,
  STAGES.SHIPPED,
]

export const STAGE_LABELS = {
  fabric_cut:  'Fabric Cut',
  in_assembly: 'In Assembly',
  shipped:     'Shipped',
}

/**
 * Append a production stage event for an order.
 *
 * @param {string}  orderId  - orders.id (uuid)
 * @param {string}  stage    - one of STAGES.* ('fabric_cut'|'in_assembly'|'shipped')
 * @param {object}  [opts]
 * @param {string}  [opts.loggedBy]   - profiles.id of the person logging it
 * @param {string}  [opts.note]       - optional free-text note
 * @param {string}  [opts.occurredAt] - ISO timestamp; defaults to now() in the DB
 * @returns {Promise<{ok: boolean, error?: string}>}
 *
 * Never throws — returns {ok:false, error} so callers can decide whether a
 * failed stage-log should block their main action. (In practice it should
 * NOT block: if Rene's cut is logged but the stage event fails, the cut is
 * still real. Callers log the warning and continue.)
 */
export async function logStageEvent(orderId, stage, opts = {}) {
  if (!orderId) {
    return { ok: false, error: 'logStageEvent: missing orderId' }
  }
  if (!STAGE_ORDER.includes(stage)) {
    return { ok: false, error: `logStageEvent: invalid stage "${stage}"` }
  }

  const row = {
    order_id:  orderId,
    stage,
    logged_by: opts.loggedBy || null,
    note:      opts.note || null,
  }
  if (opts.occurredAt) row.occurred_at = opts.occurredAt

  const { error } = await supabase.from('order_stage_events').insert(row)

  if (error) {
    console.warn(`logStageEvent failed (order ${orderId}, stage ${stage}):`, error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * Fetch the full stage timeline for an order, oldest → newest.
 * Used by the OrderStageTracker component and (later) the customer view.
 *
 * @param {string} orderId
 * @returns {Promise<Array<{stage,occurred_at,logged_by,note}>>}
 */
export async function getStageTimeline(orderId) {
  if (!orderId) return []
  const { data, error } = await supabase
    .from('order_stage_events')
    .select('stage, occurred_at, logged_by, note')
    .eq('order_id', orderId)
    .order('occurred_at', { ascending: true })

  if (error) {
    console.warn(`getStageTimeline failed (order ${orderId}):`, error.message)
    return []
  }
  return data || []
}

/**
 * Given a timeline (from getStageTimeline), return the current stage —
 * the most recent event's stage, or null if the order has no events yet.
 */
export function currentStage(timeline) {
  if (!timeline || timeline.length === 0) return null
  return timeline[timeline.length - 1].stage
}
