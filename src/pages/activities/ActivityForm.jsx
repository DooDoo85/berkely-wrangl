import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const TYPES = [
  { value: 'call',        label: 'Call',        icon: '📞' },
  { value: 'email',       label: 'Email',        icon: '✉️' },
  { value: 'note',        label: 'Note',         icon: '📝' },
  { value: 'meeting',     label: 'Meeting',      icon: '🤝' },
  { value: 'sample_book', label: 'Sample Book',  icon: '📚' },
]

export default function ActivityForm({
  onSave,
  onCancel,
  defaultCustomerId = null,
  defaultOrderId    = null,
  compact           = false,
}) {
  const { profile } = useAuth()
  const [type,        setType]        = useState('call')
  const [subject,     setSubject]     = useState('')
  const [body,        setBody]        = useState('')
  const [customerId,  setCustomerId]  = useState(defaultCustomerId || '')
  const [orderId,     setOrderId]     = useState(defaultOrderId || '')
  const [followUp,    setFollowUp]    = useState('')
  const [quantity,    setQuantity]    = useState(1)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [customers,   setCustomers]   = useState([])
  const [orders,      setOrders]      = useState([])
  const [custSearch,  setCustSearch]  = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [showCustDrop,  setShowCustDrop]  = useState(false)
  const [showOrderDrop, setShowOrderDrop] = useState(false)

  useEffect(() => {
    fetchCustomers()
    if (defaultCustomerId) loadDefaultCustomer(defaultCustomerId)
    if (defaultOrderId)    loadDefaultOrder(defaultOrderId)
  }, [])

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customers').select('id, account_name')
      .eq('active', true).order('account_name').limit(200)
    setCustomers(data || [])
  }

  async function loadDefaultCustomer(id) {
    const { data } = await supabase.from('customers').select('account_name').eq('id', id).single()
    if (data) setCustSearch(data.account_name)
  }

  async function loadDefaultOrder(id) {
    const { data } = await supabase.from('orders').select('order_number, customer_name').eq('id', id).single()
    if (data) setOrderSearch(`#${data.order_number} — ${data.customer_name}`)
  }

  const filteredCustomers = customers.filter(c =>
    c.account_name.toLowerCase().includes(custSearch.toLowerCase())
  ).slice(0, 6)

  async function searchOrders(q) {
    setOrderSearch(q)
    setShowOrderDrop(true)
    if (!q) { setOrders([]); return }
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, customer_name')
      .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
      .order('order_date', { ascending: false })
      .limit(6)
    setOrders(data || [])
  }

  async function handleSave() {
    if (!body.trim() && !subject.trim()) {
      setError('Please add a subject or note')
      return
    }
    setSaving(true)
    setError('')

    // For sample books auto-generate subject if not provided
    const finalSubject = type === 'sample_book' && !subject.trim()
      ? `Sample book sold — qty ${quantity}`
      : subject.trim() || null

    const finalBody = type === 'sample_book' && !body.trim()
      ? `${quantity} sample book(s) sold`
      : body.trim() || null

    const { error } = await supabase.from('activities').insert({
      activity_type:  type,
      subject:        finalSubject,
      body:           finalBody,
      customer_id:    customerId || null,
      order_id:       orderId    || null,
      user_id:        profile?.id,
      follow_up_date: followUp || null,
      activity_date:  new Date().toISOString(),
      ...(type === 'sample_book' ? { quantity } : {}),
    })

    if (error) { setError(error.message); setSaving(false); return }
    onSave?.()
  }

  const isSampleBook = type === 'sample_book'

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-display font-bold text-stone-800 text-lg">Log Activity</h3>
        {onCancel && (
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-600 text-xl leading-none">✕</button>
        )}
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-5 gap-2 mb-5">
        {TYPES.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-all ${
              type === t.value
                ? 'bg-brand-dark text-white border-brand-dark'
                : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {/* Sample book quantity */}
        {isSampleBook && (
          <div>
            <label className="label">Quantity Sold</label>
            <input
              className="input"
              type="number"
              min="1"
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value) || 1)}
            />
          </div>
        )}

        {/* Subject */}
        <div>
          <label className="label">
            Subject <span className="text-stone-300 font-normal normal-case">(optional)</span>
          </label>
          <input
            className="input"
            placeholder={isSampleBook ? 'e.g. Sold sample book to new prospect' : 'Quick summary...'}
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
        </div>

        {/* Body */}
        <div>
          <label className="label">Notes {!isSampleBook && '*'}</label>
          <textarea
            className="input h-24 resize-none"
            placeholder={isSampleBook
              ? 'Any additional notes...'
              : 'What happened? What was discussed?'}
            value={body}
            onChange={e => setBody(e.target.value)}
            autoFocus={!isSampleBook}
          />
        </div>

        {/* Customer */}
        {!defaultCustomerId && (
          <div className="relative">
            <label className="label">Customer <span className="text-stone-300 font-normal normal-case">(optional)</span></label>
            <input
              className="input"
              placeholder="Search customers..."
              value={custSearch}
              onChange={e => { setCustSearch(e.target.value); setShowCustDrop(true); if (!e.target.value) setCustomerId('') }}
              onFocus={() => setShowCustDrop(true)}
              onBlur={() => setTimeout(() => setShowCustDrop(false), 200)}
            />
            {showCustDrop && filteredCustomers.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                {filteredCustomers.map(c => (
                  <button key={c.id} type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-stone-50"
                    onClick={() => { setCustomerId(c.id); setCustSearch(c.account_name); setShowCustDrop(false) }}>
                    {c.account_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Order */}
        {!defaultOrderId && !isSampleBook && (
          <div className="relative">
            <label className="label">Order <span className="text-stone-300 font-normal normal-case">(optional)</span></label>
            <input
              className="input"
              placeholder="Search by order # or customer..."
              value={orderSearch}
              onChange={e => searchOrders(e.target.value)}
              onFocus={() => orderSearch && setShowOrderDrop(true)}
              onBlur={() => setTimeout(() => setShowOrderDrop(false), 200)}
            />
            {showOrderDrop && orders.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                {orders.map(o => (
                  <button key={o.id} type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-stone-50"
                    onClick={() => { setOrderId(o.id); setOrderSearch(`#${o.order_number} — ${o.customer_name}`); setShowOrderDrop(false) }}>
                    <span className="font-mono font-semibold text-brand-light">#{o.order_number}</span>
                    <span className="text-stone-500 ml-2">{o.customer_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Follow up — not shown for sample books */}
        {!isSampleBook && (
          <div>
            <label className="label">Follow-up Date <span className="text-stone-300 font-normal normal-case">(optional)</span></label>
            <input
              className="input"
              type="date"
              value={followUp}
              onChange={e => setFollowUp(e.target.value)}
              min={new Date().toISOString().slice(0,10)}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex gap-3 mt-5">
        {onCancel && <button onClick={onCancel} className="btn-ghost flex-1">Cancel</button>}
        <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
          {saving ? 'Saving...' : 'Log Activity'}
        </button>
      </div>
    </div>
  )
}
