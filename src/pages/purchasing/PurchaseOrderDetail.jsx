import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_STYLES = {
  draft:             'bg-stone-100 text-stone-600',
  submitted:         'bg-blue-50 text-blue-700',
  sent:              'bg-cyan-50 text-cyan-700',
  exported:          'bg-amber-50 text-amber-700',
  partial_received:  'bg-amber-50 text-amber-700',
  received:          'bg-green-50 text-green-700',
  cancelled:         'bg-red-50 text-red-500',
}

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
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailResult, setEmailResult] = useState(null)
  const [vendorEmail, setVendorEmail] = useState('')
  const [showEmailDialog, setShowEmailDialog] = useState(false)

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

    // Pre-fill vendor email from vendors table
    if (poData?.vendor_id) {
      const { data: vendor } = await supabase
        .from('vendors').select('contact_email').eq('id', poData.vendor_id).single()
      if (vendor?.contact_email) setVendorEmail(vendor.contact_email)
    } else if (poData?.vendor_name) {
      const { data: vendors } = await supabase
        .from('vendors').select('contact_email').ilike('vendor_name', poData.vendor_name).limit(1)
      if (vendors?.[0]?.contact_email) setVendorEmail(vendors[0].contact_email)
    }
    if (poData?.sent_to_email) setVendorEmail(poData.sent_to_email)

    setLoading(false)
  }

  async function loadItems() {
    const { data } = await supabase.from('purchase_order_items').select('*').eq('po_id', id).order('created_at')
    setItems(data || [])
  }

  async function updateStatus(status) {
    setSaving(true)
    await supabase.from('purchase_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setSaving(false)
    loadPO()
  }

  async function handleSubmitAndExport() {
    setSaving(true)
    // Mark as submitted + exported
    await supabase.from('purchase_orders').update({
      status: 'exported',
      updated_at: new Date().toISOString()
    }).eq('id', id)

    // Trigger CSV export
    exportCSV()

    setSaving(false)
    setConfirmSubmit(false)
    loadPO()
  }

  async function sendPOToVendor() {
    if (!vendorEmail || !vendorEmail.includes('@')) {
      setEmailResult({ ok: false, error: 'Enter a valid vendor email' })
      return
    }
    setSendingEmail(true)
    setEmailResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/send-po-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          po_id: id,
          vendor_email: vendorEmail,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')

      // Save vendor email back to vendors table for future use
      if (po.vendor_id) {
        await supabase.from('vendors')
          .update({ contact_email: vendorEmail })
          .eq('id', po.vendor_id)
      }

      // Update PO
      await supabase.from('purchase_orders').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_to_email: vendorEmail,
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      setEmailResult({ ok: true, email: vendorEmail })
      setShowEmailDialog(false)
      loadPO()
      setTimeout(() => setEmailResult(null), 5000)
    } catch (err) {
      setEmailResult({ ok: false, error: err.message })
    }
    setSendingEmail(false)
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
  const isSent = po.status === 'sent'
  const isExported = po.status === 'exported'
  const isPartialReceived = po.status === 'partial_received'
  const isReceived = po.status === 'received'
  const isCancelled = po.status === 'cancelled'

  // Receiving metrics
  const totalOrdered = items.reduce((s, i) => s + (i.qty_ordered || 0), 0)
  const totalReceived = items.reduce((s, i) => s + (i.qty_received || 0), 0)
  const canReceive = items.length > 0 && (isSent || isExported || isPartialReceived) && totalReceived < totalOrdered

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
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

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && (
            <>
              <button onClick={exportCSV} className="text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors">
                Download CSV
              </button>
              <button
                onClick={() => setShowEmailDialog(true)}
                disabled={items.length === 0}
                className="text-xs font-semibold bg-cyan-600 text-white px-4 py-1.5 rounded hover:bg-cyan-700 transition-colors disabled:opacity-40"
              >
                📧 Send to Vendor
              </button>
              <button
                onClick={() => setConfirmSubmit(true)}
                disabled={items.length === 0}
                className="text-xs font-semibold bg-brand-dark text-white px-4 py-1.5 rounded hover:bg-brand-dark/90 transition-colors disabled:opacity-40"
              >
                Submit & Export to ePIC →
              </button>
            </>
          )}
          {(isSent || isExported || isPartialReceived) && (
            <>
              <button onClick={exportCSV} className="text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors">
                Download CSV
              </button>
              <button
                onClick={() => setShowEmailDialog(true)}
                className="text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors"
              >
                📧 {isSent ? 'Resend to Vendor' : 'Send to Vendor'}
              </button>
              {canReceive && (
                <button
                  onClick={() => navigate(`/ops/receive-po/${id}`)}
                  className="text-xs font-semibold bg-emerald-600 text-white px-4 py-1.5 rounded hover:bg-emerald-700 transition-colors"
                >
                  📥 Receive Items
                </button>
              )}
            </>
          )}
          {isReceived && (
            <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded">
              ✓ Fully Received
            </span>
          )}
          {!isCancelled && !isReceived && (
            <button
              onClick={() => updateStatus('cancelled')}
              className="text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded hover:bg-red-50 transition-colors"
            >
              Cancel PO
            </button>
          )}
        </div>
      </div>

      {/* Email result toast */}
      {emailResult && (
        <div className={`mb-4 p-3 rounded-xl border ${emailResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-sm font-semibold ${emailResult.ok ? 'text-green-800' : 'text-red-700'}`}>
            {emailResult.ok ? `✓ PO emailed to ${emailResult.email}` : `✕ ${emailResult.error}`}
          </p>
        </div>
      )}

      {/* Send to Vendor Modal */}
      {showEmailDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowEmailDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-display font-bold text-stone-800 mb-4">Send PO to Vendor</h3>
            <p className="text-sm text-stone-500 mb-4">
              Emails {po.wrangl_po_number} as a PDF to the vendor with a "REPLY TO CONFIRM" message.
            </p>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Vendor Email</label>
            <input
              type="email"
              value={vendorEmail}
              onChange={e => setVendorEmail(e.target.value)}
              placeholder="orders@vendor.com"
              className="input w-full mb-1"
              autoFocus
            />
            <p className="text-xs text-stone-400 mb-5">This email will be saved to {po.vendor_name}'s vendor record for next time.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEmailDialog(false)}
                className="flex-1 py-2 px-4 rounded-xl border border-stone-200 text-sm text-stone-500 hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={sendPOToVendor}
                disabled={sendingEmail || !vendorEmail}
                className="flex-1 py-2 px-4 rounded-xl bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 disabled:opacity-40 transition-colors"
              >
                {sendingEmail ? 'Sending...' : '📧 Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status timeline */}
      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between gap-2">
          {[
            { key: 'draft',     label: 'Draft',    icon: '✏️',  date: po.created_at,   active: true },
            { key: 'sent',      label: 'Sent',     icon: '📧',  date: po.sent_at,      active: !!po.sent_at || ['sent','exported','partial_received','received'].includes(po.status) },
            { key: 'exported',  label: 'In ePIC',  icon: '📤',  date: null,             active: !!po.epic_po_number || ['exported','partial_received','received'].includes(po.status) },
            { key: 'received',  label: po.status === 'partial_received' ? 'Partial' : 'Received', icon: po.status === 'partial_received' ? '📦' : '✅',  date: po.received_at,  active: ['partial_received','received'].includes(po.status) },
          ].map((step, i, arr) => (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition-all ${
                  step.active ? 'bg-[#5a3a24] text-[#f5e6d0]' : 'bg-stone-100 text-stone-300'
                }`}>
                  {step.icon}
                </div>
                <p className={`text-[10px] font-bold mt-1 uppercase tracking-wide ${step.active ? 'text-stone-700' : 'text-stone-300'}`}>
                  {step.label}
                </p>
                {step.date && (
                  <p className="text-[9px] text-stone-400 mt-0.5">{new Date(step.date).toLocaleDateString()}</p>
                )}
              </div>
              {i < arr.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 ${arr[i+1].active ? 'bg-[#5a3a24]' : 'bg-stone-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Receiving progress (when applicable) */}
      {(isPartialReceived || isReceived || isSent || isExported) && totalOrdered > 0 && (
        <div className="card p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-stone-700">
              {totalReceived} of {totalOrdered} units received
              {isPartialReceived && <span className="ml-2 text-xs text-amber-600">({Math.round((totalReceived/totalOrdered)*100)}%)</span>}
            </p>
            {canReceive && (
              <button
                onClick={() => navigate(`/ops/receive-po/${id}`)}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Receive items →
              </button>
            )}
          </div>
          <div className="w-full bg-stone-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                isReceived ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min((totalReceived/totalOrdered)*100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <span className="text-red-400 text-lg">✕</span>
          <p className="text-sm font-semibold text-red-700">This PO has been cancelled.</p>
        </div>
      )}

      {/* ePIC PO Number */}
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
            <p className="text-sm font-mono text-stone-700">
              {po.epic_po_number || <span className="text-stone-400 italic">Not assigned yet</span>}
            </p>
          )}
        </div>
        {!editingEpicPO && (
          <button onClick={() => setEditingEpicPO(true)} className="text-xs text-stone-400 hover:text-stone-700 border border-stone-200 px-2 py-1 rounded transition-colors">
            {po.epic_po_number ? 'Edit' : '+ Add'}
          </button>
        )}
      </div>

      {/* Line items */}
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
              {!isDraft && <th className="text-center px-5 py-2">Received</th>}
              <th className="text-right px-5 py-2">Unit Cost</th>
              <th className="text-right px-5 py-2">Total</th>
              <th className="text-left px-5 py-2">Note</th>
              {isDraft && <th className="px-5 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const received = item.qty_received || 0
              const ordered = item.qty_ordered || 0
              const fullyReceived = received >= ordered && ordered > 0
              const partial = received > 0 && received < ordered
              return (
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
                {!isDraft && (
                  <td className="px-5 py-3 text-center">
                    {fullyReceived ? (
                      <span className="text-xs font-semibold text-emerald-700">✓ {received}</span>
                    ) : partial ? (
                      <span className="text-xs font-semibold text-amber-700">{received}/{ordered}</span>
                    ) : (
                      <span className="text-xs text-stone-300">—</span>
                    )}
                  </td>
                )}
                <td className="px-5 py-3 text-right text-stone-500">${(item.unit_cost || 0).toFixed(2)}</td>
                <td className="px-5 py-3 text-right font-semibold text-stone-800">${(item.qty_ordered * (item.unit_cost || 0)).toFixed(2)}</td>
                <td className="px-5 py-3 text-stone-400 text-xs">{item.note || '—'}</td>
                {isDraft && (
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => removeItem(item.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Remove</button>
                  </td>
                )}
              </tr>
              )
            })}
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
                <td colSpan={isDraft ? 4 : 5} className="px-5 py-3 text-right text-xs font-bold text-stone-500 uppercase tracking-wide">Total Estimated Value</td>
                <td className="px-5 py-3 text-right font-bold text-stone-800">${totalValue.toFixed(2)}</td>
                <td colSpan={isDraft ? 2 : 1}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Notes */}
      {po.notes && (
        <div className="card p-5">
          <p className="text-[10px] font-bold tracking-[0.1em] text-stone-400 uppercase mb-2">Notes</p>
          <p className="text-sm text-stone-700">{po.notes}</p>
        </div>
      )}

      {/* Confirm Submit Modal */}
      {confirmSubmit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-display font-bold text-stone-800 mb-2">Submit & Export to ePIC?</h3>
            <p className="text-sm text-stone-500 mb-2">
              This will:
            </p>
            <ul className="text-sm text-stone-600 space-y-1 mb-5 list-none">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Mark PO as submitted</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Download a CSV export file</li>
              <li className="flex items-center gap-2"><span className="text-stone-300">○</span> <span className="text-stone-400">XML/ePIC auto-import (coming in Phase 2)</span></li>
            </ul>
            <p className="text-xs text-stone-400 mb-5">Once submitted, line items can no longer be edited.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSubmit(false)} className="flex-1 py-2 px-4 rounded-xl border border-stone-200 text-sm text-stone-500 hover:bg-stone-50">
                Go Back
              </button>
              <button
                onClick={handleSubmitAndExport}
                disabled={saving}
                className="flex-1 py-2 px-4 rounded-xl bg-brand-dark text-white text-sm font-semibold hover:bg-brand-dark/90 disabled:opacity-40"
              >
                {saving ? 'Submitting...' : 'Submit & Export'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
