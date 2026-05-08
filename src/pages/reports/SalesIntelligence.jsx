import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../components/AuthProvider'
import { supabase } from '../../lib/supabase'

// =====================================================================
// Sales Intelligence — gated to owner + executive roles
//
// Two tabs:
//   1. By Rep — pick a rep, see exactly what they see on RepHome.
//      Logs an 'exec_view' event (separate from rep engagement metrics)
//      so manager views don't pollute the experiment data.
//
//   2. Team Pipeline — flat sortable table of every aging-quote customer
//      across all reps, with totals.
//
// Bottom panel: 14-day engagement funnel — proves whether cards are
// actually driving rep follow-ups.
// =====================================================================

const TIER_STYLES = {
  urgent:  { dot: '#c2410c', bg: '#fef3ec', border: '#f7d4b8', label: '⚠️ Urgent'  },
  flagged: { dot: '#a0573a', bg: '#fbf6ee', border: '#ecd9c0', label: '⚠️ Flagged' },
}

const fmtMoney = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
const fmtDays  = (n) => n === 1 ? '1 day' : `${n} days`
const ALLOWED_ROLES = ['owner', 'executive']

export default function SalesIntelligence() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [tab, setTab]                 = useState('by_rep')
  const [allCards, setAllCards]       = useState([])
  const [engagement, setEngagement]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedRep, setSelectedRep] = useState(null)
  const [sortBy, setSortBy]           = useState('attention_score')
  const [sortDir, setSortDir]         = useState('desc')
  const [pipelineRepFilter, setPipelineRepFilter] = useState('all')

  // Permission gate
  const allowed = profile && ALLOWED_ROLES.includes(profile.role)

  useEffect(() => {
    if (allowed) load()
  }, [allowed])

  async function load() {
    setLoading(true)
    const [cardsRes, engRes] = await Promise.all([
      supabase.from('v_rep_attention_quotes').select('*').order('attention_score', { ascending: false }),
      supabase.from('v_attention_engagement').select('*'),
    ])
    setAllCards(cardsRes.data || [])
    setEngagement(engRes.data || [])
    setLoading(false)
  }

  const reps = useMemo(() => {
    const set = new Set()
    allCards.forEach(c => c.rep_name && set.add(c.rep_name))
    return Array.from(set).sort()
  }, [allCards])

  // Auto-select first rep when entering By Rep tab
  useEffect(() => {
    if (tab === 'by_rep' && !selectedRep && reps.length > 0) {
      setSelectedRep(reps[0])
    }
  }, [tab, reps, selectedRep])

  const cardsForSelectedRep = useMemo(() => {
    if (!selectedRep) return []
    return allCards
      .filter(c => c.rep_name === selectedRep)
      .slice(0, 8)  // same cap as RepHome
  }, [allCards, selectedRep])

  // Log exec_view events when the selected rep changes
  useEffect(() => {
    if (tab !== 'by_rep' || !selectedRep || cardsForSelectedRep.length === 0 || !profile?.id) return
    logExecView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRep, cardsForSelectedRep.length])

  async function logExecView() {
    const rows = cardsForSelectedRep.map((card, idx) => ({
      event_type:      'exec_view',
      user_id:         profile.id,
      customer_id:     card.customer_id,
      viewed_rep_name: selectedRep,
      quote_ids:       card.quote_nos || [],
      card_metadata: {
        rank:               idx + 1,
        attention_score:    card.attention_score,
        aging_quote_count:  card.aging_quote_count,
        total_value:        card.aging_quote_total_value,
        days_since_activity: card.days_since_activity,
        tier:               card.tier,
      },
    }))
    await supabase.from('attention_events').insert(rows)
  }

  // ───── Permission gate ─────
  if (profile && !allowed) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <h2 style={{ color: '#3a2818' }}>Restricted</h2>
        <p style={{ color: '#6b5640' }}>This report is only available to executives and owners.</p>
      </div>
    )
  }

  if (!profile) {
    return <div style={{ padding: 32, color: '#9d8b73' }}>Loading…</div>
  }

  // ───── Pipeline tab — sortable, filterable ─────
  const pipelineRows = useMemo(() => {
    let rows = allCards
    if (pipelineRepFilter !== 'all') {
      rows = rows.filter(c => c.rep_name === pipelineRepFilter)
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortBy] ?? 0
      const bv = b[sortBy] ?? 0
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return rows
  }, [allCards, pipelineRepFilter, sortBy, sortDir])

  const pipelineTotals = useMemo(() => ({
    customers: pipelineRows.length,
    quotes:    pipelineRows.reduce((s, r) => s + (r.aging_quote_count || 0), 0),
    value:     pipelineRows.reduce((s, r) => s + Number(r.aging_quote_total_value || 0), 0),
    urgent:    pipelineRows.filter(r => r.tier === 'urgent').length,
  }), [pipelineRows])

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  // ───── Render ─────
  return (
    <div style={{ minHeight: '100vh', background: '#faf6ed' }}>
      <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#3a2818' }}>Sales Intelligence</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6b5640' }}>
            Aging-quote follow-ups across the team. {loading ? 'Loading…' : `${allCards.length} customers flagged across ${reps.length} reps.`}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #ecd9c0', marginBottom: 20 }}>
          <TabButton active={tab === 'by_rep'}   onClick={() => setTab('by_rep')}>By Rep</TabButton>
          <TabButton active={tab === 'pipeline'} onClick={() => setTab('pipeline')}>Team Pipeline</TabButton>
        </div>

        {/* Tab content */}
        {tab === 'by_rep' ? (
          <ByRepTab
            reps={reps}
            selectedRep={selectedRep}
            setSelectedRep={setSelectedRep}
            cards={cardsForSelectedRep}
            allCardsForRep={allCards.filter(c => c.rep_name === selectedRep).length}
            navigate={navigate}
            loading={loading}
          />
        ) : (
          <PipelineTab
            rows={pipelineRows}
            totals={pipelineTotals}
            reps={reps}
            repFilter={pipelineRepFilter}
            setRepFilter={setPipelineRepFilter}
            sortBy={sortBy}
            sortDir={sortDir}
            toggleSort={toggleSort}
            navigate={navigate}
            loading={loading}
          />
        )}

        {/* Engagement panel — always visible */}
        <EngagementPanel rows={engagement} loading={loading} />
      </div>
    </div>
  )
}

