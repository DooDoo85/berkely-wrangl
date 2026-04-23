import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_COLORS = {
  active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  prospect: 'bg-blue-50 text-blue-700 border-blue-200',
  hold:     'bg-amber-50 text-amber-700 border-amber-200',
  closed:   'bg-stone-50 text-stone-500 border-stone-200',
}

export default function CustomerList() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [status,    setStatus]    = useState('all')

  useEffect(() => { fetchCustomers() }, [])

  async function fetchCustomers() {
    setLoading(true)
    const { data } = await supabase
      .from('customers')
      .select(`*, customer_contacts(id, name, email, is_primary)`)
      .eq('active', true)
      .order('account_name')
    setCustomers(data || [])
    setLoading(false)
  }

  const filtered = customers.filter(c => {
    const matchSearch = !search ||
      c.account_name.toLowerCase().includes(search.toLowerCase()) ||
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
          <h2 className="text-2xl font-display font-bold text-stone-800">Customers</h2>
          <p className="text-stone-400 text-sm mt-0.5">{counts.all} total accounts</p>
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
                  ? 'bg-brand-dark text-white border-brand-dark'
                  : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
              }`}
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
          <div className="p-12 text-center text-stone-400">Loading customers...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">◎</div>
            <div className="text-stone-600 font-semibold mb-1">No customers found</div>
            <div className="text-stone-400 text-sm">
              {search ? 'Try a different search term' : 'Add your first customer to get started'}
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Account</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Primary Contact</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Territory</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide">Status</th>
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
                    className={`border-b border-stone-50 hover:bg-stone-50 cursor-pointer transition-colors ${
                      i === filtered.length - 1 ? 'border-b-0' : ''
                    }`}
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold text-stone-800 text-sm">{c.account_name}</div>
                      {c.account_code && (
                        <div className="text-xs text-stone-400 font-mono mt-0.5">{c.account_code}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {primary ? (
                        <>
                          <div className="text-sm text-stone-700">{primary.name}</div>
                          <div className="text-xs text-stone-400 mt-0.5">{primary.email}</div>
                        </>
                      ) : (
                        <span className="text-stone-300 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-stone-500">{c.territory || '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[c.status]}`}>
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-stone-300 text-sm">→</span>
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
