import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ReorderQueue() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [creatingVendor, setCreatingVendor] = useState(null)
  const [selected, setSelected] = useState({})
  const [editingQty, setEditingQty] = useState({})

  // ── Quick-add state ─────────────────────────────────────────────────────────
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [addSearching, setAddSearching] = useState(false)
  const [addingPart, setAddingPart] = useState(null) // part being added
  const [addQty, setAddQty] = useState('')
  const [addNote, setAddNote] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addSuccess, setAddSuccess] = useState(null)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => { loadQueue() }, [])

  // Auto-focus search when quick-add opens
  useEffect(() => {
    if (showQuickAdd && searchRef.current) searchRef.current.focus()
  }, [showQuickAdd])

  // Debounced search
  useEffect(() => {
    if (!addSearch.trim()) { setAddResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setAddSearching(true)
      const { data } = await supabase
        .from('parts')
        .select('id, name, part_type, vendor, vendor_id, qty_on_hand, reorder_qty')
        .eq('active', true)
        .ilike('name', `%${addSearch.trim()}%`)
        .order('name')
        .limit(10)
      setAddResults(data || [])
      setAddSearching(false)
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [addSearch])

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
    setSelected(prev => { const s = { ...prev }; delete s[id]; return s })
    loadQueue()
  }

  async function updateQty(id, qty) {
    await supabase.from('reorder_queue').update({ qty_requested: parseInt(qty) }).eq('id', id)
    setEditingQty(prev => ({ ...prev, [id]: undefined }))
    loadQueue()
  }

  function toggleItem(id) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleVendor(vendorItems, allSelected) {
    const updates = {}
    vendorItems.forEach(item => { updates[item.id] = !allSelected })
    setSelected(prev => ({ ...prev, ...updates }))
  }

  const grouped = queue.reduce((acc, item) => {
    const key = item.vendor_name || 'Unknown Vendor'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  // ── Quick-add: select a part ────────────────────────────────────────────────
  function selectPartToAdd(part) {
    setAddingPart(part)
    setAddQty(part.reorder_qty || 1)
    setAddNote('')
    setAddSearch('')
    setAddResults([])
  }

  async function handleQuickAdd() {
    if (!addingPart || !addQty) return
    setAddSaving(true)
    try {
      const { data: vendors } = await supabase
        .from('vendors')
        .select('id, vendor_name')
        .ilike('vendor_name', addingPart.vendor || '')
        .limit(1)

      const vendorId = vendors?.[0]?.id || null
      const vendorName = addingPart.vendor || vendors?.[0]?.vendor_name || 'Unknown Vendor'

      await supabase.from('reorder_queue').insert({
        part_id: addingPart.id,
        part_name: addingPart.name,
        stock_number: addingPart.vendor_id,
        vendor_id: vendorId,
        vendor_name: vendorName,
        qty_requested: parseInt(addQty),
        note: addNote.trim() || null,
      })

      setAddSuccess(addingPart.name)
      setAddingPart(null)
      setAddQty('')
      setAddNote('')
      loadQueue()

      // Clear success after 2s
      setTimeout(() => setAddSuccess(null), 2000)
    } catch (e) {
      alert('Error adding: ' + e.message)
    }
    setAddSaving(false)
  }

  function cancelQuickAdd() {
    setAddingPart(null)
    setAddQty('')
    setAddNote('')
    if (searchRef.current) searchRef.current.focus()
  }

  // ── PO creation ─────────────────────────────────────────────────────────────
  async function createPOFromSelected(vendorName) {
    const vendorItems = grouped[vendorName] || []
    const selectedItems = vendorItems.filter(item => selected[item.id])
    if (selectedItems.length === 0) { alert('Select at least one item.'); return }

    setCreating(true)
    setCreatingVendor(vendorName)
    try {
      const { data: vendors } = await supabase
        .from('vendors').select('id').ilike('vendor_name', vendorName).limit(1)
      const vendorId = vendors?.[0]?.id || null

      const year = new Date().getFullYear()
      const { data: existing } = await supabase
        .from('purchase_orders')
        .select('wrangl_po_number')
        .ilike('wrangl_po_number', `WPO-${year}-%`)
        .order('wrangl_po_number', { ascending: false })
        .limit(1)

      let seq = 1
      if (existing?.length > 0) seq = parseInt(existing[0].wrangl_po_number.split('-')[2]) + 1
      const poNumber = `WPO-${year}-${String(seq).padStart(3, '0')}`

      const { data: po, error } = await supabase
        .from('purchase_orders')
        .insert({ wrangl_po_number: poNumber, vendor_id: vendorId, vendor_name: vendorName, status: 'draft' })
        .select().single()
      if (error) throw error

      await supabase.from('purchase_order_items').insert(
        selectedItems.map(item => ({
          po_id: po.id, part_id: item.part_id, part_name: item.part_name,
          stock_number: item.stock_number, qty_ordered: item.qty_requested, note: item.note,
        }))
      )

      await supabase.from('reorder_queue').delete().in('id', selectedItems.map(i => i.id))
      navigate(`/purchasing/po/${po.id}`)
    } catch (e) {
      alert('Error creating PO: ' + e.message)
    } finally {
      setCreating(false)
      setCreatingVendor(null)
    }
  }

  // ── Type badges ─────────────────────────────────────────────────────────────
  const TYPE_BADGE = {
    fabric:    'bg-amber-50 text-amber-700 border-amber-200',
    component: 'bg-blue-50 text-blue-700 border-blue-200',
    extrusion: 'bg-purple-50 text-purple-700 border-purple-200',
    blind:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
  const TYPE_LABEL = { fabric: 'Fabric', component: 'Component', extrusion: 'Extrusion', blind: 'Faux Blind' }

  if (loading) return <div className="p-8 text-stone-500 text-sm">Loading reorder queue...</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-stone-800">Reorder Queue</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {queue.length} item{queue.length !== 1 ? 's' : ''} pending · Select items then create a PO
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowQuickAdd(!showQuickAdd)}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
              showQuickAdd
                ? 'bg-stone-200 text-stone-700'
                : 'bg-brand-dark text-white hover:bg-brand-dark/90'
            }`}
          >
            {showQuickAdd ? '✕ Close' : '+ Add Item'}
          </button>
          <button onClick={() => navigate('/purchasing')} className="text-sm text-stone-500 hover:text-stone-800 border border-stone-200 px-3 py-1.5 rounded-lg transition-colors">
            Purchase Orders →
          </button>
        </div>
      </div>

      {/* ── Quick Add Panel ──────────────────────────────────────────────── */}
      {showQuickAdd && (
        <div className="card p-5 mb-6 border-2 border-brand-dark/20">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">Quick Add to Queue</p>

          {/* Success flash */}
          {addSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 mb-3 flex items-center gap-2">
              <span className="text-green-600 text-sm">✓</span>
              <span className="text-sm text-green-700 font-medium">{addSuccess} added to queue</span>
            </div>
          )}

          {!addingPart ? (
            <>
              {/* Search */}
              <input
                ref={searchRef}
                type="text"
                value={addSearch}
                onChange={e => setAddSearch(e.target.value)}
                placeholder="Search parts by name..."
                className="input w-full text-sm mb-2"
              />

              {/* Results */}
              {addSearching && <p className="text-xs text-stone-400 py-2">Searching...</p>}
              {!addSearching && addSearch && addResults.length === 0 && (
                <p className="text-xs text-stone-400 py-2">No parts found for "{addSearch}"</p>
              )}
              {addResults.length > 0 && (
                <div className="border border-stone-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  {addResults.map(part => (
                    <button
                      key={part.id}
                      onClick={() => selectPartToAdd(part)}
                      className="w-full text-left px-4 py-2.5 hover:bg-stone-50 flex items-center justify-between border-b border-stone-100 last:border-b-0 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-800 truncate">{part.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {part.vendor && <span className="text-xs text-stone-400">{part.vendor}</span>}
                          {part.vendor_id && <span className="text-xs text-stone-400 font-mono">#{part.vendor_id}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${TYPE_BADGE[part.part_type] || 'bg-stone-50 text-stone-500 border-stone-200'}`}>
                          {TYPE_LABEL[part.part_type] || part.part_type}
                        </span>
                        <span className={`text-xs font-mono ${(part.qty_on_hand || 0) <= 0 ? 'text-red-500 font-bold' : 'text-stone-500'}`}>
                          {Math.floor(part.qty_on_hand || 0).toLocaleString()} on hand
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Adding a specific part — show qty + note inline */
            <div className="bg-stone-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{addingPart.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {addingPart.vendor && <span className="text-xs text-stone-400">{addingPart.vendor}</span>}
                    <span className={`text-xs font-mono ${(addingPart.qty_on_hand || 0) <= 0 ? 'text-red-500' : 'text-stone-400'}`}>
                      {Math.floor(addingPart.qty_on_hand || 0).toLocaleString()} on hand
                    </span>
                  </div>
                </div>
                <button onClick={cancelQuickAdd} className="text-stone-400 hover:text-stone-600 text-xs">← Back</button>
              </div>

              <div className="flex items-end gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={addQty}
                    onChange={e => setAddQty(e.target.value)}
                    className="input w-24 text-center"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd() }}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">Note <span className="font-normal normal-case text-stone-300">(optional)</span></label>
                  <input
                    type="text"
                    value={addNote}
                    onChange={e => setAddNote(e.target.value)}
                    placeholder="e.g. urgent, running low"
                    className="input w-full"
                    onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd() }}
                  />
                </div>
                <button
                  onClick={handleQuickAdd}
                  disabled={addSaving || !addQty}
                  className="px-5 py-2 bg-brand-dark text-white text-sm font-semibold rounded-xl hover:bg-brand-dark/90 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {addSaving ? 'Adding...' : 'Add to Queue'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Queue ────────────────────────────────────────────────────────── */}
      {queue.length === 0 && !showQuickAdd ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-stone-600 font-semibold mb-1">Reorder queue is empty</p>
          <p className="text-stone-400 text-sm mb-4">Add items from Inventory or use the Quick Add above</p>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="text-sm font-semibold text-brand-dark hover:underline"
          >
            + Add Item
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([vendorName, items]) => {
            const selectedCount = items.filter(i => selected[i.id]).length
            const allSelected = selectedCount === items.length
            const noneSelected = selectedCount === 0

            return (
              <div key={vendorName} className="card overflow-hidden">
                {/* Vendor header */}
                <div className="flex items-center justify-between px-5 py-3 bg-stone-50 border-b border-stone-100">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = !noneSelected && !allSelected }}
                      onChange={() => toggleVendor(items, allSelected)}
                      className="w-4 h-4 rounded border-stone-300 text-brand-dark cursor-pointer"
                    />
                    <div>
                      <span className="font-semibold text-stone-800 text-sm">{vendorName}</span>
                      <span className="ml-2 text-xs text-stone-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                      {selectedCount > 0 && (
                        <span className="ml-2 text-xs font-semibold text-brand-dark">{selectedCount} selected</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => createPOFromSelected(vendorName)}
                    disabled={(creating && creatingVendor === vendorName) || selectedCount === 0}
                    className="text-xs font-semibold bg-brand-dark text-white px-3 py-1.5 rounded-lg hover:bg-brand-mid transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {creating && creatingVendor === vendorName
                      ? 'Creating...'
                      : selectedCount > 0
                        ? `Create PO (${selectedCount}) →`
                        : 'Select items to create PO'
                    }
                  </button>
                </div>

                {/* Items */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold tracking-[0.1em] text-stone-400 uppercase border-b border-stone-100">
                      <th className="px-5 py-2 w-8"></th>
                      <th className="text-left px-5 py-2">Part</th>
                      <th className="text-left px-5 py-2">Stock #</th>
                      <th className="text-center px-5 py-2">Qty</th>
                      <th className="text-left px-5 py-2">Note</th>
                      <th className="text-left px-5 py-2">Added</th>
                      <th className="px-5 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={`border-b border-stone-50 cursor-pointer transition-colors ${
                          selected[item.id] ? 'bg-brand-dark/5' : 'hover:bg-stone-50'
                        }`}
                      >
                        <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!selected[item.id]}
                            onChange={() => toggleItem(item.id)}
                            className="w-4 h-4 rounded border-stone-300 text-brand-dark cursor-pointer"
                          />
                        </td>
                        <td className="px-5 py-3 text-stone-800 font-medium">{item.part_name}</td>
                        <td className="px-5 py-3 text-stone-500 font-mono text-xs">{item.stock_number || '—'}</td>
                        <td className="px-5 py-3 text-center" onClick={e => e.stopPropagation()}>
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
                              onClick={e => { e.stopPropagation(); setEditingQty(prev => ({ ...prev, [item.id]: true })) }}
                              className="font-semibold text-stone-800 hover:text-brand-dark transition-colors px-2 py-0.5 rounded hover:bg-stone-100"
                            >
                              {item.qty_requested}
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-3 text-stone-400 text-xs">{item.note || '—'}</td>
                        <td className="px-5 py-3 text-stone-400 text-xs">
                          {new Date(item.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-xs text-red-400 hover:text-red-600 transition-colors"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selectedCount > 0 && selectedCount < items.length && (
                  <div className="px-5 py-2 bg-amber-50 border-t border-amber-100">
                    <p className="text-xs text-amber-700">
                      {items.length - selectedCount} unselected item{items.length - selectedCount !== 1 ? 's' : ''} will remain in the queue.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
