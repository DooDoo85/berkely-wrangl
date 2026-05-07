import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_COLORS = {
  active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  prospect: 'bg-blue-50 text-blue-700 border-blue-200',
  hold:     'bg-amber-50 text-amber-700 border-amber-200',
  closed:   'bg-stone-50 text-stone-500 border-stone-200',
}

const ORDER_STATUS_BADGE = {
  quote:         { label: 'Quote',         color: '#8a7560', bg: '#f5f0e8' },
  credit_hold:   { label: 'Credit Hold',   color: '#c2410c', bg: '#fed7aa' },
  credit_ok:     { label: 'Credit OK',     color: '#5b8c5a', bg: '#e0ecdf' },
  po_sent:       { label: 'PO Sent',       color: '#0369a1', bg: '#dbeafe' },
  printed:       { label: 'Printed',       color: '#a0573a', bg: '#f5e2d4' },
  in_production: { label: 'In Production', color: '#b8854d', bg: '#f5e8c8' },
  invoiced:      { label: 'Invoiced',      color: '#5b8c5a', bg: '#e0ecdf' },
}

function startOfWeek() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday-anchored week
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function startOfYear() {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function fmt$(n) {
  if (n === null || n === undefined || isNaN(n)) return '$0'
  return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relTime(d) {
  if (!d) return '—'
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

// ── Pipeline tile ────────────────────────────────────────────────────────────
function PipelineTile({ label, count, color, bg, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative bg-white border border-gray-200 rounded-xl p-4 text-left transition-all hover:shadow-sm hover:-translate-y-px overflow-hidden w-full"
    >
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: color }} />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium text-gray-700">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{count}</div>
    </button>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────
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

function ContactEditForm({ draft, setDraft, onSave, onCancel, saving, isNew = false }) {
  const set = (k, v) => setDraft({ ...draft, [k]: v })
  return (
    <div className={`p-4 rounded-xl border-2 border-stone-300 bg-white ${isNew ? 'col-span-2 mb-3' : ''}`}>
      <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">
        {isNew ? 'New Contact' : 'Edit Contact'}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Name *</label>
          <input value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Full name" autoFocus
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Title</label>
          <input value={draft.title} onChange={e => set('title', e.target.value)} placeholder="Owner, AP Manager…"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Email</label>
          <input type="email" value={draft.email} onChange={e => set('email', e.target.value)} placeholder="name@example.com"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Phone</label>
          <input value={draft.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 123-4567"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300" />
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
          <input type="checkbox" checked={draft.is_primary} onChange={e => set('is_primary', e.target.checked)}
            className="rounded border-stone-300" />
          Mark as primary contact
        </label>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button onClick={onSave} disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-700 text-white hover:bg-stone-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function CustomerDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [customer,   setCustomer]   = useState(null)
  const [orders,     setOrders]     = useState([])
  const [activities, setActivities] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [deleting,   setDeleting]   = useState(false)
  const [activeTab,  setActiveTab]  = useState('activity')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')

  // Notes editing
  const [editingNotes,  setEditingNotes]  = useState(false)
  const [notesDraft,    setNotesDraft]    = useState('')
  const [savingNotes,   setSavingNotes]   = useState(false)

  // Contacts editing
  const [editingContactId, setEditingContactId] = useState(null)
  const [contactDraft,     setContactDraft]     = useState({ name: '', title: '', email: '', phone: '', is_primary: false })
  const [addingContact,    setAddingContact]    = useState(false)
  const [savingContact,    setSavingContact]    = useState(false)

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)

    // 1. Load customer first to get account_name (used to filter orders)
    const { data: cust } = await supabase
      .from('customers')
      .select('*, customer_contacts(*), profiles!customers_assigned_rep_id_fkey(full_name)')
      .eq('id', id)
      .single()
    setCustomer(cust)

    if (!cust) { setLoading(false); return }

    // 2. Load orders + activities in parallel (orders match by customer_name since that's what ePIC populates)
    const [ordersRes, activitiesRes] = await Promise.all([
      supabase.from('orders')
        .select('id, order_number, status, epic_status, sales_rep, total_units, order_amount, order_date, epic_status_date, on_hold, hold_reason, wrangl_status, updated_at')
        .eq('customer_name', cust.account_name)
        .order('order_date', { ascending: false, nullsFirst: false })
        .limit(500),

      supabase.from('activities')
        .select('id, subject, body, activity_type, activity_date, follow_up_date, completed, created_at, profiles(full_name)')
        .eq('customer_id', id)
        .order('activity_date', { ascending: false })
        .limit(50),
    ])

    setOrders(ordersRes.data || [])
    setActivities(activitiesRes.data || [])
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm(`Archive ${customer.account_name}? They won't be deleted, just hidden.`)) return
    setDeleting(true)
    await supabase.from('customers').update({ active: false }).eq('id', id)
    navigate('/customers')
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  function startEditNotes() {
    setNotesDraft(customer.notes || '')
    setEditingNotes(true)
  }

  function cancelEditNotes() {
    setEditingNotes(false)
    setNotesDraft('')
  }

  async function saveNotes() {
    setSavingNotes(true)
    const { error } = await supabase
      .from('customers')
      .update({ notes: notesDraft || null })
      .eq('id', id)
    setSavingNotes(false)
    if (error) { alert('Failed to save notes: ' + error.message); return }
    setCustomer({ ...customer, notes: notesDraft || null })
    setEditingNotes(false)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  function startEditContact(c) {
    setEditingContactId(c.id)
    setContactDraft({
      name:       c.name       || '',
      title:      c.title      || '',
      email:      c.email      || '',
      phone:      c.phone      || '',
      is_primary: c.is_primary || false,
    })
    setAddingContact(false)
  }

  function startAddContact() {
    setAddingContact(true)
    setEditingContactId(null)
    setContactDraft({ name: '', title: '', email: '', phone: '', is_primary: false })
  }

  function cancelContactEdit() {
    setEditingContactId(null)
    setAddingContact(false)
    setContactDraft({ name: '', title: '', email: '', phone: '', is_primary: false })
  }

  async function saveContact() {
    if (!contactDraft.name.trim()) { alert('Contact name is required'); return }
    setSavingContact(true)

    // If is_primary changes to true, clear primary on other contacts first
    if (contactDraft.is_primary) {
      await supabase.from('customer_contacts')
        .update({ is_primary: false })
        .eq('customer_id', id)
    }

    if (addingContact) {
      const { error } = await supabase.from('customer_contacts').insert({
        customer_id: id,
        ...contactDraft,
      })
      if (error) { alert('Failed to add: ' + error.message); setSavingContact(false); return }
    } else {
      const { error } = await supabase.from('customer_contacts')
        .update(contactDraft)
        .eq('id', editingContactId)
      if (error) { alert('Failed to save: ' + error.message); setSavingContact(false); return }
    }

    setSavingContact(false)
    cancelContactEdit()
    loadData()
  }

  async function deleteContact(contactId, contactName) {
    if (!confirm(`Delete contact "${contactName}"?`)) return
    const { error } = await supabase.from('customer_contacts').delete().eq('id', contactId)
    if (error) { alert('Failed to delete: ' + error.message); return }
    loadData()
  }

  // Compute pipeline metrics from orders
  const pipeline = useMemo(() => {
    if (!orders.length) return { quotes: 0, printed: 0, inProduction: 0, onHold: 0, invoicedWtd: 0 }
    const weekStart = startOfWeek()
    return {
      quotes:       orders.filter(o => o.status === 'quote').length,
      printed:      orders.filter(o => o.status === 'printed').length,
      inProduction: orders.filter(o => o.wrangl_status === 'in_production' || o.status === 'in_production').length,
      onHold:       orders.filter(o => o.on_hold === true).length,
      invoicedWtd:  orders.filter(o => o.status === 'invoiced' && o.epic_status_date >= weekStart).length,
    }
  }, [orders])

  // YTD summary metrics
  const summary = useMemo(() => {
    if (!orders.length) return { ordersYtd: 0, revenueYtd: 0, lastOrderDate: null }
    const yearStart = startOfYear()
    const ytdOrders = orders.filter(o => o.order_date && o.order_date >= yearStart)
    const revenue = ytdOrders
      .filter(o => o.status === 'invoiced')
      .reduce((sum, o) => sum + (Number(o.order_amount) || 0), 0)
    const lastOrder = orders.find(o => o.order_date)
    return {
      ordersYtd: ytdOrders.length,
      revenueYtd: revenue,
      lastOrderDate: lastOrder?.order_date,
    }
  }, [orders])

  // Last activity (across both orders and activities)
  const lastActivity = useMemo(() => {
    const dates = [
      ...activities.map(a => a.activity_date),
      ...orders.map(o => o.order_date),
    ].filter(Boolean).sort().reverse()
    return dates[0] || null
  }, [activities, orders])

  // Filtered orders for the Orders tab
  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === 'all') return orders
    if (orderStatusFilter === 'on_hold') return orders.filter(o => o.on_hold)
    return orders.filter(o => o.status === orderStatusFilter)
  }, [orders, orderStatusFilter])

  // Combined activity timeline (orders + activities, newest first)
  const timeline = useMemo(() => {
    const items = []
    activities.forEach(a => {
      items.push({
        kind: 'activity',
        date: a.activity_date,
        sortKey: a.activity_date || a.created_at,
        data: a,
      })
    })
    orders.forEach(o => {
      if (o.order_date) {
        items.push({
          kind: 'order',
          date: o.order_date,
          sortKey: o.epic_status_date || o.order_date,
          data: o,
        })
      }
    })
    return items.sort((a, b) => (b.sortKey || '').localeCompare(a.sortKey || '')).slice(0, 50)
  }, [orders, activities])

  if (loading) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="card p-12 text-center text-stone-400">Loading...</div>
    </div>
  )

  if (!customer) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="card p-12 text-center text-stone-400">Customer not found</div>
    </div>
  )

  const primaryContact = customer.customer_contacts?.find(c => c.is_primary) || customer.customer_contacts?.[0]
  const otherContacts  = customer.customer_contacts?.filter(c => c !== primaryContact) || []

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#faf6ed' }}>
      <div className="p-6 max-w-6xl mx-auto">

        {/* Top bar */}
        <div className="flex items-start justify-between mb-5">
          <button onClick={() => navigate('/customers')} className="btn-ghost text-sm">← Customers</button>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/activities/new', { state: { customer_id: id } })}
              className="btn-secondary text-sm">📞 Log Activity</button>
            <button onClick={() => navigate(`/customers/${id}/edit`)} className="btn-ghost text-sm">Edit</button>
            <button onClick={handleDelete} disabled={deleting}
              className="text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300
                         bg-white px-3 py-1.5 rounded-lg text-sm transition-all">
              Archive
            </button>
          </div>
        </div>

        {/* Hero card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-display font-bold text-stone-800">
                  {customer.account_name}
                </h2>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[customer.status]}`}>
                  {customer.status?.charAt(0).toUpperCase() + customer.status?.slice(1)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-stone-500">
                {customer.account_code && <span className="font-mono">{customer.account_code}</span>}
                {customer.sales_rep && <span>· {customer.sales_rep}</span>}
                {customer.territory && <span>· {customer.territory}</span>}
              </div>
            </div>

            {/* YTD summary */}
            <div className="flex items-start gap-6 flex-shrink-0">
              <div className="text-right">
                <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Orders YTD</div>
                <div className="text-2xl font-bold text-stone-800 tabular-nums">{summary.ordersYtd}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Revenue YTD</div>
                <div className="text-2xl font-bold text-stone-800 tabular-nums">{fmt$(summary.revenueYtd)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Last Activity</div>
                <div className="text-sm font-semibold text-stone-700 mt-1">{relTime(lastActivity)}</div>
              </div>
            </div>
          </div>

          {/* Notes (inline editable) */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Notes</span>
              {!editingNotes && (
                <button onClick={startEditNotes}
                  className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
                  ✏ Edit
                </button>
              )}
            </div>
            {editingNotes ? (
              <div>
                <textarea
                  value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  rows={3}
                  placeholder="Add notes about this customer..."
                  className="w-full text-sm text-stone-700 bg-stone-50 border border-stone-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-stone-300"
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={saveNotes} disabled={savingNotes}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-700 text-white hover:bg-stone-800 disabled:opacity-50">
                    {savingNotes ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={cancelEditNotes}
                    className="px-3 py-1.5 text-xs rounded-lg text-stone-600 hover:bg-stone-100">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-stone-50 rounded-lg text-sm text-stone-600 min-h-[3rem]">
                {customer.notes || <span className="text-stone-400 italic">No notes yet — click Edit to add</span>}
              </div>
            )}
          </div>
        </div>

        {/* Pipeline strip */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Pipeline</h3>
          <div className="grid grid-cols-5 gap-3">
            <PipelineTile label="Quotes"        count={pipeline.quotes}       color="#8a7560" bg="#f5f0e8" onClick={() => { setActiveTab('orders'); setOrderStatusFilter('quote') }} />
            <PipelineTile label="Printed"       count={pipeline.printed}      color="#a0573a" bg="#f5e2d4" onClick={() => { setActiveTab('orders'); setOrderStatusFilter('printed') }} />
            <PipelineTile label="In Production" count={pipeline.inProduction} color="#b8854d" bg="#f5e8c8" onClick={() => { setActiveTab('orders'); setOrderStatusFilter('in_production') }} />
            <PipelineTile label="On Hold"       count={pipeline.onHold}       color="#ee5e3a" bg="#fde4dc" onClick={() => { setActiveTab('orders'); setOrderStatusFilter('on_hold') }} />
            <PipelineTile label="Invoiced WTD"  count={pipeline.invoicedWtd}  color="#5b8c5a" bg="#e0ecdf" onClick={() => { setActiveTab('orders'); setOrderStatusFilter('invoiced') }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex border-b border-stone-100 px-2">
            {[
              { key: 'activity',   label: 'Activity'  },
              { key: 'orders',     label: `Orders (${orders.length})` },
              { key: 'contacts',   label: 'Contacts'  },
              { key: 'addresses',  label: 'Addresses' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                  activeTab === tab.key
                    ? 'border-stone-700 text-stone-800'
                    : 'border-transparent text-stone-500 hover:text-stone-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">

            {/* ACTIVITY TAB */}
            {activeTab === 'activity' && (
              <div>
                {timeline.length === 0 ? (
                  <div className="text-center py-12 text-stone-400 text-sm">No activity yet.</div>
                ) : (
                  <div className="space-y-3">
                    {timeline.map((item, i) => (
                      <div key={`${item.kind}-${i}`} className="flex gap-3">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                            item.kind === 'activity' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'
                          }`}>
                            {item.kind === 'activity' ? '💬' : '📦'}
                          </div>
                          {i !== timeline.length - 1 && <div className="w-px flex-1 bg-stone-200 my-1" />}
                        </div>
                        <div className="flex-1 pb-3">
                          {item.kind === 'activity' ? (
                            <>
                              <div className="text-sm font-medium text-stone-800">{item.data.subject || item.data.activity_type}</div>
                              {item.data.body && <div className="text-xs text-stone-500 mt-0.5">{item.data.body}</div>}
                              <div className="text-[11px] text-stone-400 mt-0.5">
                                {fmtDate(item.data.activity_date)} · {item.data.profiles?.full_name || 'Unknown'}
                                {item.data.activity_type && ` · ${item.data.activity_type.replace(/_/g, ' ')}`}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-stone-800">Order #{item.data.order_number}</span>
                                {ORDER_STATUS_BADGE[item.data.status] && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: ORDER_STATUS_BADGE[item.data.status].bg, color: ORDER_STATUS_BADGE[item.data.status].color }}>
                                    {ORDER_STATUS_BADGE[item.data.status].label}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-stone-500 mt-0.5">
                                {item.data.total_units} units · {fmt$(item.data.order_amount)}
                              </div>
                              <div className="text-[11px] text-stone-400 mt-0.5">
                                {fmtDate(item.data.order_date)} · {item.data.sales_rep || '—'}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ORDERS TAB */}
            {activeTab === 'orders' && (
              <div>
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <select value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}
                    className="px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white">
                    <option value="all">All statuses</option>
                    <option value="quote">Quote</option>
                    <option value="credit_hold">Credit Hold</option>
                    <option value="credit_ok">Credit OK</option>
                    <option value="po_sent">PO Sent</option>
                    <option value="printed">Printed</option>
                    <option value="in_production">In Production</option>
                    <option value="on_hold">On Hold</option>
                    <option value="invoiced">Invoiced</option>
                  </select>
                  <span className="text-xs text-stone-400 ml-1">{filteredOrders.length} orders</span>
                </div>

                {filteredOrders.length === 0 ? (
                  <div className="text-center py-12 text-stone-400 text-sm">No orders match.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-stone-100">
                        <tr className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                          <th className="text-left px-3 py-2">Order</th>
                          <th className="text-left px-3 py-2">Status</th>
                          <th className="text-left px-3 py-2">Rep</th>
                          <th className="text-right px-3 py-2">Units</th>
                          <th className="text-right px-3 py-2">Amount</th>
                          <th className="text-left px-3 py-2">Order Date</th>
                          <th className="text-left px-3 py-2">Last Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map(o => (
                          <tr key={o.id}
                            onClick={() => navigate(`/orders/${o.id}`)}
                            className="border-b border-stone-50 hover:bg-stone-50 cursor-pointer">
                            <td className="px-3 py-2 font-mono font-medium text-stone-800">#{o.order_number}</td>
                            <td className="px-3 py-2">
                              {ORDER_STATUS_BADGE[o.status] && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: ORDER_STATUS_BADGE[o.status].bg, color: ORDER_STATUS_BADGE[o.status].color }}>
                                  {ORDER_STATUS_BADGE[o.status].label}
                                </span>
                              )}
                              {o.on_hold && (
                                <span className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                                  HOLD
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-stone-600 text-xs">{o.sales_rep || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-stone-700">{o.total_units || 0}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-stone-800">{fmt$(o.order_amount)}</td>
                            <td className="px-3 py-2 text-stone-500 text-xs">{fmtDate(o.order_date)}</td>
                            <td className="px-3 py-2 text-stone-400 text-xs">{relTime(o.epic_status_date || o.updated_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* CONTACTS TAB */}
            {activeTab === 'contacts' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-stone-700 text-sm">Contacts</h3>
                  {!addingContact && !editingContactId && (
                    <button onClick={startAddContact}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-700 text-white hover:bg-stone-800">
                      + Add Contact
                    </button>
                  )}
                </div>

                {/* Add new contact form */}
                {addingContact && (
                  <ContactEditForm
                    draft={contactDraft}
                    setDraft={setContactDraft}
                    onSave={saveContact}
                    onCancel={cancelContactEdit}
                    saving={savingContact}
                    isNew
                  />
                )}

                {customer.customer_contacts?.length === 0 && !addingContact ? (
                  <div className="text-stone-400 text-sm text-center py-6">No contacts yet — click + Add Contact</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[primaryContact, ...otherContacts].filter(Boolean).map(c => (
                      editingContactId === c.id ? (
                        <ContactEditForm
                          key={c.id}
                          draft={contactDraft}
                          setDraft={setContactDraft}
                          onSave={saveContact}
                          onCancel={cancelContactEdit}
                          saving={savingContact}
                        />
                      ) : (
                        <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 group">
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
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEditContact(c)}
                              className="text-xs text-stone-500 hover:text-stone-800 px-1">✏</button>
                            <button onClick={() => deleteContact(c.id, c.name)}
                              className="text-xs text-red-400 hover:text-red-600 px-1">🗑</button>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ADDRESSES TAB */}
            {activeTab === 'addresses' && (
              <div className="grid grid-cols-2 gap-6 max-w-2xl">
                <AddressBlock label="Billing"  address={customer.billing_address} />
                <AddressBlock label="Shipping" address={customer.shipping_address} />
                {!customer.billing_address?.street && !customer.shipping_address?.street && (
                  <div className="text-stone-400 text-xs col-span-2 py-2">No addresses on file</div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}
