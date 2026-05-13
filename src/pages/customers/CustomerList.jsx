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

export default function CustomerList() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isSalesRep = profile?.role === 'sales'
  const repName = profile?.full_name || profile?.email?.split('@')[0]

  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [status,    setStatus]    = useState('all')

  useEffect(() => { fetchCustomers() }, [profile])

  async function fetchCustomers() {
    if (!profile) return
    setLoading(true)

    let query = supabase
      .from('customers')
      .select(`*, customer_contacts(id, name, email, is_primary)`)
      .eq('active', true)
      .order('account_name')

    if (isSalesRep) {
      // Look up the rep's display name from the email map
      const { data: repRow } = await supabase
        .from('rep_email_map')
        .select('rep_name')
        .eq('email', profile.email)
        .single()

      // Match customers that are EITHER:
      //   a) ePIC-synced and assigned to this rep via sales_rep text field
      //   b) Manually created by this rep (created_by = their auth UUID)
      //   c) Explicitly assigned to this rep via assigned_rep_id
      //
      // This ensures reps see customers they created in Wrangl even when
      // those customers don't yet have a sales_rep value from ePIC.
      const filters = [`created_by.eq.${profile.id}`]

      if (repRow?.rep_name) {
        filters.push(`sales_rep.eq.${repRow.rep_name}`)
      }

      // assigned_rep_id is a UUID foreign key — include if it exists
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

  const filtered = customers.filter(c => {
    const matchSearch = !search ||
      c.account_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.account_code?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = status === 'all' || c.status === status
    return matchSearch && matchStatus
  })

  const counts = {
    all:      customers.length,
    active:   customers.filter(c => c.status === 'active').length,
    prospect: customers.filter(c => c.status === 'prospect').length,
    hold:     customers.filter(c => c.status === 'hold').length,
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="tracking-tight">Customers</h1>
          <p className="text-ink-muted text-sm mt-0.5">
            {isSalesRep ? `Your accounts · ${counts.all} total` : `${counts.all} total accounts`}
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
          {['all','active','prospect','hold'].map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                status === s
                  ? 'text-white border-transparent'
                  : 'text-ink-mid hover:border-[rgba(92,67,42,0.20)]'
              }`}
              style={status === s
                ? { background: '#2a1d10' }
                : { background: 'var(--surface-card)', borderColor: 'var(--surface-border)' }
              }
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              <span className="ml-1.5 opacity-60">{counts[s] ?? ''}</span>
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
            <div className="text-ink-strong font-semibold mb-1">No customers found</div>
            <div className="text-ink-muted text-sm">
              {search ? 'Try a different search term' : 'Add your first customer to get started'}
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--surface-border)', background: 'rgba(141,123,104,0.06)' }}>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Account</th>
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
                    <td className="px-5 py-4">
                      <div className="font-semibold text-ink-strong text-sm">{c.account_name}</div>
                      {c.account_code && (
                        <div className="text-xs text-ink-muted font-mono mt-0.5">{c.account_code}</div>
                      )}
                    </td>
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
