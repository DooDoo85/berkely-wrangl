import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

// Email allowlist for who sees recommendations panel.
// Phase A: just David. Add more as we expand rollout.
const RECOMMENDATIONS_ALLOWLIST = ['david@berkelydistribution.com']

export default function ReorderQueue() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const showRecommendations = user?.email && RECOMMENDATIONS_ALLOWLIST.includes(user.email.toLowerCase())
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [creatingVendor, setCreatingVendor] = useState(null)
  const [selected, setSelected] = useState({})
  const [editingQty, setEditingQty] = useState({})

  // ── Recommendations state ────────────────────────────────────────────────
  const [recsOpen, setRecsOpen] = useState(false)
  const [recs, setRecs] = useState([])
  const [recsLoading, setRecsLoading] = useState(false)
  const [recAdding, setRecAdding] = useState(null)        // part_id being added
  const [recDismissing, setRecDismissing] = useState(null) // part_id being dismissed/snoozed
  const [recExpanded, setRecExpanded] = useState({})      // {part_id: bool} for "show math"

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

  // Load recommendations whenever the panel is opened
  useEffect(() => {
    if (recsOpen && showRecommendations) loadRecommendations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recsOpen, showRecommendations])

  async function loadRecommendations() {
    setRecsLoading(true)
    const { data, error } = await supabase
      .from('v_purchasing_recommendations')
      .select('*')
      .in('status', ['order_now', 'order_soon'])
      .order('sort_priority', { ascending: true })
      .order('days_of_supply', { ascending: true, nullsFirst: false })
      .limit(50)
    if (error) {
      console.error('Recommendations load error:', error)
      setRecs([])
    } else {
      setRecs(data || [])
    }
    setRecsLoading(false)
  }

  async function addRecommendationToQueue(rec) {
    setRecAdding(rec.part_id)
    try {
      // Look up vendor for the FK
      let vendorId = null
      if (rec.vendor_name) {
        const { data: vendors } = await supabase
          .from('vendors')
          .select('id')
          .ilike('vendor_name', rec.vendor_name)
          .limit(1)
        vendorId = vendors?.[0]?.id || null
      }

      const { data: { user } } = await supabase.auth.getUser()

      await supabase.from('reorder_queue').insert({
        part_id: rec.part_id,
        part_name: rec.part_name,
        stock_number: rec.vendor_part_number,
        vendor_id: vendorId,
        vendor_name: rec.vendor_name || 'Unknown Vendor',
        qty_requested: rec.suggested_qty || 1,
        note: `Auto-suggested · ${Math.round(rec.days_of_supply || 0)}d supply at ${(rec.effective_velocity || 0).toFixed(2)}/day`,
        added_by: user?.id || null,
      })

      // Remove this rec from the local list
      setRecs(prev => prev.filter(r => r.part_id !== rec.part_id))
      loadQueue()
    } catch (e) {
      alert('Error adding recommendation: ' + e.message)
    } finally {
      setRecAdding(null)
    }
  }

  async function dismissRecommendation(rec, action, days) {
    setRecDismissing(rec.part_id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let snoozedUntil = null
      if (action === 'snooze' && days) {
        const d = new Date()
        d.setDate(d.getDate() + days)
        snoozedUntil = d.toISOString()
      }
      await supabase.from('recommendation_dismissals').insert({
        part_id: rec.part_id,
        user_id: user?.id,
        action,
        snoozed_until: snoozedUntil,
      })
      // Remove from list
      setRecs(prev => prev.filter(r => r.part_id !== rec.part_id))
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setRecDismissing(null)
    }
  }

  // Auto-focus search when quick-add opens
  useEffect(() => {
    if (showQuickAdd && searchRef.current) searchRef.current.focus()
  }, [showQuickAdd])

  // Strip accents (é→e, ô→o) so "Orleans" matches "Orléans"
  const stripAccents = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Debounced search
  useEffect(() => {
    if (!addSearch.trim()) { setAddResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setAddSearching(true)
      try {
        // Pull broader pool (we'll filter client-side for accent-insensitive match)
        const { data, error } = await supabase
          .from('parts')
          .select('id, name, part_type, vendor, vendor_id, qty_on_hand')
          .eq('active', true)
          .order('name')
          .limit(500)

        if (error) {
          console.error('Parts search error:', error)
          setAddResults([])
        } else {
          const term = stripAccents(addSearch.trim().toLowerCase())
          const filtered = (data || [])
            .filter(p => stripAccents((p.name || '').toLowerCase()).includes(term))
            .slice(0, 10)
          setAddResults(filtered)
        }
      } catch (e) {
        console.error('Search exception:', e)
        setAddResults([])
      }
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

      // Pull pricing for parts in this PO so we can auto-fill unit_cost
      const partIds = selectedItems.map(i => i.part_id).filter(Boolean)
      let priceMap = {}
      if (partIds.length > 0) {
        const { data: parts } = await supabase
          .from('parts')
          .select('id, unit_cost, pack_size, pack_cost, vendor_part_number')
          .in('id', partIds)
        priceMap = (parts || []).reduce((acc, p) => { acc[p.id] = p; return acc }, {})
      }

      await supabase.from('purchase_order_items').insert(
        selectedItems.map(item => {
          const pricing = priceMap[item.part_id] || {}
          return {
            po_id: po.id,
            part_id: item.part_id,
            part_name: item.part_name,
            stock_number: pricing.vendor_part_number || item.stock_number,
            qty_ordered: item.qty_requested,
            unit_cost: pricing.unit_cost ?? null,
            note: item.note,
          }
        })
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
          {showRecommendations && (
            <button
              onClick={() => setRecsOpen(!recsOpen)}
              className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-2 ${
                recsOpen
                  ? 'bg-stone-200 text-stone-700'
                  : 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
              }`}
              title="Velocity-based reorder recommendations (visible only to you)"
            >
              {recsOpen ? '✕ Hide' : '🤠 Recommendations'}
              {!recsOpen && recs.length > 0 && (
                <span className="bg-amber-700 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {recs.length}
                </span>
              )}
            </button>
          )}
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

      {/* ── Recommendations Panel ──────────────────────────────────────────── */}
      {showRecommendations && recsOpen && (
        <RecommendationsPanel
          recs={recs}
          loading={recsLoading}
          adding={recAdding}
          dismissing={recDismissing}
          expanded={recExpanded}
          onToggleExpand={(id) => setRecExpanded(prev => ({ ...prev, [id]: !prev[id] }))}
          onAdd={addRecommendationToQueue}
          onDismiss={dismissRecommendation}
          onRefresh={loadRecommendations}
        />
      )}

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

// ── Recommendations Panel ──────────────────────────────────────────────────
// Phase A: gated to David only, velocity-based math from PIC YTD baselines.
// Each card shows the math (recent vs historical, days supply, suggested qty)
// and supports Add to Queue / Snooze 7d / Snooze 30d / Dismiss.

function RecommendationsPanel({ recs, loading, adding, dismissing, expanded, onToggleExpand, onAdd, onDismiss, onRefresh }) {
  if (loading) {
    return (
      <div className="card p-8 mb-6 border-2 border-amber-200 bg-amber-50/50">
        <div className="flex items-center gap-3 text-sm text-amber-800">
          <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
          Computing recommendations...
        </div>
      </div>
    )
  }

  const orderNow = recs.filter(r => r.status === 'order_now')
  const orderSoon = recs.filter(r => r.status === 'order_soon')

  return (
    <div className="card mb-6 border-2 border-amber-200 bg-gradient-to-br from-amber-50/60 to-stone-50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-amber-200/60 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">🤠 Velocity-Based Recommendations</p>
          <p className="text-xs text-stone-500 mt-1">
            Based on Jan–Apr 2026 PIC usage data · {recs.length} item{recs.length !== 1 ? 's' : ''} need attention
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs text-stone-500 hover:text-stone-800 px-2 py-1 rounded hover:bg-stone-100"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Empty state */}
      {recs.length === 0 && (
        <div className="p-8 text-center">
          <div className="text-3xl mb-2">✓</div>
          <p className="text-sm text-stone-600 font-semibold">All inventory looks healthy</p>
          <p className="text-xs text-stone-400 mt-1">No parts are running low based on velocity baselines</p>
        </div>
      )}

      {/* Order Now section */}
      {orderNow.length > 0 && (
        <div>
          <div className="px-5 py-2 bg-red-50/70 border-b border-red-100 flex items-center gap-2">
            <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest">🔴 Order Now</span>
            <span className="text-xs text-red-700">— {orderNow.length} part{orderNow.length !== 1 ? 's' : ''} below safety threshold</span>
          </div>
          {orderNow.map(rec => (
            <RecommendationCard
              key={rec.part_id}
              rec={rec}
              expanded={!!expanded[rec.part_id]}
              adding={adding === rec.part_id}
              dismissing={dismissing === rec.part_id}
              onToggleExpand={() => onToggleExpand(rec.part_id)}
              onAdd={() => onAdd(rec)}
              onDismiss={(action, days) => onDismiss(rec, action, days)}
            />
          ))}
        </div>
      )}

      {/* Order Soon section */}
      {orderSoon.length > 0 && (
        <div>
          <div className="px-5 py-2 bg-amber-50/70 border-b border-amber-100 flex items-center gap-2">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">🟡 Order Soon</span>
            <span className="text-xs text-amber-700">— {orderSoon.length} part{orderSoon.length !== 1 ? 's' : ''} approaching reorder point</span>
          </div>
          {orderSoon.map(rec => (
            <RecommendationCard
              key={rec.part_id}
              rec={rec}
              expanded={!!expanded[rec.part_id]}
              adding={adding === rec.part_id}
              dismissing={dismissing === rec.part_id}
              onToggleExpand={() => onToggleExpand(rec.part_id)}
              onAdd={() => onAdd(rec)}
              onDismiss={(action, days) => onDismiss(rec, action, days)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RecommendationCard({ rec, expanded, adding, dismissing, onToggleExpand, onAdd, onDismiss }) {
  const supply = rec.days_of_supply
  const supplyDisplay = supply == null ? '—' : `${Math.round(supply)}d`
  const supplyColor =
    supply == null ? 'text-stone-400' :
    supply < 7 ? 'text-red-700 font-bold' :
    supply < 14 ? 'text-red-600 font-semibold' :
    supply < 30 ? 'text-amber-700 font-semibold' :
    'text-stone-600'

  const trend = rec.trend_pct
  const trendDisplay = trend == null ? null
    : trend > 0.10 ? { label: `+${(trend*100).toFixed(0)}%`, color: 'text-green-600', icon: '▲' }
    : trend < -0.10 ? { label: `${(trend*100).toFixed(0)}%`, color: 'text-stone-500', icon: '▼' }
    : null

  const cvHigh = rec.velocity_cv != null && rec.velocity_cv > 0.7
  const tierLabel = rec.velocity_tier || '?'
  const TIER_BG = { A: 'bg-purple-50 text-purple-700 border-purple-200', B: 'bg-blue-50 text-blue-700 border-blue-200', C: 'bg-stone-50 text-stone-500 border-stone-200' }

  return (
    <div className="px-5 py-3 border-b border-stone-100 last:border-b-0 hover:bg-white/60 transition-colors">
      <div className="flex items-start gap-4">
        {/* Tier badge */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide border mt-0.5 ${TIER_BG[tierLabel] || TIER_BG.C}`}>
          {tierLabel}
        </span>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-stone-800 truncate">{rec.part_name}</p>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-stone-500 flex-wrap">
                {rec.vendor_name && <span>{rec.vendor_name}</span>}
                {rec.vendor_part_number && <span className="font-mono">#{rec.vendor_part_number}</span>}
                <span className={supplyColor}>{supplyDisplay} supply</span>
                <span>·</span>
                <span>velocity {(rec.effective_velocity || 0).toFixed(2)}/{rec.uom?.toLowerCase() || 'day'}/day</span>
                {trendDisplay && (
                  <span className={trendDisplay.color}>{trendDisplay.icon} {trendDisplay.label} vs baseline</span>
                )}
                {cvHigh && (
                  <span className="text-amber-700 italic">⚠ high variability</span>
                )}
              </div>
            </div>

            {/* Action: Add to Queue */}
            <button
              onClick={onAdd}
              disabled={adding || dismissing}
              className="text-xs font-semibold bg-brand-dark text-white px-3 py-1.5 rounded-lg hover:bg-brand-mid transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {adding
                ? 'Adding...'
                : `Add ${rec.suggested_qty || '?'} ${rec.uom || ''} to Queue →`
              }
            </button>
          </div>

          {/* Expanded math */}
          {expanded && (
            <div className="mt-3 p-3 bg-white border border-stone-200 rounded-lg text-xs">
              <p className="font-bold text-stone-700 mb-2">📊 The math</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-stone-600">
                <div>On hand:</div>
                <div className="font-mono text-right text-stone-800">{Number(rec.qty_on_hand).toLocaleString()} {rec.uom}</div>
                <div>Committed:</div>
                <div className="font-mono text-right text-stone-800">{Number(rec.qty_committed).toLocaleString()} {rec.uom}</div>
                <div className="border-t border-stone-200 pt-1 font-semibold">Available:</div>
                <div className="font-mono text-right text-stone-800 border-t border-stone-200 pt-1 font-semibold">{Number(rec.qty_available).toLocaleString()} {rec.uom}</div>
                <div className="mt-2">Recent (3mo) velocity:</div>
                <div className="font-mono text-right text-stone-800 mt-2">{(rec.velocity_3mo_avg || 0).toFixed(2)} {rec.uom}/day</div>
                <div>Baseline (4mo) velocity:</div>
                <div className="font-mono text-right text-stone-800">{(rec.velocity_4mo_avg || 0).toFixed(2)} {rec.uom}/day</div>
                <div>Variability (CV):</div>
                <div className="font-mono text-right text-stone-800">{rec.velocity_cv != null ? rec.velocity_cv.toFixed(2) : '—'} {cvHigh && <span className="text-amber-700">(high)</span>}</div>
                <div>Days of supply:</div>
                <div className="font-mono text-right font-semibold text-stone-800">{supplyDisplay}</div>
                <div>Tier:</div>
                <div className="font-mono text-right text-stone-800">{tierLabel} ({tierLabel === 'A' ? 'top 80%' : tierLabel === 'B' ? 'next 15%' : 'long tail'})</div>
                <div>Suggested qty covers:</div>
                <div className="font-mono text-right text-stone-800">{tierLabel === 'A' ? '60 days' : tierLabel === 'B' ? '90 days' : '30 days'}</div>
              </div>
              <p className="mt-2 text-[10px] text-stone-400">Source: {rec.velocity_period}</p>
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center gap-3 mt-2 text-xs">
            <button
              onClick={onToggleExpand}
              className="text-stone-500 hover:text-stone-800 transition-colors"
            >
              {expanded ? '▴ Hide math' : '▾ Show math'}
            </button>
            <span className="text-stone-300">·</span>
            <button
              onClick={() => onDismiss('snooze', 7)}
              disabled={dismissing}
              className="text-stone-500 hover:text-stone-800 transition-colors disabled:opacity-40"
            >
              Snooze 7d
            </button>
            <button
              onClick={() => onDismiss('snooze', 30)}
              disabled={dismissing}
              className="text-stone-500 hover:text-stone-800 transition-colors disabled:opacity-40"
            >
              Snooze 30d
            </button>
            <button
              onClick={() => onDismiss('dismiss', null)}
              disabled={dismissing}
              className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
