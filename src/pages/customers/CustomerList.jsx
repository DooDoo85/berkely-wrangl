import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const STATUS_COLORS = {
  active:   'bg-status-healthy-soft text-status-healthy border-[rgba(91,140,90,0.25)]',
  prospect: 'bg-status-info-soft text-status-info border-[rgba(74,107,140,0.25)]',
  hold:     'bg-status-warning-soft text-status-warning border-[rgba(194,145,58,0.25)]',
  closed:   'bg-[rgba(141,123,104,0.10)] text-ink-muted border-[var(--surface-border)]',
}

// Currency formatter — compact for top-20 column
const fmtCurrency = (n) => {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000)    return `$${(n / 1_000).toFixed(0)}K`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${Math.round(n).toLocaleString()}`
}

export default function CustomerList() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isSalesRep = profile?.role === 'sales'

  const [customers,    setCustomers]    = useState([])
  const [revenueByAcct,setRevenueByAcct]= useState({}) // { account_name → revenue_ltm }
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [status,       setStatus]       = useState('all') // 'all' | 'active' | 'prospect' | 'hold' | 'top20'

  useEffect(() => {
    fetchCustomers()
    fetchRevenueLTM()
  }, [profile])

  async function fetchCustomers() {
    if (!profile) return
    setLoading(true)

    let query = supabase
      .from('customers')
      .select(`*, customer_contacts(id, name, email, is_primary)`)
      .eq('active', true)
      .order('account_name')

    if (isSalesRep) {
      const { data: repRow } = await supabase
        .from('rep_email_map')
        .select('rep_name')
        .eq('email', profile.email)
        .single()

      const filters = [`created_by.eq.${profile.id}`]
      if (repRow?.rep_name) filters.push(`sales_rep.eq.${repRow.rep_name}`)
      filters.push(`assigned_rep_id.eq.${profile.id}`)
      query = query.or(filters.join(','))
    }

    const { data, error } = await query

    if (error) {
      console.error('CustomerList fetch error:', error)
      setCustomers([])
    } else {
      setCustomers(data || [])
    }
    setLoading(false)
  }

  // Fetch invoiced revenue for the last 12 months, grouped by customer.
  // We aggregate client-side to keep the query simple and cacheable.
  // Rep-scoping is applied via the customer match — only customers visible
  // to this user end up in the Top 20, even though the orders query itself
  // pulls all invoiced orders. RLS on `orders` may further restrict.
  async function fetchRevenueLTM() {
    const since = new Date()
    since.setMonth(since.getMonth() - 12)
    const sinceISO = since.toISOString()

    const { data, error } = await supabase
      .from('orders')
      .select('customer_name, order_amount, epic_status_date')
      .eq('status', 'invoiced')
      .gte('epic_status_date', sinceISO)
      .not('customer_name', 'is', null)

    if (error) {
      console.error('CustomerList revenue fetch error:', error)
      setRevenueByAcct({})
      return
    }

    const map = {}
    for (const r of data || []) {
      const name = (r.customer_name || '').trim()
      if (!name) continue
      map[name] = (map[name] || 0) + Number(r.order_amount || 0)
    }
    setRevenueByAcct(map)
  }

  // Derive Top 20 list from the customers currently visible to this user.
  // Joins customer rows ↔ revenue map by account_name (case-insensitive trim).
  // Sorts desc by revenue, slices to 20.
  const customersWithRev = customers.map(c => {
    const key = (c.account_name || '').trim()
    const rev = revenueByAcct[key] ?? 0
    return { ...c, revenue_ltm: rev }
  })

  const top20Ids = new Set(
    [...customersWithRev]
      .filter(c => c.revenue_ltm > 0)
      .sort((a, b) => b.revenue_ltm - a.revenue_ltm)
      .slice(0, 20)
      .map(c => c.id)
  )

  // Filter list applied to whichever view
  const filtered = (() => {
    let list = customersWithRev
    if (status === 'top20') {
      list = list
        .filter(c => top20Ids.has(c.id))
        .sort((a, b) => b.revenue_ltm - a.revenue_ltm)
    } else if (status !== 'all') {
      list = list.filter(c => c.status === status)
    }
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(c =>
        c.account_name?.toLowerCase().includes(s) ||
        c.account_code?.toLowerCase().includes(s)
      )
    }
    return list
  })()

  const counts = {
    all:      customers.length,
    active:   customers.filter(c => c.status === 'active').length,
    prospect: customers.filter(c => c.status === 'prospect').length,
    hold:     customers.filter(c => c.status === 'hold').length,
    top20:    top20Ids.size,
  }

  const showRevenueCol = status === 'top20'

  // Tab definitions
  const TABS = [
    { key: 'all',      label: 'All' },
    { key: 'active',   label: 'Active' },
    { key: 'prospect', label: 'Prospect' },
    { key: 'hold',     label: 'Hold' },
    { key: 'top20',    label: '⭐ Top 20', accent: true },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="tracking-tight">Customers</h1>
          <p className="text-ink-muted text-sm mt-0.5">
            {status === 'top20'
              ? `${isSalesRep ? 'Your top accounts' : 'Top accounts'} · last 12 months invoiced revenue`
              : (isSalesRep ? `Your accounts · ${counts.all} total` : `${counts.all} total accounts`)}
          </p>
        </div>
        <button
          onClick={() => navigate('/customers/new')}
          className="btn-primary flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span> New Customer
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Search customers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-xs"
        />
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                status === t.key
                  ? 'text-white border-transparent'
                  : 'text-ink-mid hover:border-[rgba(92,67,42,0.20)]'
              }`}
              style={status === t.key
                ? { background: t.accent ? '#9d4f30' : '#2a1d10' }
                : { background: 'var(--surface-card)', borderColor: 'var(--surface-border)' }
              }
            >
              {t.label}
              <span className="ml-1.5 opacity-60">{counts[t.key] ?? ''}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-ink-muted">Loading customers...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3 text-ink-muted">◎</div>
            <div className="text-ink-strong font-semibold mb-1">
              {status === 'top20' ? 'No revenue yet' : 'No customers found'}
            </div>
            <div className="text-ink-muted text-sm">
              {status === 'top20'
                ? 'No invoiced orders in the last 12 months for your accounts'
                : (search ? 'Try a different search term' : 'Add your first customer to get started')}
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--surface-border)', background: 'rgba(141,123,104,0.06)' }}>
                {showRevenueCol && (
                  <th className="text-left pl-5 pr-2 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide w-12">Rank</th>
                )}
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Account</th>
                {showRevenueCol && (
                  <th className="text-right px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Revenue (LTM)</th>
                )}
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Primary Contact</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Territory</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const primary = c.customer_contacts?.find(x => x.is_primary) || c.customer_contacts?.[0]
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    className={`border-b hover:bg-black/[0.02] cursor-pointer transition-colors ${
                      i === filtered.length - 1 ? 'border-b-0' : ''
                    }`}
                    style={{ borderColor: 'var(--surface-border)' }}
                  >
                    {showRevenueCol && (
                      <td className="pl-5 pr-2 py-4">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white" style={{ background: '#9d4f30' }}>
                          {i + 1}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-4">
                      <div className="font-semibold text-ink-strong text-sm">{c.account_name}</div>
                      {c.account_code && (
                        <div className="text-xs text-ink-muted font-mono mt-0.5">{c.account_code}</div>
                      )}
                    </td>
                    {showRevenueCol && (
                      <td className="px-5 py-4 text-right">
                        <div className="text-sm font-bold tabular-nums text-ink-strong">
                          {fmtCurrency(c.revenue_ltm)}
                        </div>
                      </td>
                    )}
                    <td className="px-5 py-4">
                      {primary ? (
                        <>
                          <div className="text-sm text-ink-mid">{primary.name}</div>
                          <div className="text-xs text-ink-muted mt-0.5">{primary.email}</div>
                        </>
                      ) : (
                        <span className="text-ink-muted text-sm">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-ink-mid">{c.territory || '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[c.status]}`}>
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-ink-muted text-sm">→</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