// =====================================================================
// Subcomponents
// =====================================================================

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 18px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        color: active ? '#3a2818' : '#9d8b73',
        borderBottom: active ? '2px solid #3a2818' : '2px solid transparent',
        marginBottom: -1,
      }}>
      {children}
    </button>
  )
}

function ByRepTab({ reps, selectedRep, setSelectedRep, cards, allCardsForRep, navigate, loading }) {
  if (loading) return <div style={{ color: '#9d8b73', fontSize: 13, padding: 16 }}>Loading…</div>
  if (reps.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid #ecd9c0', borderRadius: 12, padding: 24, color: '#6b5640' }}>
        ✓ All caught up — no aging quotes across the team.
      </div>
    )
  }

  return (
    <div>
      {/* Rep selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#3a2818' }}>View as rep:</label>
        <select
          value={selectedRep || ''}
          onChange={e => setSelectedRep(e.target.value)}
          style={{
            padding: '8px 12px', border: '1px solid #ecd9c0', borderRadius: 8,
            fontSize: 14, background: '#fff', color: '#3a2818', minWidth: 220,
          }}>
          {reps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#9d8b73' }}>
          Showing top 8 of {allCardsForRep} flagged
        </span>
      </div>

      {/* Banner */}
      <div style={{
        background: '#fbf6ee', border: '1px solid #ecd9c0', borderRadius: 8,
        padding: '8px 12px', fontSize: 12, color: '#8a7560', marginBottom: 16,
      }}>
        🔍 Viewing as <strong>{selectedRep}</strong>. Engagement events from this view are tracked separately and don't affect rep funnel metrics.
      </div>

      {/* Cards */}
      {cards.length === 0 ? (
        <div style={{ color: '#9d8b73', fontSize: 13, padding: 16 }}>
          No flagged cards for this rep right now.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {cards.map(card => {
            const style = TIER_STYLES[card.tier] || TIER_STYLES.flagged
            const lastActivityLabel = card.last_activity_at
              ? `Last activity ${fmtDays(card.days_since_activity)} ago`
              : 'No activity logged yet'
            return (
              <div
                key={card.customer_id}
                onClick={() => navigate(`/customers/${card.customer_id}?tab=quotes`)}
                style={{
                  background: style.bg, border: `1px solid ${style.border}`, borderRadius: 10,
                  padding: 14, cursor: 'pointer',
                }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: style.dot, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {style.label}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#3a2818', marginBottom: 2 }}>
                  {card.account_name}
                </div>
                <div style={{ fontSize: 12, color: '#6b5640', marginBottom: 10 }}>
                  {card.aging_quote_count} {card.aging_quote_count === 1 ? 'quote' : 'quotes'} · {fmtMoney(card.aging_quote_total_value)} · oldest {fmtDays(card.oldest_quote_age_days)}
                </div>
                <div style={{ fontSize: 11, color: '#8a7560', marginBottom: 10, fontStyle: 'italic' }}>
                  {lastActivityLabel}
                </div>
                <div style={{ fontSize: 11, color: '#9d8b73' }}>
                  Score: <strong>{card.attention_score}</strong> · YTD revenue: {fmtMoney(card.ytd_revenue || 0)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PipelineTab({ rows, totals, reps, repFilter, setRepFilter, sortBy, sortDir, toggleSort, navigate, loading }) {
  if (loading) return <div style={{ color: '#9d8b73', fontSize: 13, padding: 16 }}>Loading…</div>

  const arrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  return (
    <div>
      {/* Filter + totals */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#3a2818' }}>Rep:</label>
          <select value={repFilter} onChange={e => setRepFilter(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #ecd9c0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#3a2818' }}>
            <option value="all">All reps</option>
            {reps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12, color: '#6b5640' }}>
          <span><strong style={{ color: '#3a2818' }}>{totals.customers}</strong> customers</span>
          <span><strong style={{ color: '#3a2818' }}>{totals.quotes}</strong> quotes</span>
          <span><strong style={{ color: '#3a2818' }}>{fmtMoney(totals.value)}</strong> at risk</span>
          {totals.urgent > 0 && (
            <span style={{ color: '#c2410c' }}><strong>{totals.urgent}</strong> urgent</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #ecd9c0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#fbf6ee', borderBottom: '1px solid #ecd9c0' }}>
            <tr>
              <Th onClick={() => toggleSort('rep_name')}>            Rep{arrow('rep_name')}</Th>
              <Th onClick={() => toggleSort('account_name')}>        Customer{arrow('account_name')}</Th>
              <Th onClick={() => toggleSort('aging_quote_count')} num>Quotes{arrow('aging_quote_count')}</Th>
              <Th onClick={() => toggleSort('aging_quote_total_value')} num>Total Value{arrow('aging_quote_total_value')}</Th>
              <Th onClick={() => toggleSort('oldest_quote_age_days')} num>Oldest{arrow('oldest_quote_age_days')}</Th>
              <Th onClick={() => toggleSort('days_since_activity')} num>Last Activity{arrow('days_since_activity')}</Th>
              <Th onClick={() => toggleSort('ytd_revenue')} num>YTD Rev{arrow('ytd_revenue')}</Th>
              <Th onClick={() => toggleSort('attention_score')} num>Score{arrow('attention_score')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#9d8b73' }}>No customers flagged.</td></tr>
            ) : rows.map(r => (
              <tr key={r.customer_id}
                  onClick={() => navigate(`/customers/${r.customer_id}?tab=quotes`)}
                  style={{ borderBottom: '1px solid #f5ecdf', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fbf6ee' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                <Td>{r.rep_name || <span style={{ color: '#9d8b73' }}>—</span>}</Td>
                <Td bold>{r.account_name}</Td>
                <Td num>{r.aging_quote_count}</Td>
                <Td num>{fmtMoney(r.aging_quote_total_value)}</Td>
                <Td num>{fmtDays(r.oldest_quote_age_days)}</Td>
                <Td num>
                  {r.last_activity_at ? fmtDays(r.days_since_activity) + ' ago' : <span style={{ color: '#c2410c' }}>never</span>}
                </Td>
                <Td num>{fmtMoney(r.ytd_revenue || 0)}</Td>
                <Td num bold>
                  {r.tier === 'urgent' && <span style={{ color: '#c2410c', marginRight: 4 }}>⚠️</span>}
                  {r.attention_score}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, onClick, num }) {
  return (
    <th onClick={onClick} style={{
      padding: '10px 12px', textAlign: num ? 'right' : 'left', fontSize: 11,
      fontWeight: 700, color: '#6b5640', textTransform: 'uppercase', letterSpacing: 0.5,
      cursor: 'pointer', userSelect: 'none',
    }}>
      {children}
    </th>
  )
}

function Td({ children, num, bold }) {
  return (
    <td style={{
      padding: '9px 12px', textAlign: num ? 'right' : 'left',
      fontVariantNumeric: num ? 'tabular-nums' : 'normal',
      color: '#3a2818', fontWeight: bold ? 600 : 400,
    }}>
      {children}
    </td>
  )
}

function EngagementPanel({ rows, loading }) {
  if (loading) return null

  const totals = rows.reduce(
    (acc, r) => ({
      shown:   acc.shown + (r.shown || 0),
      clicked: acc.clicked + (r.clicked || 0),
      acted:   acc.acted + (r.acted || 0),
    }),
    { shown: 0, clicked: 0, acted: 0 }
  )

  const overallClickRate  = totals.shown > 0 ? Math.round(100 * totals.clicked / totals.shown) : 0
  const overallActionRate = totals.shown > 0 ? Math.round(100 * totals.acted / totals.shown)   : 0

  return (
    <section style={{
      marginTop: 32, padding: 20, background: '#fff',
      border: '1px solid #ecd9c0', borderRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#3a2818', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Engagement (last 14 days)
        </h3>
        <span style={{ fontSize: 11, color: '#9d8b73' }}>
          Did the cards drive follow-ups?
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ color: '#9d8b73', fontSize: 13, padding: '8px 0' }}>
          No engagement data yet — give it a week of real use.
        </div>
      ) : (
        <>
          {/* Overall summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <Stat label="Cards Shown"   value={totals.shown}  />
            <Stat label="Click Rate"    value={`${overallClickRate}%`}  caption={`${totals.clicked} clicks`} />
            <Stat label="Action Rate"   value={`${overallActionRate}%`} caption={`${totals.acted} activities logged`} />
          </div>

          {/* Per-rep funnel */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ecd9c0' }}>
                <th style={{ textAlign: 'left',  padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Rep</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Shown</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Clicked</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Acted</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Click %</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b5640', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Action %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id} style={{ borderBottom: '1px solid #f5ecdf' }}>
                  <td style={{ padding: '8px 6px', color: '#3a2818' }}>{r.rep_name || '—'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#3a2818' }}>{r.shown}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#3a2818' }}>{r.clicked}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#3a2818' }}>{r.acted}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6b5640' }}>{r.click_rate_pct}%</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.action_rate_pct >= 15 ? '#5b8c5a' : r.action_rate_pct >= 5 ? '#a0573a' : '#9d8b73', fontWeight: 600 }}>{r.action_rate_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontSize: 11, color: '#9d8b73', marginTop: 12 }}>
            Action rate ≥15% across reps means the cards are driving real follow-ups.
            Below 5% suggests the scoring needs tuning or reps aren't engaging.
          </p>
        </>
      )}
    </section>
  )
}

function Stat({ label, value, caption }) {
  return (
    <div style={{ background: '#fbf6ee', border: '1px solid #ecd9c0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b5640', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#3a2818', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: '#9d8b73', marginTop: 2 }}>{caption}</div>
      )}
    </div>
  )
}
