import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ReorderQueue() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [editingQty, setEditingQty] = useState({})

  useEffect(() => { loadQueue() }, [])

  async function loadQueue() {
    setLoading(true)
    const { data } = await supabase
      .from('reorder_queue')
      .select('*')
      .order('vendor_name', { ascending: true })
      .order('created_at', { ascending: true })
    setQueue(data || [])
    setLoading(false)
  }

  async function removeItem(id) {
    await supabase.from('reorder_queue').delete().eq('id', id)
    loadQueue()
  }

  async function updateQty(id, qty) {
    await supabase.from('reorder_queue').update({ qty_requested: parseInt(qty) }).eq('id', id)
    setEditingQty(prev => ({ ...prev, [id]: undefined }))
    loadQueue()
  }

  // Group by vendor
  const grouped = queue.reduce((acc, item) => {
    const key = item.vendor_name || 'Unknown Vendor'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  async function createPO(vendorName) {
    setCreating(true)
    setSelectedVendor(vendorName)
    try {
      // Get vendor id
      const { data: vendors } = await supabase
        .from('vendors')
        .select('id')
        .ilike('vendor_name', vendorName)
        .limit(1)

      const vendorId = vendors?.[0]?.id || null

      // Generate PO number
      const year = new Date().getFullYear()
      const { data: existing } = await supabase
        .from('purchase_orders')
        .select('wrangl_po_number')
        .ilike('wrangl_po_number', `WPO-${year}-%`)
        .order('wrangl_po_number', { ascending: false })
        .limit(1)

      let seq = 1
      if (existing?.length > 0) {
        const last = existing[0].wrangl_po_number
        seq = parseInt(last.split('-')[2]) + 1
      }
      const poNumber = `WPO-${year}-${String(seq).padStart(3, '0')}`

      // Create PO
      const { data: po, error } = await supabase
        .from('purchase_orders')
        .insert({ wrangl_po_number: poNumber, vendor_id: vendorId, vendor_name: vendorName, status: 'draft' })
        .select()
        .single()

      if (error) throw error

      // Add line items from queue
      const items = grouped[vendorName]
      const lineItems = items.map(item => ({
        po_id: po.id,
        part_id: item.part_id,
        part_name: item.part_name,
        stock_number: item.stock_number,
        qty_ordered: item.qty_requested,
        note: item.note
      }))

      await supabase.from('purchase_order_items').insert(lineItems)

      // Remove from queue
      const ids = items.map(i => i.id)
      await supabase.from('reorder_queue').delete().in('id', ids)

      navigate(`/purchasing/po/${po.id}`)
    } catch (e) {
      alert('Error creating PO: ' + e.message)
    } finally {
      setCreating(false)
      setSelectedVendor(null)
    }
  }

  if (loading) return <div className="p-8 text-stone-500 text-sm">Loading reorder queue...</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Reorder Queue</h1>
          <p className="text-sm text-stone-500 mt-0.5">{queue.length} item{queue.length !== 1 ? 's' : ''} pending across {Object.keys(grouped).length} vendor{Object.keys(grouped).length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate('/purchasing')} className="text-sm text-stone-500 hover:text-stone-800 transition-colors">
          ← Purchase Orders
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-stone-400 text-sm">Reorder queue is empty.</p>
          <p className="text-stone-400 text-xs mt-1">Add items from the Inventory → Parts page.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([vendorName, items]) => (
            <div key={vendorName} className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-stone-50 border-b border-stone-100">
                <div>
                  <span className="font-semibold text-stone-800 text-sm">{vendorName}</span>
                  <span className="ml-2 text-xs text-stone-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                </div>
                <button
                  onClick={() => createPO(vendorName)}
                  disabled={creating && selectedVendor === vendorName}
                  className="text-xs font-semibold bg-brand-dark text-white px-3 py-1.5 rounded hover:bg-brand-mid transition-colors disabled:opacity-50"
                >
                  {creating && selectedVendor === vendorName ? 'Creating...' : 'Create PO →'}
                </button>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold tracking-[0.1em] text-stone-400 uppercase border-b border-stone-100">
                    <th className="text-left px-5 py-2">Part</th>
                    <th className="text-left px-5 py-2">Stock #</th>
                    <th className="text-center px-5 py-2">Qty</th>
                    <th className="text-left px-5 py-2">Note</th>
                    <th className="px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                      <td className="px-5 py-3 text-stone-800 font-medium">{item.part_name}</td>
                      <td className="px-5 py-3 text-stone-500 font-mono text-xs">{item.stock_number || '—'}</td>
                      <td className="px-5 py-3 text-center">
                        {editingQty[item.id] !== undefined ? (
                          <input
                            type="number"
                            min="1"
                            defaultValue={item.qty_requested}
                            className="w-16 text-center border border-stone-300 rounded px-1 py-0.5 text-sm"
                            onBlur={e => updateQty(item.id, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') updateQty(item.id, e.target.value) }}
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => setEditingQty(prev => ({ ...prev, [item.id]: true }))}
                            className="font-semibold text-stone-800 hover:text-brand-dark transition-colors"
                          >
                            {item.qty_requested}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3 text-stone-400 text-xs">{item.note || '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => removeItem(item.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
