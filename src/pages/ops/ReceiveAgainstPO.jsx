import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

export default function ReceiveAgainstPO() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [po, setPO] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)

  // receive form state — keyed by item id
  const [receiveQty, setReceiveQty] = useState({})

  useEffect(() => { loadPO() }, [id])

  async function loadPO() {
    setLoading(true)
    const { data: poData } = await supabase
      .from('purchase_orders').select('*').eq('id', id).single()
    const { data: itemsData } = await supabase
      .from('purchase_order_items').select('*').eq('po_id', id).order('id')
    setPO(poData)
    setItems(itemsData || [])
    setLoading(false)
  }

  // Bulk fill all "remaining" qtys at once (when full shipment arrives)
  function fillAllRemaining() {
    const next = {}
    items.forEach(it => {
      const remaining = (it.qty_ordered || 0) - (it.qty_received || 0)
      if (remaining > 0) next[it.id] = remaining
    })
    setReceiveQty(next)
  }

  function clearAll() {
    setReceiveQty({})
  }

  async function handleSubmit() {
    const linesToReceive = Object.entries(receiveQty)
      .filter(([_, v]) => v && parseFloat(v) > 0)
      .map(([itemId, v]) => ({ itemId, qty: parseFloat(v) }))

    if (linesToReceive.length === 0) {
      setError('Enter a quantity for at least one line')
      return
    }

    setSaving(true)
    setError('')

    try {
      let totalLinesReceived = 0
      let totalUnits = 0

      for (const { itemId, qty } of linesToReceive) {
        const item = items.find(i => i.id === itemId)
        if (!item) continue

        const newReceivedQty = (item.qty_received || 0) + qty

        // 1. Update the line item
        await supabase.from('purchase_order_items').update({
          qty_received: newReceivedQty,
          received_at:  new Date().toISOString(),
          received_by:  profile?.id || null,
        }).eq('id', itemId)

        // 2. Log inventory transaction (if part is linked)
        if (item.part_id) {
          await supabase.from('inventory_transactions').insert({
            transaction_type: 'receive',
            part_id:          item.part_id,
            quantity:         qty,
            po_id:            id,
            po_item_id:       itemId,
            notes:            `Received against ${po.wrangl_po_number}`,
            user_id:          profile?.id,
          })

          // 3. Update parts.qty_on_hand
          await supabase.rpc('increment_part_qty', {
            p_id: item.part_id, p_qty: qty,
          })
        }

        totalLinesReceived++
        totalUnits += qty
      }

      // 4. Determine new PO status based on overall received-ness
      const updatedItems = items.map(it => {
        const received = receiveQty[it.id] ? (it.qty_received || 0) + parseFloat(receiveQty[it.id]) : (it.qty_received || 0)
        return { ...it, qty_received: received }
      })
      const allLinesFullyReceived = updatedItems.every(it => (it.qty_received || 0) >= (it.qty_ordered || 0))
      const someLinesReceived = updatedItems.some(it => (it.qty_received || 0) > 0)

      let newStatus = po.status
      if (allLinesFullyReceived) newStatus = 'received'
      else if (someLinesReceived) newStatus = 'partial_received'

      const updates = { status: newStatus, updated_at: new Date().toISOString() }
      if (allLinesFullyReceived) updates.received_at = new Date().toISOString()

      await supabase.from('purchase_orders').update(updates).eq('id', id)

      setSuccess({
        lines: totalLinesReceived,
        units: totalUnits,
        status: newStatus,
      })

      // Reset and reload
      setReceiveQty({})
      loadPO()

      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  if (loading) return <div className="p-8 text-stone-400 text-sm">Loading PO...</div>
  if (!po) return <div className="p-8 text-stone-400 text-sm">PO not found</div>

  const allFullyReceived = items.every(it => (it.qty_received || 0) >= (it.qty_ordered || 0))
  const totalOrdered = items.reduce((sum, i) => sum + (i.qty_ordered || 0), 0)
  const totalReceived = items.reduce((sum, i) => sum + (i.qty_received || 0), 0)
  const pctReceived = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => navigate(`/purchasing/po/${id}`)} className="text-xs text-stone-400 hover:text-stone-600 mb-2 block">
            ← Back to PO
          </button>
          <h1 className="text-2xl font-display font-bold text-stone-800">
            Receive {po.wrangl_po_number}
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {po.vendor_name} · {items.length} line items · {totalReceived} of {totalOrdered} units received
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
          po.status === 'received' ? 'bg-emerald-50 text-emerald-700' :
          po.status === 'partial_received' ? 'bg-amber-50 text-amber-700' :
          'bg-stone-100 text-stone-600'
        }`}>
          {po.status?.replace('_', ' ')}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="w-full bg-stone-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${pctReceived >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(pctReceived, 100)}%` }}
          />
        </div>
      </div>

      {/* Success */}
      {success && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <p className="text-sm font-semibold text-emerald-800">
            ✓ Received {success.units} units across {success.lines} line{success.lines !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-emerald-700 mt-0.5">
            PO is now <strong>{success.status.replace('_', ' ')}</strong>. Inventory updated.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Bulk actions */}
      {!allFullyReceived && (
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={fillAllRemaining}
            className="text-xs font-semibold text-stone-600 border border-stone-200 px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
          >
            ✓ Fill All Remaining (Full Shipment)
          </button>
          <button
            onClick={clearAll}
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            Clear
          </button>
        </div>
      )}

      {/* Items table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50">
              <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Stock #</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Part</th>
              <th className="text-center px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Ordered</th>
              <th className="text-center px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Already Received</th>
              <th className="text-center px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Remaining</th>
              <th className="text-center px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-wide">Receive Now</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const ordered = item.qty_ordered || 0
              const alreadyReceived = item.qty_received || 0
              const remaining = ordered - alreadyReceived
              const fullyReceived = remaining <= 0
              return (
                <tr key={item.id} className={`border-b border-stone-50 ${fullyReceived ? 'bg-emerald-50/30' : ''}`}>
                  <td className="px-4 py-3 text-stone-500 font-mono text-xs">{item.stock_number || '—'}</td>
                  <td className="px-4 py-3 text-stone-800 font-medium">
                    {item.part_name}
                    {!item.part_id && (
                      <span className="ml-2 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                        UNLINKED
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-stone-700">{ordered}</td>
                  <td className="px-4 py-3 text-center text-stone-500">{alreadyReceived}</td>
                  <td className={`px-4 py-3 text-center font-semibold ${fullyReceived ? 'text-emerald-600' : 'text-stone-700'}`}>
                    {fullyReceived ? '✓ Done' : remaining}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {fullyReceived ? (
                      <span className="text-stone-300">—</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        step="1"
                        placeholder="0"
                        value={receiveQty[item.id] || ''}
                        onChange={e => setReceiveQty({ ...receiveQty, [item.id]: e.target.value })}
                        className="w-20 text-center border border-stone-300 rounded px-2 py-1 text-sm"
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between mt-5 pb-6">
        <div className="text-xs text-stone-500">
          {Object.values(receiveQty).filter(v => v && parseFloat(v) > 0).length} line{Object.values(receiveQty).filter(v => v && parseFloat(v) > 0).length !== 1 ? 's' : ''} ready to receive
          {Object.values(receiveQty).filter(v => v && parseFloat(v) > 0).length > 0 && (
            <span> · {Object.values(receiveQty).reduce((s, v) => s + (parseFloat(v) || 0), 0)} units total</span>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/purchasing/po/${id}`)}
            className="px-4 py-2 rounded-xl border border-stone-200 text-sm text-stone-500 hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || Object.values(receiveQty).filter(v => v && parseFloat(v) > 0).length === 0}
            className="px-6 py-2 rounded-xl bg-[#5a3a24] text-[#f5e6d0] text-sm font-semibold hover:bg-[#6e4a30] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Receiving...' : '📥 Receive Selected Lines'}
          </button>
        </div>
      </div>
    </div>
  )
}
