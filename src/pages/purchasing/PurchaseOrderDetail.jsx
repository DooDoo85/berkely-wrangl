import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_STYLES = {
  draft:      'bg-stone-100 text-stone-600',
  submitted:  'bg-blue-50 text-blue-700',
  exported:   'bg-amber-50 text-amber-700',
  received:   'bg-green-50 text-green-700',
  cancelled:  'bg-red-50 text-red-500',
}

const STATUS_FLOW = ['draft', 'submitted', 'exported', 'received']

export default function PurchaseOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [po, setPO] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingEpicPO, setEditingEpicPO] = useState(false)
  const [epicPOInput, setEpicPOInput] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [newItem, setNewItem] = useState({ part_name: '', stock_number: '', qty_ordered: 1, unit_cost: 0, note: '' })

  useEffect(() => { loadPO() }, [id])

  async function loadPO() {
    setLoading(true)
    const [{ data: poData }, { data: itemData }] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', id).single(),
      supabase.from('purchase_order_items').select('*').eq('po_id', id).order('created_at')
    ])
    setPO(poData)
    setItems(itemData || [])
    setEpicPOInput(poData?.epic_po_number || '')
    setLoading(false)
  }

  async function updateStatus(status) {
    setSaving(true)
    await supabase.from('purchase_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setSaving(false)
    loadPO()
  }

  async function saveEpicPO() {
    await supabase.from('purchase_orders').update({ epic_po_number: epicPOInput || null, updated_at: new Date().toISOString() }).eq('id', id)
    setEditingEpicPO(false)
    loadPO()
  }

  async function removeItem(itemId) {
    await supabase.from('purchase_order_items').delete().eq('id', itemId)
    loadItems()
  }

  async function loadItems() {
    const { data } = await supabase.from('purchase_order_items').select('*').eq('po_id', id).order('created_at')
    setItems(data || [])
  }

  async function addItem() {
    if (!newItem.part_name) return
    await supabase.from('purchase_order_items').insert({ po_id: id, ...newItem })
    setNewItem({ part_name: '', stock_number: '', qty_ordered: 1, unit_cost: 0, note: '' })
    setAddingItem(false)
    loadItems()
  }

  async function updateItemQty(itemId, qty) {
    await supabase.from('purchase_order_items').update({ qty_ordered: parseInt(qty) }).eq('id', itemId)
    loadItems()
  }

  function exportCSV() {
    const rows = [['PO Number', 'Vendor', 'Stock #', 'Part Name', 'Qty', 'Unit Cost', 'Total', 'Note']]
    items.forEach(item => {
      rows.push([
        po.wrangl_po_number,
        po.vendor_name,
        item.stock_number || '',
        item.part_name,
        item.qty_ordered,
        item.unit_cost || 0,
        (item.qty_ordered * (item.unit_cost || 0)).toFixed(2),
        item.note || ''
      ])
    })
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${po.wrangl_po_number}.csv`
    a.click()
  }

  const totalValue = items.reduce((sum, i) => sum + (i.qty_ordered * (i.unit_cost || 0)), 0)

  if (loading) return <div className="p-8 text-stone-500 text-sm">Loading...</div>
  if (!po) return <div className="p-8 text-red-500 text-sm">PO not found.</div>

  const isDraft = po.status === 'draft'
  const currentStep = STATUS_FLOW.indexOf(po.status)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => navigate('/purchasing')} className="text-xs text-stone-400 hover:text-stone-600 transition-colors mb-2 block">
            ← Purchase Orders
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-stone-800 font-mono">{po.wrangl_po_number}</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_STYLES[po.status]}`}>
              {po.status}
            </span>
          </div>
          <p className="text-sm text-stone-500 mt-1">{po.vendor_name} · Created {new Date(po.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors">
            Export CSV
          </button>
          {po.status !== 'cancelled' && po.status !== 'received' && (
            <button
              onClick={() => updateStatus('cancelled')}
              className="text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded hover:bg-red-50 transition-colors"
            >
              Cancel PO
            </button>
          )}
        </div>
      </div>

      <div className="card p-4 mb-5">
        <div className="flex items-center gap-0">
          {STATUS_FLOW.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <button
                onClick={() => i > currentStep && updateStatus(s)}
                disabled={saving || i <= currentStep || po.status === 'cancelled'}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded transition-colors ${
                  i < currentStep ? 'bg-brand-dark text-white' :
                  i === currentStep ? 'bg-brand-light text-white' :
                  'bg-stone-100 text-stone-400 hover:bg-stone-200 disabled:cursor-default'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
              {i < STATUS_FLOW.length - 1 && (
                <div className={`h-0.5 w-4 ${i < currentStep ? 'bg-brand-dark' : 'bg-stone-200'}`} />
              )}
            </div>
          ))}
        </div>
        {po.status === 'cancelled' && (
          <p className="text-xs text-red-500 text-center mt-2 font-semibold">This PO has been cancelled.</p>
        )}
      </div>

      <div className="card p-4 mb-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-[0.1em] text-stone-400 uppercase mb-0.5">ePIC PO Number</p>
          {editingEpicPO ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={epicPOInput}
                onChange={e => setEpicPOInput(e.target.value)}
                placeholder="Enter ePIC PO number"
                className="border border-stone-300 rounded px-2 py-1 text-sm font-mono"
                autoFocus
              />
              <button onClick={saveEpicPO} className="text-xs font-semibold text-brand-dark hover:underline">Save</button>
              <button onClick={() => setEditingEpicPO(false)} className="text-xs text-stone-400 hover:underline">Cancel</button>
            </div>
          ) : (
            <p className="text-sm font-mono text-stone-700">{po.epic_po_number || <span className="text-stone-400 italic">Not assigned yet</span>}</p>
          )}
        </div>
        {!editingEpicPO && (
          <button onClick={() => setEditingEpicPO(true)} className="text-xs text-stone-400 hover:text-stone-700 border border-stone-200 px-2 py-1 rounded transition-colors">
            {po.epic_po_number ? 'Edit' : '+ Add'}
          </button>
        )}
      </div>

      <div className="card overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-3 bg-stone-50 border-b border-stone-100">
          <span className="text-sm font-semibold text-stone-700">{items.length} Line Item{items.length !== 1 ? 's' : ''}</span>
          {isDraft && (
            <button onClick={() => setAddingItem(true)} className="text-xs font-semibold text-brand-dark hover:underline">
              + Add Item
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-bold tracking-[0.1em] text-stone-400 uppercase border-b border-stone-100">
              <th className="text-left px-5 py-2">Stock #</th>
              <th className="text-left px-5 py-2">Part Name</th>
              <th className="text-center px-5 py-2">Qty</th>
              <th className="text-right px-5 py-2">Unit Cost</th>
              <th className="text-right px-5 py-2">Total</th>
              <th className="text-left px-5 py-2">Note</th>
              {isDraft && <th className="px-5 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                <td className="px-5 py-3 text-stone-500 font-mono text-xs">{item.stock_number || '—'}</td>
                <td className="px-5 py-3 text-stone-800 font-medium">{item.part_name}</td>
                <td className="px-5 py-3 text-center">
                  {isDraft ? (
                    <input
                      type="number"
                      min="1"
                      defaultValue={item.qty_ordered}
                      onBlur={e => updateItemQty(item.id, e.target.value)}
                      className="w-16 text-center border border-stone-200 rounded px-1 py-0.5 text-sm"
                    />
                  ) : (
                    <span className="font-semibold text-stone-800">{item.qty_ordered}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right text-stone-500">${(item.unit_cost || 0).toFixed(2)}</td>
                <td className="px-5 py-3 text-right font-semibold text-stone-800">${(item.qty_ordered * (item.unit_cost || 0)).toFixed(2)}</td>
                <td className="px-5 py-3 text-stone-400 text-xs">{item.note || '—'}</td>
                {isDraft && (
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => removeItem(item.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Remove</button>
                  </td>
                )}
              </tr>
            ))}
            {addingItem && (
              <tr className="border-b border-stone-100 bg-blue-50">
                <td className="px-5 py-3">
                  <input type="text" placeholder="Stock #" value={newItem.stock_number} onChange={e => setNewItem(p => ({ ...p, stock_number: e.target.value }))} className="border border-stone-300 rounded px-2 py-1 text-xs w-24 font-mono" />
                </td>
                <td className="px-5 py-3">
                  <input type="text" placeholder="Part name *" value={newItem.part_name} onChange={e => setNewItem(p => ({ ...p, part_name: e.target.value }))} className="border border-stone-300 rounded px-2 py-1 text-sm w-48" autoFocus />
                </td>
                <td className="px-5 py-3 text-center">
                  <input type="number" min="1" value={newItem.qty_ordered} onChange={e => setNewItem(p => ({ ...p, qty_ordered: parseInt(e.target.value) }))} className="border border-stone-300 rounded px-1 py-1 text-sm w-16 text-center" />
                </td>
                <td className="px-5 py-3 text-right">
                  <input type="number" min="0" step="0.01" value={newItem.unit_cost} onChange={e => setNewItem(p => ({ ...p, unit_cost: parseFloat(e.target.value) }))} className="border border-stone-300 rounded px-1 py-1 text-sm w-20 text-right" />
                </td>
                <td className="px-5 py-3 text-right text-stone-400">—</td>
                <td className="px-5 py-3">
                  <input type="text" placeholder="Note" value={newItem.note} onChange={e => setNewItem(p => ({ ...p, note: e.target.value }))} className="border border-stone-300 rounded px-2 py-1 text-xs w-32" />
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={addItem} className="text-xs font-semibold text-brand-dark hover:underline mr-2">Add</button>
                  <button onClick={() => setAddingItem(false)} className="text-xs text-stone-400 hover:underline">Cancel</button>
                </td>
              </tr>
            )}
          </tbody>
          {totalValue > 0 && (
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50">
                <td colSpan={isDraft ? 4 : 4} className="px-5 py-3 text-right text-xs font-bold text-stone-500 uppercase tracking-wide">Total Estimated Value</td>
                <td className="px-5 py-3 text-right font-bold text-stone-800">${totalValue.toFixed(2)}</td>
                <td colSpan={isDraft ? 2 : 1}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {po.notes && (
        <div className="card p-5">
          <p className="text-[10px] font-bold tracking-[0.1em] text-stone-400 uppercase mb-2">Notes</p>
          <p className="text-sm text-stone-700">{po.notes}</p>
        </div>
      )}
    </div>
  )
}
