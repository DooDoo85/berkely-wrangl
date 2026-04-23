import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_COLORS = {
  active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  prospect: 'bg-blue-50 text-blue-700 border-blue-200',
  hold:     'bg-amber-50 text-amber-700 border-amber-200',
  closed:   'bg-stone-50 text-stone-500 border-stone-200',
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-3 py-2 border-b border-stone-50 last:border-0">
      <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-stone-700">{value}</span>
    </div>
  )
}

function AddressBlock({ label, address }) {
  if (!address || !address.street) return null
  return (
    <div>
      <div className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-stone-600 leading-relaxed">
        {address.street}<br />
        {address.city}{address.city && address.state ? ', ' : ''}{address.state} {address.zip}
      </div>
    </div>
  )
}

export default function CustomerDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadCustomer() }, [id])

  async function loadCustomer() {
    const { data } = await supabase
      .from('customers')
      .select('*, customer_contacts(*), profiles!customers_assigned_rep_id_fkey(full_name)')
      .eq('id', id)
      .single()
    setCustomer(data)
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm(`Archive ${customer.account_name}? They won't be deleted, just hidden.`)) return
    setDeleting(true)
    await supabase.from('customers').update({ active: false }).eq('id', id)
    navigate('/customers')
  }

  if (loading) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="card p-12 text-center text-stone-400">Loading...</div>
    </div>
  )

  if (!customer) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="card p-12 text-center text-stone-400">Customer not found</div>
    </div>
  )

  const primaryContact = customer.customer_contacts?.find(c => c.is_primary) || customer.customer_contacts?.[0]
  const otherContacts  = customer.customer_contacts?.filter(c => c !== primaryContact) || []

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/customers')} className="btn-ghost text-sm">← Customers</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/customers/${id}/edit`)} className="btn-ghost text-sm">Edit</button>
          <button onClick={handleDelete} disabled={deleting}
            className="text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300
                       bg-white px-3 py-1.5 rounded-lg text-sm transition-all">
            Archive
          </button>
        </div>
      </div>

      {/* Hero card */}
      <div className="card p-6 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-display font-bold text-stone-800">
                {customer.account_name}
              </h2>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[customer.status]}`}>
                {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
              </span>
            </div>
            {customer.account_code && (
              <div className="text-sm font-mono text-stone-400">{customer.account_code}</div>
            )}
          </div>
          <div className="w-12 h-12 rounded-xl bg-brand-dark flex items-center justify-center flex-shrink-0">
            <span className="text-brand-gold font-display font-bold text-lg">
              {customer.account_name.charAt(0)}
            </span>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-stone-100">
          <InfoRow label="Territory"  value={customer.territory} />
          <InfoRow label="Terms"      value={customer.terms} />
          <InfoRow label="Assigned"   value={customer.profiles?.full_name} />
          {customer.notes && (
            <div className="mt-3 p-3 bg-stone-50 rounded-lg text-sm text-stone-600">
              {customer.notes}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">

        {/* Contacts */}
        <div className="col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-stone-700">Contacts</h3>
            <button onClick={() => navigate(`/customers/${id}/edit`)}
              className="text-xs text-brand-gold hover:text-amber-600 font-semibold">
              + Add
            </button>
          </div>

          {customer.customer_contacts?.length === 0 ? (
            <div className="text-stone-400 text-sm text-center py-6">No contacts yet</div>
          ) : (
            <div className="space-y-3">
              {[primaryContact, ...otherContacts].filter(Boolean).map(c => (
                <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl bg-stone-50">
                  <div className="w-8 h-8 rounded-full bg-brand-dark/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-brand-dark">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-stone-700">{c.name}</span>
                      {c.is_primary && (
                        <span className="text-[10px] font-bold text-brand-gold bg-brand-gold/10
                                         border border-brand-gold/20 px-1.5 py-0.5 rounded-full">
                          Primary
                        </span>
                      )}
                    </div>
                    {c.title && <div className="text-xs text-stone-400 mt-0.5">{c.title}</div>}
                    <div className="mt-1 space-y-0.5">
                      {c.email && <div className="text-xs text-stone-500">{c.email}</div>}
                      {c.phone && <div className="text-xs text-stone-500">{c.phone}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Addresses + Coming soon */}
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="font-semibold text-stone-700 mb-4">Addresses</h3>
            <div className="space-y-4">
              <AddressBlock label="Billing"  address={customer.billing_address} />
              <AddressBlock label="Shipping" address={customer.shipping_address} />
              {!customer.billing_address?.street && !customer.shipping_address?.street && (
                <div className="text-stone-400 text-xs text-center py-2">No addresses on file</div>
              )}
            </div>
          </div>

          <div className="card p-5 border-dashed opacity-60">
            <h3 className="font-semibold text-stone-500 mb-2 text-sm">Orders</h3>
            <div className="text-xs text-stone-400">Order history coming in Phase 2</div>
          </div>

          <div className="card p-5 border-dashed opacity-60">
            <h3 className="font-semibold text-stone-500 mb-2 text-sm">Activities</h3>
            <div className="text-xs text-stone-400">Activity log coming in Phase 3</div>
          </div>
        </div>
      </div>
    </div>
  )
}
