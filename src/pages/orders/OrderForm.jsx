import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const GROUPS = [
  'ANABELLE ROLLER SHADES',
  'BERKELY EXPRESS ROLLER SHADES',
  'BERKELY DESIGNER ROLLER SHADES',
  'BERKELY FAUX',
]

const PRODUCTS_BY_GROUP = {
  'ANABELLE ROLLER SHADES':         ['MOTORIZED ROLLER SHADE', 'CLUTCH ROLLER SHADE', 'CORDLESS ROLLER SHADE'],
  'BERKELY EXPRESS ROLLER SHADES':  ['MOTORIZED ROLLER SHADE', 'CLUTCH ROLLER SHADE', 'CORDLESS ROLLER SHADE'],
  'BERKELY DESIGNER ROLLER SHADES': ['MOTORIZED ROLLER SHADE', 'CLUTCH ROLLER SHADE', 'CORDLESS ROLLER SHADE'],
  'BERKELY FAUX':                   ['EXPRESS FAUX'],
}

const EMPTY_ITEM = {
  group_name: '', product_name: '', width_inches: '',
  height_inches: '', quantity: 1, unit_price: '', notes: ''
}

export default function OrderForm() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const { profile } = useAuth()
  const isEdit      = !!id

  const [form,      setForm]      = useState({
    customer_id: '', customer_name: '', status: 'draft',
    sidemark: '', po_number: '', order_date: new Date().toISOString().slice(0,10),
    requested_ship_date: '', ship_via: '', notes: '', sales_rep: profile?.full_name || ''
  })
  const [items,     setItems]     = useState([{ ...EMPTY_ITEM }])
  const [customers, setCustomers] = useState([])
  const [custSearch, setCustSearch] = useState('')
  const [showCustDrop, setShowCustDrop] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => { fetchCustomers() }, [])
  useEffect(() => { if (isEdit) loadOrder() }, [id])

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id, account_name')
      .eq('active', true)
      .order('account_name')
    setCustomers(data || [])
  }

  async function loadOrder() {
    setLoading(true)
    const [orderRes, itemsRes] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('order_items').select('*').eq('order_id', id).order('line_number'),
    ])
    if (orderRes.data) {
      const o = orderRes.data
      setForm({
        customer_id: o.customer_id || '',
        customer_name: o.customer_name || '',
        status: o.status,
        sidemark: o.sidemark || '',
        po_number: o.po_number || '',
        order_date: o.order_date || '',
        requested_ship_date: o.requested_ship_date || '',
        ship_via: o.ship_via || '',
        notes: o.notes || '',
        sales_rep: o.sales_rep || '',
      })
      setCustSearch(o.customer_name || '')
      if (itemsRes.data?.length) setItems(itemsRes.data)
    }
    setLoading(false)
  }

  function setField(field, value) { setForm(f => ({ ...f, [field]: value })) }

  function setItem(i, field, value) {
    setItems(items => items.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [field]: value }
      if (field === 'group_name') updated.product_name = ''
      // Auto-calc line total
      if (field === 'quantity' || field === 'unit_price') {
        const qty   = field === 'quantity'   ? parseFloat(value) : parseFloat(item.quantity)
        const price = field === 'unit_price' ? parseFloat(value) : parseFloat(item.unit_price)
        updated.line_total = (!isNaN(qty) && !isNaN(price)) ? (qty * price).toFixed(2) : ''
      }
      return updated
    }))
  }

  function addItem() { setItems(items => [...items, { ...EMPTY_ITEM }]) }
  function removeItem(i) { setItems(items => items.filter((_, idx) => idx !== i)) }

  const filteredCustomers = customers.filter(c =>
    c.account_name.toLowerCase().includes(custSearch.toLowerCase())
  ).slice(0, 8)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      // Generate order number for new orders
      let orderNumber = null
      if (!isEdit) {
        const { data: maxOrder } = await supabase
          .from('orders')
          .select('order_number')
          .not('epic_id', 'is', null)
          .order('order_number', { ascending: false })
          .limit(1)
        // Use W prefix to distinguish Wrangl orders from ePIC orders
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .like('order_number', 'W%')
        orderNumber = `W${String((count || 0) + 1).padStart(5, '0')}`
      }

      const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.line_total) || 0), 0)

      let orderId = id
      if (isEdit) {
        await supabase.from('orders').update({
          ...form, subtotal, updated_at: new Date().toISOString()
        }).eq('id', id)
      } else {
        const { data, error } = await supabase
          .from('orders')
          .insert({
            ...form,
            order_number: orderNumber,
            subtotal,
            source: 'wrangl',
            read_only: false,
            created_by: profile?.id,
          })
          .select()
          .single()
        if (error) throw error
        orderId = data.id
      }

      // Save line items
      await supabase.from('order_items').delete().eq('order_id', orderId)
      const validItems = items
        .filter(item => item.group_name || item.product_name || item.notes)
        .map((item, i) => ({
          order_id:      orderId,
          line_number:   i + 1,
          group_name:    item.group_name || null,
          product_name:  item.product_name || null,
          width_inches:  parseFloat(item.width_inches) || null,
          height_inches: parseFloat(item.height_inches) || null,
          quantity:      parseInt(item.quantity) || 1,
          unit_price:    parseFloat(item.unit_price) || 0,
          line_total:    parseFloat(item.line_total) || 0,
          notes:         item.notes || null,
        }))
      if (validItems.length) {
        await supabase.from('order_items').insert(validItems)
      }

      navigate(`/orders/${orderId}`)
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

  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.line_total) || 0), 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-ghost text-sm">← Back</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">
          {isEdit ? 'Edit Order' : 'New Order'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Order info */}
        <div className="card p-6">
          <h3 className="font-semibold text-stone-700 mb-4">Order Info</h3>
          <div className="grid grid-cols-2 gap-4">

            {/* Customer search */}
            <div className="col-span-2 relative">
              <label className="label">Customer *</label>
              <input
                className="input"
                placeholder="Search customers..."
                value={custSearch}
                onChange={e => { setCustSearch(e.target.value); setShowCustDrop(true); setField('customer_name', e.target.value) }}
                onFocus={() => setShowCustDrop(true)}
                onBlur={() => setTimeout(() => setShowCustDrop(false), 200)}
                required
              />
              {showCustDrop && filteredCustomers.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-stone-50 transition-colors"
                      onClick={() => {
                        setField('customer_id', c.id)
                        setField('customer_name', c.account_name)
                        setCustSearch(c.account_name)
                        setShowCustDrop(false)
                      }}
                    >
                      {c.account_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label">Sidemark</label>
              <input className="input" value={form.sidemark}
                onChange={e => setField('sidemark', e.target.value)}
                placeholder="Customer job reference" />
            </div>
            <div>
              <label className="label">Customer PO #</label>
              <input className="input" value={form.po_number}
                onChange={e => setField('po_number', e.target.value)} />
            </div>
            <div>
              <label className="label">Order Date</label>
              <input className="input" type="date" value={form.order_date}
                onChange={e => setField('order_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Requested Ship Date</label>
              <input className="input" type="date" value={form.requested_ship_date}
                onChange={e => setField('requested_ship_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Sales Rep</label>
              <input className="input" value={form.sales_rep}
                onChange={e => setField('sales_rep', e.target.value)} />
            </div>
            <div>
              <label className="label">Ship Via</label>
              <input className="input" value={form.ship_via}
                onChange={e => setField('ship_via', e.target.value)}
                placeholder="e.g. Best Way" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status}
                onChange={e => setField('status', e.target.value)}>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="printed">Printed</option>
                <option value="in_production">In Production</option>
                <option value="complete">Complete</option>
                <option value="invoiced">Invoiced</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea className="input h-20 resize-none" value={form.notes}
                onChange={e => setField('notes', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-stone-700">Line Items</h3>
            <button type="button" onClick={addItem} className="btn-ghost text-xs">+ Add Line</button>
          </div>

          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="border border-stone-100 rounded-xl p-4 bg-stone-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-stone-400">LINE {i + 1}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)}
                      className="text-stone-300 hover:text-red-400 text-sm">✕</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Group</label>
                    <select className="input" value={item.group_name}
                      onChange={e => setItem(i, 'group_name', e.target.value)}>
                      <option value="">Select group...</option>
                      {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Product</label>
                    <select className="input" value={item.product_name}
                      onChange={e => setItem(i, 'product_name', e.target.value)}
                      disabled={!item.group_name}>
                      <option value="">Select product...</option>
                      {(PRODUCTS_BY_GROUP[item.group_name] || []).map(p =>
                        <option key={p} value={p}>{p}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="label">Width (inches)</label>
                    <input className="input" type="number" step="0.125" min="0"
                      value={item.width_inches}
                      onChange={e => setItem(i, 'width_inches', e.target.value)}
                      placeholder='e.g. 36' />
                  </div>
                  <div>
                    <label className="label">Height (inches)</label>
                    <input className="input" type="number" step="0.125" min="0"
                      value={item.height_inches}
                      onChange={e => setItem(i, 'height_inches', e.target.value)}
                      placeholder='e.g. 72' />
                  </div>
                  <div>
                    <label className="label">Quantity</label>
                    <input className="input" type="number" min="1"
                      value={item.quantity}
                      onChange={e => setItem(i, 'quantity', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Unit Price</label>
                    <input className="input" type="number" step="0.01" min="0"
                      value={item.unit_price}
                      onChange={e => setItem(i, 'unit_price', e.target.value)}
                      placeholder="0.00" />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Notes (color, mount, control type, etc.)</label>
                    <input className="input" value={item.notes}
                      onChange={e => setItem(i, 'notes', e.target.value)}
                      placeholder="e.g. Alabaster / Inside Mount / Motorized Right / Cassette" />
                  </div>
                </div>
                {item.line_total && (
                  <div className="mt-2 text-right text-xs font-semibold text-stone-500">
                    Line total: ${parseFloat(item.line_total).toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {subtotal > 0 && (
            <div className="mt-4 pt-4 border-t border-stone-100 text-right">
              <span className="text-sm font-bold text-stone-700">
                Subtotal: ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        <div className="flex items-center gap-3 justify-end pb-6">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary px-6">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  )
}
