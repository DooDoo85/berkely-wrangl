import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'
import HoldModal from '../../components/HoldModal'

// Strip accents for search (é→e, ô→o, etc.)
const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export default function ProductionHub() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  // ── Order lookup ────────────────────────────────────────────────────────────
  const [orderInput, setOrderInput] = useState('')
  const [order, setOrder] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showHoldModal, setShowHoldModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Fabric cuts ─────────────────────────────────────────────────────────────
  const [fabrics, setFabrics] = useState([])
  const [cuts, setCuts] = useState([])
  const [fabricSearch, setFabricSearch] = useState('')
  const [showFabricDropdown, setShowFabricDropdown] = useState(null) // index of active dropdown
  const dropdownRef = useRef(null)

  // Load fabrics on mount
  useEffect(() => {
    async function loadFabrics() {
      const { data } = await supabase
        .from('parts')
        .select('id, name, qty_on_hand')
        .eq('part_type', 'fabric')
        .eq('active', true)
        .order('name')
      setFabrics(data || [])
    }
    loadFabrics()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowFabricDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function searchOrder() {
    const val = orderInput.trim()
    if (!val) return
    setSearching(true)
    setError(null)
    setOrder(null)
    setNotFound(false)
    setSuccess(null)
    setCuts([])

    const { data, error: err } = await supabase
      .from('orders')
      .select('*')
      .or(`order_number.eq.${val},epic_id.eq.${val}`)
      .single()

    if (err || !data) {
      setNotFound(true)
    } else {
      setOrder(data)
      // Auto-add one empty cut line
      setCuts([{ fabricId: null, fabricName: '', cutLength: '', search: '' }])
    }
    setSearching(false)
  }

  function useManualOrder() {
    const val = orderInput.trim()
    setNotFound(false)
    setOrder({
      _manual: true,
      order_number: val,
      customer_name: '',
      status: 'new',
    })
    setCuts([{ fabricId: null, fabricName: '', cutLength: '', search: '' }])
  }

  // ── Cut management ──────────────────────────────────────────────────────────
  function addCutLine() {
    setCuts(prev => [...prev, { fabricId: null, fabricName: '', cutLength: '', search: '' }])
  }

  function removeCutLine(idx) {
    setCuts(prev => prev.filter((_, i) => i !== idx))
  }

  function selectFabric(idx, fabric) {
    setCuts(prev => prev.map((c, i) =>
      i === idx ? { ...c, fabricId: fabric.id, fabricName: fabric.name, search: '' } : c
    ))
    setShowFabricDropdown(null)
  }

  function updateCutLength(idx, val) {
    setCuts(prev => prev.map((c, i) =>
      i === idx ? { ...c, cutLength: val } : c
    ))
  }

  function updateCutSearch(idx, val) {
    setCuts(prev => prev.map((c, i) =>
      i === idx ? { ...c, search: val } : c
    ))
    setShowFabricDropdown(idx)
  }

  function clearFabric(idx) {
    setCuts(prev => prev.map((c, i) =>
      i === idx ? { ...c, fabricId: null, fabricName: '', search: '' } : c
    ))
  }

  // ── Submit: start production + deduct fabric ────────────────────────────────
  async function handleStartProduction() {
    if (!order) return

    // Validate cuts — remove empty lines, check remaining have fabric + length
    const validCuts = cuts.filter(c => c.fabricId && c.cutLength)
    const invalidCuts = cuts.filter(c => (c.fabricId && !c.cutLength) || (!c.fabricId && c.cutLength))
    if (invalidCuts.length > 0) {
      setError('Each cut line needs both a fabric and cut length')
      return
    }

    // When already in production, require at least one cut (otherwise nothing to log)
    if (order.status === 'in_production' && !order._manual && validCuts.length === 0) {
      setError('Add at least one fabric cut to log')
      return
    }

    // Check stock for each cut
    for (const cut of validCuts) {
      const fabric = fabrics.find(f => f.id === cut.fabricId)
      if (fabric && parseFloat(cut.cutLength) > (fabric.qty_on_hand || 0)) {
        setError(`Not enough stock for ${fabric.name} — need ${cut.cutLength}" but only ${Math.floor(fabric.qty_on_hand)}" on hand`)
        return
      }
    }

    setSaving(true)
    setError(null)

    try {
      let orderId = order.id

      // If manual order, create it first
      if (order._manual) {
        const { data: newOrder, error: createErr } = await supabase
          .from('orders')
          .insert({
            order_number: order.order_number,
            epic_id: order.order_number,
            status: 'in_production',
            wrangl_status: 'in_production',
            wrangl_status_set_at: new Date().toISOString(),
            wrangl_status_set_by: profile?.id || null,
            source: 'wrangl',
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (createErr) throw new Error('Failed to create order: ' + createErr.message)
        orderId = newOrder.id
      } else if (order.status !== 'in_production') {
        // First time starting — update status
        const { error: updateErr } = await supabase
          .from('orders')
          .update({
            status: 'in_production',
            wrangl_status: 'in_production',
            wrangl_status_set_at: new Date().toISOString(),
            wrangl_status_set_by: profile?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)

        if (updateErr) throw new Error('Failed to update order: ' + updateErr.message)
      }
      // else: already in production — just log additional cuts, no status change

      // Process each cut — deduct from inventory + log transaction
      for (const cut of validCuts) {
        const qty = parseFloat(cut.cutLength)
        const fabric = fabrics.find(f => f.id === cut.fabricId)
        if (!fabric) continue

        // Deduct from qty_on_hand
        const newQty = Math.max(0, (fabric.qty_on_hand || 0) - qty)
        await supabase
          .from('parts')
          .update({ qty_on_hand: newQty, updated_at: new Date().toISOString() })
          .eq('id', cut.fabricId)

        // Log the transaction
        await supabase.from('inventory_transactions').insert({
          transaction_type: 'cut',
          part_id: cut.fabricId,
          quantity: -qty,
          order_id: orderId,
          reason: 'Production cut',
          notes: `Cut ${qty}" of ${fabric.name} for order #${order.order_number}`,
          user_id: profile?.id || null,
        })

        // Update local fabric state
        fabric.qty_on_hand = newQty
      }

      setFabrics([...fabrics]) // trigger re-render with updated qtys
      const cutSummary = validCuts.length > 0
        ? ` — ${validCuts.length} fabric cut${validCuts.length > 1 ? 's' : ''} logged`
        : ''
      const action = order.status === 'in_production' && !order._manual
        ? 'Cuts logged'
        : '→ In Production'
      setSuccess(`Order #${order.order_number} ${action} ✓${cutSummary}`)
      setOrder(null)
      setOrderInput('')
      setCuts([])
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function handleHoldSaved() {
    setShowHoldModal(false)
    setSuccess(`Order #${order.order_number} placed on hold ✓`)
    setOrder(null)
    setOrderInput('')
    setCuts([])
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const statusColors = {
    printed:       'bg-status-info-soft text-status-info border-[rgba(74,107,140,0.25)]',
    credit_ok:     'bg-status-healthy-soft text-status-healthy border-[rgba(91,140,90,0.25)]',
    in_production: 'bg-status-warning-soft text-status-warning border-[rgba(194,145,58,0.25)]',
    on_hold:       'bg-status-critical-soft text-status-critical border-[rgba(181,74,58,0.25)]',
    invoiced:      'bg-status-healthy-soft text-status-healthy border-[rgba(91,140,90,0.25)]',
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-strong">Start Production</h1>
          <p className="text-sm text-ink-muted mt-0.5">Look up an order, cut fabric, and start production</p>
        </div>
        <button
          onClick={() => navigate('/orders/on-hold')}
          className="text-sm text-ink-muted hover:text-ink-strong border border-[var(--surface-border)] px-3 py-1.5 rounded-lg transition-colors"
        >
          Orders on Hold →
        </button>
      </div>

      {/* ── Step 1: Order lookup ──────────────────────────────────────────── */}
      <div className="card p-5 mb-5">
        <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-3">1 · Order Number</p>
        <div className="flex gap-3">
          <input
            type="text"
            value={orderInput}
            onChange={e => setOrderInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') searchOrder() }}
            placeholder="e.g. 114475"
            className="input flex-1 text-lg font-mono"
            autoFocus
          />
          <button
            onClick={searchOrder}
            disabled={searching || !orderInput.trim()}
            className="px-5 py-2 bg-[#2a1d10] text-white font-semibold rounded-xl hover:bg-[#2a1d10]/90 disabled:opacity-40 transition-colors"
          >
            {searching ? 'Looking up...' : 'Look Up'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 mb-4 bg-status-critical-soft border border-[rgba(181,74,58,0.25)]">
          <p className="text-sm text-status-critical">{error}</p>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="card p-4 mb-4 bg-status-healthy-soft border border-[rgba(91,140,90,0.25)]">
          <p className="text-sm font-semibold text-status-healthy">{success}</p>
        </div>
      )}

      {/* Not found — offer to create manually */}
      {notFound && (
        <div className="card p-5 mb-5 border border-[rgba(194,145,58,0.25)] bg-status-warning-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-status-warning">Order #{orderInput.trim()} not found in Wrangl</p>
              <p className="text-xs text-status-warning mt-0.5">It may not have synced from ePIC yet. You can start production manually.</p>
            </div>
            <button
              onClick={useManualOrder}
              className="px-4 py-2 bg-status-warning text-white font-semibold text-sm rounded-xl hover:bg-status-warning transition-colors whitespace-nowrap"
            >
              Use #{orderInput.trim()}
            </button>
          </div>
        </div>
      )}

      {/* ── Order found / manual entry ────────────────────────────────────── */}
      {order && (
        <>
          {/* Order details card */}
          <div className="card overflow-hidden mb-5">
            <div className="px-5 py-4 border-b border-[var(--surface-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-ink-strong font-mono">#{order.order_number}</h2>
                    {order._manual ? (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[rgba(141,123,104,0.10)] text-ink-muted border border-[var(--surface-border)]">MANUAL</span>
                    ) : (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${statusColors[order.status] || 'bg-[rgba(141,123,104,0.10)] text-ink-mid border-[var(--surface-border)]'}`}>
                        {order.status?.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {order.customer_name && <p className="text-sm text-ink-muted mt-1">{order.customer_name}</p>}
                  {order.sidemark && <p className="text-xs text-ink-muted mt-0.5">{order.sidemark}</p>}
                </div>
                {order.sales_rep && (
                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Sales Rep</p>
                    <p className="text-sm font-semibold text-ink-mid">{order.sales_rep}</p>
                  </div>
                )}
              </div>
            </div>

            {!order._manual && (
              <div className="px-5 py-4 grid grid-cols-3 gap-4 text-sm border-b border-[var(--surface-border)]">
                <div>
                  <p className="text-xs text-ink-muted mb-0.5">Order Date</p>
                  <p className="text-ink-mid">{order.order_date ? new Date(order.order_date).toLocaleDateString() : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted mb-0.5">Total Units</p>
                  <p className="text-ink-mid font-semibold">{order.total_units || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted mb-0.5">PO Number</p>
                  <p className="text-ink-mid font-mono">{order.po_number || '—'}</p>
                </div>
              </div>
            )}

            {/* Hold info if already on hold */}
            {order.status === 'on_hold' && (
              <div className="px-5 py-4 bg-status-critical-soft border-b border-[rgba(181,74,58,0.20)]">
                <p className="text-xs font-bold text-status-critical uppercase tracking-wide mb-2">Currently On Hold</p>
                <p className="text-sm text-status-critical"><strong>Reason:</strong> {order.hold_reason}</p>
                {order.hold_note && <p className="text-sm text-status-critical mt-1">{order.hold_note}</p>}
                {order.part_expected_date && (
                  <p className="text-xs text-status-critical mt-1">Parts expected: {new Date(order.part_expected_date).toLocaleDateString()}</p>
                )}
              </div>
            )}
          </div>

          {/* ── Step 2: Fabric Cuts ──────────────────────────────────────── */}
          {order.status !== 'on_hold' && (
            <div className="card p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">2 · Fabric Cuts</p>
                <p className="text-[10px] text-ink-muted">Optional — skip if no fabric needed</p>
              </div>

              <div className="space-y-3" ref={dropdownRef}>
                {cuts.map((cut, idx) => {
                  const selectedFabric = cut.fabricId ? fabrics.find(f => f.id === cut.fabricId) : null
                  const searchVal = cut.search || ''
                  const filteredFabrics = fabrics.filter(f =>
                    stripAccents(f.name.toLowerCase()).includes(stripAccents(searchVal.toLowerCase()))
                  ).slice(0, 8)

                  return (
                    <div key={idx} className="flex gap-3 items-start">
                      {/* Fabric selector */}
                      <div className="flex-1 relative">
                        {selectedFabric ? (
                          <div className="flex items-center justify-between bg-[rgba(141,123,104,0.06)] border border-[var(--surface-border)] rounded-xl px-3 py-2.5">
                            <div>
                              <span className="text-sm font-medium text-ink-strong">{selectedFabric.name}</span>
                              <span className="text-xs text-ink-muted ml-2">
                                {Math.floor(selectedFabric.qty_on_hand || 0).toLocaleString()}" on hand
                              </span>
                            </div>
                            <button onClick={() => clearFabric(idx)} className="text-ink-muted hover:text-ink-mid text-xs ml-2">✕</button>
                          </div>
                        ) : (
                          <>
                            <input
                              type="text"
                              value={searchVal}
                              onChange={e => updateCutSearch(idx, e.target.value)}
                              onFocus={() => setShowFabricDropdown(idx)}
                              placeholder="Search fabric..."
                              className="input w-full"
                            />
                            {showFabricDropdown === idx && (
                              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-[var(--surface-card)] border border-[var(--surface-border)] rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                {filteredFabrics.length === 0 ? (
                                  <div className="px-3 py-2 text-xs text-ink-muted">No fabrics found</div>
                                ) : (
                                  filteredFabrics.map(f => (
                                    <button
                                      key={f.id}
                                      onClick={() => selectFabric(idx, f)}
                                      className="w-full text-left px-3 py-2 hover:bg-black/[0.02] flex items-center justify-between text-sm transition-colors"
                                    >
                                      <span className="text-ink-strong">{f.name}</span>
                                      <span className={`text-xs font-mono ${(f.qty_on_hand || 0) <= 0 ? 'text-status-critical' : 'text-ink-muted'}`}>
                                        {Math.floor(f.qty_on_hand || 0).toLocaleString()}"
                                      </span>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Cut length */}
                      <div className="w-32">
                        <div className="relative">
                          <input
                            type="number"
                            value={cut.cutLength}
                            onChange={e => updateCutLength(idx, e.target.value)}
                            placeholder="Length"
                            className="input w-full pr-6 text-right font-mono"
                            min="0"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">"</span>
                        </div>
                      </div>

                      {/* Remaining after cut */}
                      <div className="w-24 pt-2.5 text-right">
                        {selectedFabric && cut.cutLength ? (
                          <span className={`text-xs font-semibold ${
                            (selectedFabric.qty_on_hand || 0) - parseFloat(cut.cutLength || 0) < 0
                              ? 'text-status-critical' : 'text-status-healthy'
                          }`}>
                            → {Math.floor((selectedFabric.qty_on_hand || 0) - parseFloat(cut.cutLength || 0)).toLocaleString()}"
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </div>

                      {/* Remove line */}
                      {cuts.length > 1 && (
                        <button
                          onClick={() => removeCutLine(idx)}
                          className="pt-2.5 text-ink-muted hover:text-status-critical transition-colors text-sm"
                        >✕</button>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                onClick={addCutLine}
                className="mt-3 text-xs font-semibold text-[#2a1d10] hover:text-[#2a1d10]/80 transition-colors"
              >
                + Add another cut
              </button>
            </div>
          )}

          {/* ── Step 3: Actions ───────────────────────────────────────────── */}
          <div className="card p-5">
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-4">
              {order.status === 'on_hold' ? 'Actions' : order.status === 'in_production' ? '3 · Log Cuts' : '3 · Start'}
            </p>

            <div className="flex items-center gap-3">
              {order.status === 'on_hold' ? (
                <button
                  onClick={async () => {
                    setSaving(true)
                    await supabase.from('orders').update({
                      status: 'in_production',
                      wrangl_status: 'in_production',
                      hold_released_at: new Date().toISOString(),
                      wrangl_status_set_at: new Date().toISOString(),
                      wrangl_status_set_by: profile?.id || null,
                      updated_at: new Date().toISOString(),
                    }).eq('id', order.id)
                    setSaving(false)
                    setSuccess(`Hold released — Order #${order.order_number} back in production ✓`)
                    setOrder(null)
                    setOrderInput('')
                    setCuts([])
                  }}
                  disabled={saving}
                  className="flex-1 py-3 bg-status-healthy text-white font-semibold rounded-xl hover:bg-status-healthy disabled:opacity-40 transition-colors"
                >
                  ✓ Release Hold — Back to Production
                </button>
              ) : (
                <>
                  <button
                    onClick={handleStartProduction}
                    disabled={saving}
                    className="flex-1 py-3 bg-[#2a1d10] text-white font-semibold rounded-xl hover:bg-[#2a1d10]/90 disabled:opacity-40 transition-colors text-sm"
                  >
                    {saving
                      ? 'Processing...'
                      : order.status === 'in_production'
                        ? '➕ Log Cuts'
                        : '▶ Start Production'}
                  </button>
                  <button
                    onClick={() => setShowHoldModal(true)}
                    disabled={saving || order._manual}
                    className="flex-1 py-3 border-2 border-[rgba(181,74,58,0.30)] text-status-critical font-semibold rounded-xl hover:bg-status-critical-soft disabled:opacity-40 transition-colors text-sm"
                  >
                    ⏸ Place on Hold
                  </button>
                </>
              )}
            </div>

            {/* Cut summary */}
            {cuts.filter(c => c.fabricId && c.cutLength).length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--surface-border)]">
                <p className="text-xs text-ink-muted mb-2">Cuts that will be deducted:</p>
                {cuts.filter(c => c.fabricId && c.cutLength).map((cut, idx) => {
                  const fabric = fabrics.find(f => f.id === cut.fabricId)
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs text-ink-mid py-0.5">
                      <span>{fabric?.name}</span>
                      <span className="font-mono font-semibold">-{parseFloat(cut.cutLength).toLocaleString()}"</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Hold modal */}
      {showHoldModal && order && !order._manual && (
        <HoldModal
          order={order}
          onClose={() => setShowHoldModal(false)}
          onSaved={handleHoldSaved}
        />
      )}
    </div>
  )
}
