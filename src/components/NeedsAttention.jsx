import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

// =====================================================================
// NeedsAttention
//
// Drop-in section for RepHome. Shows top N aging-quote cards for the
// signed-in rep, with engagement tracking on every show / click / action.
//
// Usage in RepHome:
//   <NeedsAttention currentUser={profile} repName={profile.full_name} />
//
// Required props:
//   currentUser  — the profile row of the signed-in user (for events.user_id)
//   repName      — string used to filter v_rep_attention_quotes.rep_name
//                  (epic_quotes.salesperson values, normalized)
//
// Optional props:
//   max          — defaults to 8, override per-page if needed
//   onLogActivity (customer) => void
//                — if your existing activity modal is triggered from
//                  RepHome's parent, pass a handler. Otherwise we'll
//                  navigate to Customer 360 with a query param to auto-open.
// =====================================================================

const TIER_STYLES = {
  urgent:  { dot: '#c2410c', bg: '#fef3ec', border: '#f7d4b8', label: '⚠️ Urgent'  },
  flagged: { dot: '#a0573a', bg: '#fbf6ee', border: '#ecd9c0', label: '⚠️ Flagged' },
}

const fmtMoney = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
const fmtDays  = (n) => n === 1 ? '1 day' : `${n} days`

export default function NeedsAttention({ currentUser, repName, max = 8, onLogActivity }) {
  const navigate = useNavigate()
  const { isImpersonating } = useAuth()
  const [cards, setCards]     = useState([])
  const [loading, setLoading] = useState(true)
  const shownLogged           = useRef(false)  // gate so we only fire 'shown' events once per load

  useEffect(() => {
    if (!repName) return
    load()
  }, [repName])

  // After cards load, fire one 'shown' event per card (batched in a single insert)
  useEffect(() => {
    if (loading || shownLogged.current || cards.length === 0 || !currentUser?.id) return
    logShownEvents(cards)
    shownLogged.current = true
  }, [loading, cards.length])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('v_rep_attention_quotes')
      .select('*')
      .ilike('rep_name', repName)
      .order('attention_score', { ascending: false })
      .limit(max)

    if (error) {
      console.error('NeedsAttention load error:', error)
      setCards([])
    } else {
      setCards(data || [])
    }
    setLoading(false)
  }

  async function logShownEvents(visibleCards) {
    // Skip event logging while owner is impersonating — would pollute the
    // target rep's engagement funnel with views the owner triggered.
    if (isImpersonating) return
    const rows = visibleCards.map((card, idx) => ({
      event_type:    'shown',
      user_id:       currentUser.id,
      customer_id:   card.customer_id,
      quote_ids:     card.quote_nos || [],
      card_metadata: {
        rank:               idx + 1,
        attention_score:    card.attention_score,
        aging_quote_count:  card.aging_quote_count,
        total_value:        card.aging_quote_total_value,
        oldest_age_days:    card.oldest_quote_age_days,
        days_since_activity: card.days_since_activity,
        tier:               card.tier,
      },
    }))
    await supabase.from('attention_events').insert(rows)
  }

  async function logEvent(card, eventType, extra = {}) {
    if (!currentUser?.id) return
    // Same reason — don't taint the rep's funnel with impersonator clicks.
    if (isImpersonating) return
    await supabase.from('attention_events').insert({
      event_type:  eventType,
      user_id:     currentUser.id,
      customer_id: card.customer_id,
      quote_ids:   card.quote_nos || [],
      card_metadata: {
        attention_score:    card.attention_score,
        aging_quote_count:  card.aging_quote_count,
        total_value:        card.aging_quote_total_value,
        days_since_activity: card.days_since_activity,
        tier:               card.tier,
      },
      ...extra,
    })
  }

  function handleOpenCustomer(card) {
    logEvent(card, 'clicked', { click_target: 'customer_360' })
    navigate(`/customers/${card.customer_id}?tab=quotes`)
  }

  function handleLogActivity(card, e) {
    e.stopPropagation()  // don't also trigger card click
    logEvent(card, 'clicked', { click_target: 'log_activity_modal' })
    if (onLogActivity) {
      // Parent provided a handler — let it open the existing modal
      onLogActivity({
        customer_id:   card.customer_id,
        account_name:  card.account_name,
        attention_card: card,  // parent can pass this to the modal so action_taken can be linked
      })
    } else {
      // Fallback — route to Customer 360 with a flag that auto-opens its activity modal
      navigate(`/customers/${card.customer_id}?openActivity=1&fromAttention=1`)
    }
  }

  if (loading) {
    return (
      <section style={sectionStyle}>
        <h3 style={headerStyle}>Needs Attention</h3>
        <div style={{ color: '#9d8b73', fontSize: 13, padding: '8px 4px' }}>Loading…</div>
      </section>
    )
  }

  if (cards.length === 0) {
    return (
      <section style={sectionStyle}>
        <h3 style={headerStyle}>Needs Attention</h3>
        <div style={{
          color: '#9d8b73', fontSize: 13, padding: '12px 14px',
          background: '#fbf6ee', border: '1px solid #ecd9c0', borderRadius: 10,
        }}>
          ✓ All caught up — no aging quotes right now.
        </div>
      </section>
    )
  }

  return (
    <section style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={headerStyle}>Needs Attention</h3>
        <span style={{ fontSize: 12, color: '#9d8b73' }}>
          {cards.length} {cards.length === 1 ? 'quote' : 'quotes'} aging
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
        {cards.map(card => {
          const style = TIER_STYLES[card.tier] || TIER_STYLES.flagged
          const lastActivityLabel = card.last_activity_at
            ? `Last activity ${fmtDays(card.days_since_activity)} ago`
            : 'No activity logged yet'

          return (
            <div
              key={card.customer_id}
              onClick={() => handleOpenCustomer(card)}
              style={{
                background: style.bg,
                border:     `1px solid ${style.border}`,
                borderRadius: 10,
                padding: 14,
                cursor: 'pointer',
                transition: 'transform 80ms ease, box-shadow 80ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(58,40,24,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: style.dot, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {style.label}
              </div>

              <div style={{ fontSize: 15, fontWeight: 700, color: '#3a2818', marginBottom: 2 }}>
                {card.account_name}
              </div>

              <div style={{ fontSize: 12, color: '#6b5640', marginBottom: 10 }}>
                {card.aging_quote_count} {card.aging_quote_count === 1 ? 'quote' : 'quotes'} · {fmtMoney(card.aging_quote_total_value)} · oldest {fmtDays(card.oldest_quote_age_days)}
              </div>

              <div style={{ fontSize: 11, color: '#8a7560', marginBottom: 12, fontStyle: 'italic' }}>
                {lastActivityLabel}
              </div>

              <button
                onClick={(e) => handleLogActivity(card, e)}
                disabled={isImpersonating}
                title={isImpersonating ? 'Exit impersonation to log activity' : ''}
                style={{
                  width: '100%',
                  background: isImpersonating ? '#9d8b73' : '#3a2818',
                  color: '#fff',
                  border: 'none', borderRadius: 6,
                  padding: '7px 10px', fontSize: 12, fontWeight: 600,
                  cursor: isImpersonating ? 'not-allowed' : 'pointer',
                  opacity: isImpersonating ? 0.6 : 1,
                }}
              >
                {isImpersonating ? '🎭 Read-only' : '📞 Log Activity'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const sectionStyle = {
  marginBottom: 24,
  padding: '16px 18px',
  background: '#fff',
  border: '1px solid #ecd9c0',
  borderRadius: 12,
}

const headerStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: '#3a2818',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}


// =====================================================================
// HELPER: call this from your existing activity-logging code
// after a successful insert into the `activities` table.
//
// It checks for any 'shown' event in the last 24h for this user+customer,
// and if so, logs an 'action_taken' event tying the activity back to the
// recommendation that surfaced it. THIS is what powers the conversion
// rate measurement.
//
// Example call site (inside your activity modal's submit handler):
//   await supabase.from('activities').insert({...})
//   await markAttentionActionTaken(userId, customerId, activityId)
// =====================================================================
export async function markAttentionActionTaken(userId, customerId, activityId) {
  if (!userId || !customerId) return

  // Was this customer surfaced as an attention card in the last 24h for this user?
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
    event_type:  'action_taken',
    user_id:     userId,
    customer_id: customerId,
    action_type: 'activity_logged',
    card_metadata: {
      ...(shown[0].card_metadata || {}),
      shown_event_id: shown[0].id,
      time_to_action_minutes: Math.round((Date.now() - new Date(shown[0].occurred_at).getTime()) / 60000),
      activity_id: activityId,
    },
  })
}
