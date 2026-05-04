import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

export default function CommitMaterial() {
  const navigate    = useNavigate()
  const { profile } = useAuth()

  const [orderSearch,   setOrderSearch]   = useState('')
  const [orders,        setOrders]        = useState([])
  const [selOrder,      setSelOrder]      = useState(null)
  const [showOrderDrop, setShowOrderDrop] = useState(false)

  const [fabrics,       setFabrics]       = useState([])
  const [selFabricId,   setSelFabricId]   = useState('')
  const [lengthInches,  setLengthInches]  = useState('')
  const [notes,         setNotes]         = useState('')

  const [saving,        setSaving]        = useState(false)
  const [success,       setSuccess]       = useState(null)
  const [error,         setError]         = useState('')
  const [showHoldModal, setShowHoldModal] = useState(false)
  const [holdReason,    setHoldReason]    = useState('')
  const [holdNote,      setHoldNote]      = useState('')
  const [statusSaving,  setStatusSaving]  = useState(false)
  const lengthRef = useRef(null)

  useEffect(() => { loadFabrics() }, [])

  async function loadFabrics() {
    const { data } = await supabase
      .from('parts')
      .select('id, name, qty_on_hand, qty_committed, unit_of_measure, vendor_id, vendor, reorder_level')
      .eq('part_type', 'fabric')
      .eq('active', true)
      .order('name')
    setFabrics(data || [])
  }

  const selFabric = fabrics.find(f => f.id === selFabricId) || null
  const available = selFabric ? Math.max(0, (parseFloat(selFabric.qty_on_hand) || 0) - (parseFloat(selFabric.qty_committed) || 0)) : 0
  const lengthNum = parseFloat(lengthInches) || 0
  const remainingAfter = selFabric ? (parseFloat(selFabric.qty_on_hand) || 0) - lengthNum : 0
  const exceedsStock = selFabric && lengthNum > (parseFloat(selFabric.qty_on_hand) || 0)

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
        hold_status:          null,
        hold_reason:          null,
        hold_note:            null,
        hold_released_at:     new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      }).eq('id', selOrder.id)
      if (err) throw err

      // Log to status history
      await supabase.from('order_status_history').insert({
        order_number: selOrder.order_number,
        order_id:     selOrder.id,
        from_status:  selOrder.status,
        to_status:    'in_production',
        status_date:  new Date().toISOString().slice(0, 10),
        source:       'wrangl',
        changed_by:   profile?.id,
        notes:        `Marked In Production via Commit Fabric by ${profile?.full_name || profile?.email}`,
      })

      setSuccess({ type: 'production', msg: `Marked Order #${selOrder.order_number} as In Production` })
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
      setSuccess({ type: 'hold', msg: `Order #${selOrder.order_number} placed on hold` })
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
    if (!selOrder || !selFabric || !lengthInches || lengthNum <= 0) {
      setError('Select an order, fabric, and enter a valid length')
      return
    }
    setSaving(true)
    setError('')

    try {
      const { error: txErr } = await supabase.from('inventory_transactions').insert({
        transaction_type: 'commit',
        part_id:          selFabric.id,
        quantity:         -lengthNum,
        order_id:         selOrder.id,
        notes:            notes || `Cut ${lengthNum}" for Order #${selOrder.order_number}`,
        user_id:          profile?.id,
      })
      if (txErr) throw txErr

      const newQty = Math.max(0, (parseFloat(selFabric.qty_on_hand) || 0) - lengthNum)
      const { error: updErr } = await supabase.from('parts').update({
        qty_on_hand: newQty,
        updated_at:  new Date().toISOString(),
      }).eq('id', selFabric.id)
      if (updErr) throw updErr

      setSuccess({
        type:   'cut',
        order:  selOrder.order_number,
        fabric: selFabric.name,
        length: lengthNum,
        newQty: newQty,
      })

      setSelOrder(null); setOrderSearch('')
      setSelFabricId(''); setLengthInches(''); setNotes('')
      await loadFabrics()
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/ops')} className="btn-ghost text-sm">← Ops</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Commit Fabric</h2>
      </div>

      {success && (
        <div className={`mb-4 p-4 border rounded-xl flex items-center gap-3 ${
          success.type === 'production' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' :
          success.type === 'hold'       ? 'bg-red-50 border-red-200 text-red-800' :
                                           'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <span className="text-xl">
            {success.type === 'production' ? '🏭' : success.type === 'hold' ? '⏸' : '✂️'}
          </span>
          <div className="flex-1">
            {success.msg ? (
              <div className="text-sm font-semibold">{success.msg}</div>
            ) : (
              <>
                <div className="text-sm font-semibold">Cut {success.length}" of {success.fabric} for Order #{success.order}</div>
                <div className="text-xs opacity-80 mt-0.5">Remaining inventory: {success.newQty.toLocaleString()}"</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">

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

          {selOrder && (
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Status:</span>
              <button type="button" onClick={markInProduction} disabled={statusSaving}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                🏭 Mark In Production
              </button>
              <button type="button" onClick={() => setShowHoldModal(true)} disabled={statusSaving}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors">
                ⏸ Place on Hold
              </button>
            </div>
          )}

          <div>
            <label className="label">Fabric *</label>
            <select className="input" value={selFabricId} onChange={e => setSelFabricId(e.target.value)}>
              <option value="">Select fabric...</option>
              {fabrics.map(f => {
                const avail = Math.max(0, (parseFloat(f.qty_on_hand) || 0) - (parseFloat(f.qty_committed) || 0))
                return (
                  <option key={f.id} value={f.id}>
                    {f.name} — {Math.ceil(avail).toLocaleString()}" available
                  </option>
                )
              })}
            </select>
            {selFabric && (
              <div className="mt-1 text-xs text-stone-500">
                On hand: <span className="font-semibold">{Math.ceil(parseFloat(selFabric.qty_on_hand) || 0).toLocaleString()}"</span>
                {selFabric.qty_committed > 0 && (
                  <span className="ml-2">· Committed: <span className="text-amber-600 font-semibold">{Math.ceil(parseFloat(selFabric.qty_committed) || 0).toLocaleString()}"</span></span>
                )}
                <span className="ml-2">· Available: <span className={`font-semibold ${available <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>{Math.ceil(available).toLocaleString()}"</span></span>
              </div>
            )}
          </div>

          <div>
            <label className="label">Length Cut (inches) *</label>
            <input
              ref={lengthRef}
              className="input text-lg font-semibold"
              type="number" step="0.01" min="0.01"
              placeholder="e.g. 72"
              value={lengthInches}
              onChange={e => setLengthInches(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('cut-notes')?.focus() } }}
            />
            {selFabric && lengthInches && (
              <div className={`mt-1 text-xs ${exceedsStock ? 'text-red-500' : 'text-stone-400'}`}>
                Inventory after cut: <span className="font-semibold">{Math.max(0, remainingAfter).toLocaleString()}"</span>
                {exceedsStock && ' ⚠️ exceeds available qty'}
              </div>
            )}
          </div>

          <div>
            <label className="label">Notes <span className="text-stone-300 font-normal normal-case">(optional)</span></label>
            <input id="cut-notes" className="input" placeholder="Roll number, cut details, etc."
              value={notes} onChange={e => setNotes(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e) } }}
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate('/ops')} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving || !selOrder || !selFabricId || !lengthInches}
              className="btn-primary flex-1 text-base py-3">
              {saving ? 'Saving...' : '✂️ Commit Fabric Cut'}
            </button>
          </div>
        </form>
      </div>

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
