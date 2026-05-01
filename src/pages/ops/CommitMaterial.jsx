import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

export default function CommitMaterial() {
  const navigate    = useNavigate()
  const { profile } = useAuth()

  const [orderSearch,  setOrderSearch]  = useState('')
  const [orders,       setOrders]       = useState([])
  const [selOrder,     setSelOrder]     = useState(null)
  const [showOrderDrop,setShowOrderDrop] = useState(false)
  const [partSearch,   setPartSearch]   = useState('')
  const [parts,        setParts]        = useState([])
  const [selPart,      setSelPart]      = useState(null)
  const [showPartDrop, setShowPartDrop] = useState(false)
  const [qty,          setQty]          = useState('')
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [success,      setSuccess]      = useState(null)
  const [error,        setError]        = useState('')
  const [showHoldModal, setShowHoldModal] = useState(false)
  const [holdReason,    setHoldReason]    = useState('')
  const [holdNote,      setHoldNote]      = useState('')
  const [statusSaving,  setStatusSaving]  = useState(false)
  const qtyRef = useRef(null)

  async function searchOrders(q) {
    setOrderSearch(q)
    setShowOrderDrop(true)
    setSelOrder(null)
    if (!q) { setOrders([]); return }
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, sidemark, status')
      .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,sidemark.ilike.%${q}%`)
      .order('order_date', { ascending: false })
      .limit(8)
    setOrders(data || [])
  }

  async function fetchParts(search = '') {
    let q = supabase.from('parts').select('id, name, part_type, vendor_id, qty_on_hand, unit_of_measure')
      .eq('active', true).in('part_type', ['fabric', 'component']).order('name').limit(20)
    if (search) q = q.ilike('name', `%${search}%`)
    const { data } = await q
    setParts(data || [])
  }

  async function markInProduction() {
    if (!selOrder) return
    setStatusSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.from('orders').update({
        status:               'in_production',
        wrangl_status:        'in_production',
        wrangl_status_set_at: new Date().toISOString(),
        wrangl_status_set_by: profile?.id,
        // Clear any active hold
        hold_status:          null,
        hold_reason:          null,
        hold_note:            null,
        hold_released_at:     new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      }).eq('id', selOrder.id)
      if (err) throw err

      setSuccess({
        type:  'production',
        order: selOrder.order_number,
        msg:   `Marked Order #${selOrder.order_number} as In Production`,
      })
      setSelOrder(null); setOrderSearch('')
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setStatusSaving(false)
    }
  }

  async function placeOnHold() {
    if (!selOrder || !holdReason) {
      setError('Select a hold reason')
      return
    }
    setStatusSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.from('orders').update({
        hold_status:      'on_hold',
        hold_reason:      holdReason,
        hold_note:        holdNote || null,
        hold_started_at:  new Date().toISOString(),
        hold_released_at: null,
        updated_at:       new Date().toISOString(),
      }).eq('id', selOrder.id)
      if (err) throw err

      setSuccess({
        type:  'hold',
        order: selOrder.order_number,
        msg:   `Order #${selOrder.order_number} placed on hold`,
      })
      setShowHoldModal(false)
      setHoldReason(''); setHoldNote('')
      setSelOrder(null); setOrderSearch('')
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selOrder || !selPart || !qty || parseFloat(qty) <= 0) {
      setError('Select an order, part, and enter a valid quantity')
      return
    }
    setSaving(true)
    setError('')

    try {
      const qtyNum = parseFloat(qty)

      const { error: txErr } = await supabase.from('inventory_transactions').insert({
        transaction_type: 'commit',
        part_id:          selPart.id,
        quantity:         -qtyNum, // negative = deduct
        order_id:         selOrder.id,
        notes:            notes || null,
        user_id:          profile?.id,
      })
      if (txErr) throw txErr

      // Deduct qty
      const newQty = Math.max(0, (selPart.qty_on_hand || 0) - qtyNum)
      await supabase.from('parts').update({
        qty_on_hand: newQty,
        updated_at:  new Date().toISOString(),
      }).eq('id', selPart.id)

      setSuccess({
        part:   selPart.name,
        qty:    qtyNum,
        unit:   selPart.unit_of_measure || 'EA',
        order:  selOrder.order_number,
        newQty: newQty,
      })

      setSelOrder(null); setOrderSearch(''); setSelPart(null)
      setPartSearch(''); setQty(''); setNotes('')
      setSaving(false)
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/ops')} className="btn-ghost text-sm">← Ops</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Commit Material</h2>
      </div>

      {success && (
        <div className={`mb-4 p-4 border rounded-xl flex items-center gap-3 ${
          success.type === 'production' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' :
          success.type === 'hold'       ? 'bg-red-50 border-red-200 text-red-800' :
                                           'bg-amber-50 border-amber-200'
        }`}>
          <span className="text-xl">
            {success.type === 'production' ? '🏭' : success.type === 'hold' ? '⏸' : '✂️'}
          </span>
          <div>
            {success.msg ? (
              <div className="text-sm font-semibold">{success.msg}</div>
            ) : (
              <>
                <div className="text-sm font-semibold text-amber-700">Committed {success.qty} {success.unit} to Order #{success.order}</div>
                <div className="text-xs text-amber-600">{success.part} — remaining qty: {success.newQty}</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Order search */}
          <div className="relative">
            <label className="label">Order *</label>
            <input
              className="input"
              placeholder="Search by order # or customer..."
              value={orderSearch}
              onChange={e => searchOrders(e.target.value)}
              onFocus={() => orderSearch && setShowOrderDrop(true)}
              onBlur={() => setTimeout(() => setShowOrderDrop(false), 200)}
              autoFocus
            />
            {selOrder && (
              <div className="mt-1 text-xs text-stone-500 flex items-center gap-2">
                <span className="text-amber-600">✓</span>
                Order #{selOrder.order_number} — {selOrder.customer_name}
                {selOrder.sidemark && <span className="text-stone-400">· {selOrder.sidemark}</span>}
                <button type="button" onClick={() => { setSelOrder(null); setOrderSearch('') }}
                  className="text-stone-300 hover:text-stone-500 ml-1">✕</button>
              </div>
            )}

            {selOrder && (
              <div className="mt-3 p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-center gap-2">
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide mr-1">Status:</span>
                <button type="button" onClick={markInProduction} disabled={statusSaving}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  🏭 Mark In Production
                </button>
                <button type="button" onClick={() => setShowHoldModal(true)} disabled={statusSaving}
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors">
                  ⏸ Place on Hold
                </button>
                <span className="text-xs text-stone-400 ml-auto">Or commit material below ↓</span>
              </div>
            )}
            {showOrderDrop && orders.length > 0 && !selOrder && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                {orders.map(o => (
                  <button key={o.id} type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors"
                    onClick={() => { setSelOrder(o); setOrderSearch(`#${o.order_number} — ${o.customer_name}`); setShowOrderDrop(false) }}>
                    <div className="text-sm font-semibold text-stone-700">
                      <span className="font-mono text-brand-light">#{o.order_number}</span> — {o.customer_name}
                    </div>
                    {o.sidemark && <div className="text-xs text-stone-400">{o.sidemark}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Part search */}
          <div className="relative">
            <label className="label">Material / Part *</label>
            <input
              className="input"
              placeholder="Search fabrics and components..."
              value={partSearch}
              onChange={e => { setPartSearch(e.target.value); fetchParts(e.target.value); setShowPartDrop(true); if (!e.target.value) setSelPart(null) }}
              onFocus={() => { fetchParts(partSearch); setShowPartDrop(true) }}
              onBlur={() => setTimeout(() => setShowPartDrop(false), 200)}
            />
            {selPart && (
              <div className="mt-1 text-xs text-stone-500 flex items-center gap-2">
                <span className="text-amber-600">✓</span> {selPart.name}
                <span className="text-stone-300">·</span> Available: {selPart.qty_on_hand || 0} {selPart.unit_of_measure}
                <button type="button" onClick={() => { setSelPart(null); setPartSearch('') }}
                  className="text-stone-300 hover:text-stone-500 ml-1">✕</button>
              </div>
            )}
            {showPartDrop && parts.length > 0 && !selPart && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                {parts.map(p => (
                  <button key={p.id} type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors"
                    onClick={() => { setSelPart(p); setPartSearch(p.name); setShowPartDrop(false); setTimeout(() => qtyRef.current?.focus(), 50) }}>
                    <div className="text-sm font-semibold text-stone-700">{p.name}</div>
                    <div className="text-xs text-stone-400">{p.part_type} · available: {p.qty_on_hand || 0} {p.unit_of_measure}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="label">Quantity Used *</label>
            <input
              ref={qtyRef}
              className="input text-lg font-semibold"
              type="number" step="0.01" min="0.01"
              placeholder="0"
              value={qty}
              onChange={e => setQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('commit-notes')?.focus() } }}
            />
            {selPart && qty && (
              <div className={`mt-1 text-xs ${(selPart.qty_on_hand || 0) - parseFloat(qty) < 0 ? 'text-red-500' : 'text-stone-400'}`}>
                Remaining after commit: {Math.max(0, (selPart.qty_on_hand || 0) - parseFloat(qty || 0)).toLocaleString()} {selPart?.unit_of_measure}
                {(selPart.qty_on_hand || 0) - parseFloat(qty) < 0 && ' ⚠️ exceeds available qty'}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes <span className="text-stone-300 font-normal normal-case">(optional)</span></label>
            <input id="commit-notes" className="input" placeholder="Cut notes, roll number, etc."
              value={notes} onChange={e => setNotes(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e) } }}
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate('/ops')} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving || !selOrder || !selPart || !qty} className="btn-primary flex-1 text-base py-3">
              {saving ? 'Saving...' : '✂️ Commit Material'}
            </button>
          </div>
        </form>
      </div>

      {/* Hold Modal */}
      {showHoldModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-stone-100">
              <h3 className="font-bold text-stone-900">Place Order on Hold</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Order #{selOrder?.order_number} — {selOrder?.customer_name}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">Reason *</label>
                <select value={holdReason} onChange={e => setHoldReason(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">Select reason...</option>
                  <option value="missing_part">Missing Part</option>
                  <option value="missing_fabric">Missing Fabric</option>
                  <option value="missing_component">Missing Component</option>
                  <option value="quality_issue">Quality Issue</option>
                  <option value="customer_request">Customer Request</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">Notes</label>
                <textarea value={holdNote} onChange={e => setHoldNote(e.target.value)} rows={3}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="What part? When expected? Any other details..." autoFocus />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-stone-100 flex justify-end gap-2">
              <button onClick={() => { setShowHoldModal(false); setHoldReason(''); setHoldNote('') }}
                className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg">
                Cancel
              </button>
              <button onClick={placeOnHold} disabled={statusSaving || !holdReason}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
                {statusSaving ? 'Placing on hold…' : 'Place on Hold'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
