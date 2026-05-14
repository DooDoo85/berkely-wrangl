import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

// =====================================================================
// NeedsAttention (compact widget)
//
// One-line summary of the rep's open quotes within the last 30 days,
// with a link to the full list page (/my-quotes).
//
// Engagement tracking preserved: 'shown' event logged on render so we
// can still measure whether seeing the widget drives action.
//
// Usage in RepHome:
//   <NeedsAttention currentUser={profile} repName={profile.full_name} />
// =====================================================================

const fmtMoney = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()

export default function NeedsAttention({ currentUser, repName }) {
  const navigate = useNavigate()
  const { isImpersonating } = useAuth()
  const [summary, setSummary]   = useState({ count: 0, value: 0, cards: [] })
  const [loading, setLoading]   = useState(true)
  const shownLogged             = useRef(false)

  useEffect(() => {
    if (!repName) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repName])

  useEffect(() => {
    if (loading || shownLogged.current || summary.cards.length === 0 || !currentUser?.id) return
    logShownEvents(summary.cards)
    shownLogged.current = true
  }, [loading, summary.cards.length, currentUser?.id])

  async function load() {
    setLoading(true)
    // Pull from the v_rep_attention_quotes view (customer-grouped aging quotes).
    // Filter client-side to the 30-day window — customer must have at least
    // one quote where the oldest is <= 30 days old.
    const { data, error } = await supabase
      .from('v_rep_attention_quotes')
      .select('*')
      .ilike('rep_name', repName)
      .order('attention_score', { ascending: false })

    if (error) {
      console.error('NeedsAttention load error:', error)
      setSummary({ count: 0, value: 0, cards: [] })
    } else {
      const recent = (data || []).filter(c => (c.oldest_quote_age_days ?? 999) <= 30)
      const totalQuotes = recent.reduce((s, c) => s + (Number(c.aging_quote_count) || 0), 0)
      const totalValue  = recent.reduce((s, c) => s + (Number(c.aging_quote_total_value) || 0), 0)
      setSummary({ count: totalQuotes, value: totalValue, cards: recent })
    }
    setLoading(false)
  }

  async function logShownEvents(visibleCards) {
    // Skip during impersonation — don't pollute the rep's engagement funnel
    // with owner views.
    if (isImpersonating) return
    const rows = visibleCards.map((card, idx) => ({
      event_type:    'shown',
      user_id:       currentUser.id,
      customer_id:   card.customer_id,
      quote_ids:     card.quote_nos || [],
      card_metadata: {
        rank:                idx + 1,
        attention_score:     card.attention_score,
        aging_quote_count:   card.aging_quote_count,
        total_value:         card.aging_quote_total_value,
        oldest_age_days:     card.oldest_quote_age_days,
        days_since_activity: card.days_since_activity,
        tier:                card.tier,
        widget_variant:      'compact_summary',
      },
    }))
    await supabase.from('attention_events').insert(rows)
  }

  function handleViewAll() {
    navigate('/my-quotes')
  }

  // ─── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="card p-4 mb-6">
        <div className="text-xs text-ink-muted">Loading open quotes…</div>
      </section>
    )
  }

  if (summary.count === 0) {
    return (
      <section className="card p-4 mb-6">
        <div>
          <h3 className="text-xs font-semibold text-ink-strong uppercase tracking-widest mb-1">
            My Open Quotes
          </h3>
          <p className="text-sm text-ink-mid">
            ✓ All caught up — no open quotes from the last 30 days.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="card p-4 mb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-xs font-semibold text-ink-strong uppercase tracking-widest mb-1">
            My Open Quotes
          </h3>
          <p className="text-sm text-ink-mid">
            <strong className="text-ink-strong text-base tabular-nums">{summary.count}</strong>
            {' '}open {summary.count === 1 ? 'quote' : 'quotes'}
            {' · '}
            <strong className="text-ink-strong tabular-nums">{fmtMoney(summary.value)}</strong>
            {' '}in pipeline
            <span className="text-ink-muted">{' · last 30 days'}</span>
          </p>
        </div>
        <button
          onClick={handleViewAll}
          className="text-sm font-semibold text-accent-clay hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          View all →
        </button>
      </div>
    </section>
  )
}

// =====================================================================
// HELPER: called from the activity-logging code after a successful insert
// into the `activities` table.
//
// Checks for any 'shown' event in the last 24h for this user+customer,
// and if so, logs an 'action_taken' event tying the activity back to the
// recommendation that surfaced it.
// =====================================================================
export async function markAttentionActionTaken(userId, customerId, activityId) {
  if (!userId || !customerId) return

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: shown } = await supabase
    .from('attention_events')
    .select('id, card_metadata, occurred_at')
    .eq('event_type', 'shown')
    .eq('user_id', userId)
    .eq('customer_id', customerId)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(1)

  if (!shown || shown.length === 0) return  // not a card-driven action

  await supabase.from('attention_events').insert({
    event_type:   'action_taken',
    user_id:      userId,
    customer_id:  customerId,
    action_type:  'activity_logged',
    card_metadata: {
      ...(shown[0].card_metadata || {}),
      shown_event_id: shown[0].id,
      time_to_action_minutes: Math.round((Date.now() - new Date(shown[0].occurred_at).getTime()) / 60000),
      activity_id: activityId,
    },
  })
}
