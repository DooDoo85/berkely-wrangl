import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../components/AuthProvider'
import { supabase } from '../lib/supabase'

// =====================================================================
// MyOpenQuotes — rep's personal aging-quote worklist
//
// Pulls from v_rep_attention_quotes, filtered to the signed-in rep,
// further filtered to customers with quotes within the last 30 days.
// Customer-grouped (one row per customer, aggregating their quotes).
// Sortable by attention score, oldest age, total value, or quote count.
//
// Linked from the NeedsAttention widget on RepHome.
// =====================================================================

const TIER_STYLES = {
  urgent:  { pill: 'pill-critical', label: 'Urgent'  },
  flagged: { pill: 'pill-warning',  label: 'Flagged' },
}

const fmtMoney = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
const fmtDays  = (n) => n == null ? '—' : n === 1 ? '1 day' : `${n} days`

export default function MyOpenQuotes() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy]   = useState('attention_score')
  const [sortDir, setSortDir] = useState('desc')
  const [search, setSearch]   = useState('')

  useEffect(() => {
    if (!profile?.full_name) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.full_name])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('v_rep_attention_quotes')
      .select('*')
      .ilike('rep_name', profile.full_name)

    if (error) {
      console.error('MyOpenQuotes load error:', error)
      setRows([])
    } else {
      // 30-day filter — same gate as the widget
      const recent = (data || []).filter(c => (c.oldest_quote_age_days ?? 999) <= 30)
      setRows(recent)
    }
    setLoading(false)
  }

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      // Sensible default direction per column
      setSortDir(col === 'account_name' ? 'asc' : 'desc')
    }
  }

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? rows.filter(r => (r.account_name || '').toLowerCase().includes(q))
      : rows
    return [...filtered].sort((a, b) => {
      const av = a[sortBy] ?? 0
      const bv = b[sortBy] ?? 0
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [rows, sortBy, sortDir, search])

  const totals = useMemo(() => ({
    customers: visibleRows.length,
    quotes:    visibleRows.reduce((s, r) => s + (Number(r.aging_quote_count) || 0), 0),
    value:     visibleRows.reduce((s, r) => s + (Number(r.aging_quote_total_value) || 0), 0),
  }), [visibleRows])

  const arrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1>My Open Quotes</h1>
          <p className="text-sm text-ink-muted mt-1">
            Aging quotes from the last 30 days, grouped by customer.
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-ink-muted hover:text-ink-strong border border-[var(--surface-border)] px-3 py-1.5 rounded transition-colors"
        >
          ← Home
        </button>
      </div>

      {/* Filters + totals */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customers..."
          className="input max-w-xs"
        />
        <span className="text-xs text-ink-mid ml-auto">
          <strong className="text-ink-strong">{totals.customers}</strong> {totals.customers === 1 ? 'customer' : 'customers'}
          {' · '}
          <strong className="text-ink-strong">{totals.quotes}</strong> {totals.quotes === 1 ? 'quote' : 'quotes'}
          {' · '}
          <strong className="text-ink-strong">{fmtMoney(totals.value)}</strong> total
        </span>
      </div>

      {loading ? (
        <div className="text-ink-muted text-sm p-4">Loading…</div>
      ) : visibleRows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="text-ink-mid font-semibold">
            {search ? 'No customers match the search.' : 'No open quotes from the last 30 days.'}
          </p>
          <p className="text-ink-muted text-sm mt-1">
            {search ? '' : 'You\'re all caught up.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-border" style={{ background: 'rgba(141,123,104,0.06)' }}>
              <tr>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider w-24">Tier</th>
                <ThSort onClick={() => toggleSort('account_name')} align="left">Customer{arrow('account_name')}</ThSort>
                <ThSort onClick={() => toggleSort('aging_quote_count')}>Quotes{arrow('aging_quote_count')}</ThSort>
                <ThSort onClick={() => toggleSort('aging_quote_total_value')}>Total Value{arrow('aging_quote_total_value')}</ThSort>
                <ThSort onClick={() => toggleSort('oldest_quote_age_days')}>Oldest{arrow('oldest_quote_age_days')}</ThSort>
                <ThSort onClick={() => toggleSort('days_since_activity')}>Last Activity{arrow('days_since_activity')}</ThSort>
                <ThSort onClick={() => toggleSort('ytd_revenue')}>YTD Revenue{arrow('ytd_revenue')}</ThSort>
                <ThSort onClick={() => toggleSort('attention_score')}>Score{arrow('attention_score')}</ThSort>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const style = TIER_STYLES[row.tier] || TIER_STYLES.flagged
                return (
                  <tr
                    key={row.customer_id}
                    onClick={() => navigate(`/customers/${row.customer_id}?tab=quotes`)}
                    className="border-b border-surface-border-soft hover:bg-black/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <span className={style.pill}>{style.label}</span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink-strong">
                      {row.account_name}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-mid">{row.aging_quote_count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-mid">{fmtMoney(row.aging_quote_total_value)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-mid">{fmtDays(row.oldest_quote_age_days)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted italic">
                      {row.last_activity_at ? `${fmtDays(row.days_since_activity)} ago` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-mid">{fmtMoney(row.ytd_revenue || 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-ink-strong">{row.attention_score}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink-muted mt-3">
        <strong className="text-ink-mid">Score</strong> = composite urgency (quote count, value, age, days since activity).
        {' '}<strong className="text-ink-mid">Tier</strong>: Urgent ≥ 400, Flagged ≥ 200.
        {' '}Click any row to open that customer's quotes.
      </p>
    </div>
  )
}

function ThSort({ onClick, children, align = 'right' }) {
  const alignCls = align === 'left' ? 'text-left' : 'text-right'
  return (
    <th
      onClick={onClick}
      className={`${alignCls} px-3 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-ink-strong select-none`}
    >
      {children}
    </th>
  )
}
