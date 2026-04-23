import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const EMPTY_CUSTOMER = {
  account_name: '', account_code: '', status: 'active',
  territory: '', terms: '', notes: '',
  billing_address:  { street: '', city: '', state: '', zip: '' },
  shipping_address: { street: '', city: '', state: '', zip: '' },
}

const EMPTY_CONTACT = { name: '', title: '', email: '', phone: '', is_primary: false }

export default function CustomerForm() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { profile } = useAuth()
  const isEdit     = !!id

  const [form,     setForm]     = useState(EMPTY_CUSTOMER)
  const [contacts, setContacts] = useState([{ ...EMPTY_CONTACT, is_primary: true }])
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (isEdit) loadCustomer()
  }, [id])

  async function loadCustomer() {
    setLoading(true)
    const { data } = await supabase
      .from('customers')
      .select('*, customer_contacts(*)')
      .eq('id', id)
      .single()
    if (data) {
      setForm({
        account_name:     data.account_name || '',
        account_code:     data.account_code || '',
        status:           data.status || 'active',
        territory:        data.territory || '',
        terms:            data.terms || '',
        notes:            data.notes || '',
        billing_address:  data.billing_address  || { street:'', city:'', state:'', zip:'' },
        shipping_address: data.shipping_address || { street:'', city:'', state:'', zip:'' },
      })
      if (data.customer_contacts?.length) setContacts(data.customer_contacts)
    }
    setLoading(false)
  }

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function setAddress(type, field, value) {
    setForm(f => ({ ...f, [type]: { ...f[type], [field]: value } }))
  }

  function setContact(i, field, value) {
    setContacts(cs => cs.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  function addContact() {
    setContacts(cs => [...cs, { ...EMPTY_CONTACT }])
  }

  function removeContact(i) {
    setContacts(cs => cs.filter((_, idx) => idx !== i))
  }

  function setPrimary(i) {
    setContacts(cs => cs.map((c, idx) => ({ ...c, is_primary: idx === i })))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      let customerId = id

      if (isEdit) {
        const { error } = await supabase
          .from('customers')
          .update({ ...form, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('customers')
          .insert({ ...form, created_by: profile?.id })
          .select()
          .single()
        if (error) throw error
        customerId = data.id
      }

      // Save contacts
      if (isEdit) {
        await supabase.from('customer_contacts').delete().eq('customer_id', customerId)
      }
      const validContacts = contacts.filter(c => c.name.trim())
      if (validContacts.length) {
        const { error } = await supabase
          .from('customer_contacts')
          .insert(validContacts.map(c => ({ ...c, customer_id: customerId })))
        if (error) throw error
      }

      navigate(`/customers/${customerId}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="card p-12 text-center text-stone-400">Loading...</div>
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-ghost text-sm">← Back</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">
          {isEdit ? 'Edit Customer' : 'New Customer'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Basic Info */}
        <div className="card p-6">
          <h3 className="font-semibold text-stone-700 mb-4">Account Info</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Account Name *</label>
              <input className="input" required value={form.account_name}
                onChange={e => setField('account_name', e.target.value)}
                placeholder="e.g. BLINDSTER" />
            </div>
            <div>
              <label className="label">Account Code</label>
              <input className="input" value={form.account_code}
                onChange={e => setField('account_code', e.target.value)}
                placeholder="e.g. BLND" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status}
                onChange={e => setField('status', e.target.value)}>
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="hold">Hold</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="label">Territory</label>
              <input className="input" value={form.territory}
                onChange={e => setField('territory', e.target.value)}
                placeholder="e.g. Texas" />
            </div>
            <div>
              <label className="label">Payment Terms</label>
              <input className="input" value={form.terms}
                onChange={e => setField('terms', e.target.value)}
                placeholder="e.g. Net 30" />
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea className="input h-20 resize-none" value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Internal notes about this account..." />
            </div>
          </div>
        </div>

        {/* Addresses */}
        <div className="card p-6">
          <h3 className="font-semibold text-stone-700 mb-4">Addresses</h3>
          <div className="grid grid-cols-2 gap-6">
            {['billing_address', 'shipping_address'].map(type => (
              <div key={type}>
                <div className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-3">
                  {type === 'billing_address' ? 'Billing' : 'Shipping'}
                </div>
                <div className="space-y-2">
                  <input className="input" placeholder="Street"
                    value={form[type]?.street || ''}
                    onChange={e => setAddress(type, 'street', e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input" placeholder="City"
                      value={form[type]?.city || ''}
                      onChange={e => setAddress(type, 'city', e.target.value)} />
                    <input className="input" placeholder="State"
                      value={form[type]?.state || ''}
                      onChange={e => setAddress(type, 'state', e.target.value)} />
                  </div>
                  <input className="input" placeholder="ZIP"
                    value={form[type]?.zip || ''}
                    onChange={e => setAddress(type, 'zip', e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contacts */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-stone-700">Contacts</h3>
            <button type="button" onClick={addContact} className="btn-ghost text-xs">+ Add Contact</button>
          </div>
          <div className="space-y-4">
            {contacts.map((c, i) => (
              <div key={i} className="border border-stone-100 rounded-xl p-4 bg-stone-50/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPrimary(i)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-all ${
                        c.is_primary
                          ? 'bg-brand-gold/10 text-brand-gold border-brand-gold/30'
                          : 'bg-white text-stone-400 border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      {c.is_primary ? '★ Primary' : 'Set Primary'}
                    </button>
                  </div>
                  {contacts.length > 1 && (
                    <button type="button" onClick={() => removeContact(i)}
                      className="text-stone-300 hover:text-red-400 text-sm transition-colors">✕</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Name *</label>
                    <input className="input" value={c.name}
                      onChange={e => setContact(i, 'name', e.target.value)}
                      placeholder="Full name" />
                  </div>
                  <div>
                    <label className="label">Title</label>
                    <input className="input" value={c.title || ''}
                      onChange={e => setContact(i, 'title', e.target.value)}
                      placeholder="e.g. Buyer" />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input className="input" type="email" value={c.email || ''}
                      onChange={e => setContact(i, 'email', e.target.value)}
                      placeholder="email@company.com" />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input" value={c.phone || ''}
                      onChange={e => setContact(i, 'phone', e.target.value)}
                      placeholder="(555) 000-0000" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end pb-6">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary px-6">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Customer'}
          </button>
        </div>
      </form>
    </div>
  )
}
