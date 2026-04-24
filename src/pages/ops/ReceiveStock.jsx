import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

export default function ReceiveStock() {
  const navigate    = useNavigate()
  const { profile } = useAuth()

  const [mode,        setMode]        = useState('container') // 'container' | 'part'
  const [containers,  setContainers]  = useState([])
  const [parts,       setParts]       = useState([])
  const [selContainer,setSelContainer] = useState(null)
  const [selPart,     setSelPart]     = useState(null)
  const [qty,         setQty]         = useState('')
  const [notes,       setNotes]       = useState('')
  const [contSearch,  setContSearch]  = useState('')
  const [partSearch,  setPartSearch]  = useState('')
  const [showContDrop,setShowContDrop] = useState(false)
  const [showPartDrop,setShowPartDrop] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [success,     setSuccess]     = useState(null)
  const [error,       setError]       = useState('')
  const qtyRef = useRef(null)

  useEffect(() => {
    fetchContainers()
    fetchParts()
  }, [])

  async function fetchContainers() {
    const { data } = await supabase
      .from('containers').select('id, name, vendor, status, eta')
      .eq('active', true).order('name')
    setContainers(data || [])
  }

  async function fetchParts(search = '') {
    let q = supabase.from('parts').select('id, name, part_type, vendor, vendor_id, qty_on_hand, unit_of_measure')
      .eq('active', true).order('name').limit(20)
    if (search) q = q.ilike('name', `%${search}%`)
    const { data } = await q
    setParts(data || [])
  }

  const filteredContainers = containers.filter(c =>
    !contSearch || c.name.toLowerCase().includes(contSearch.toLowerCase()) || c.vendor?.toLowerCase().includes(contSearch.toLowerCase())
  ).slice(0, 8)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selPart || !qty || parseFloat(qty) <= 0) {
      setError('Select a part and enter a valid quantity')
      return
    }
    setSaving(true)
    setError('')

    try {
      const qtyNum = parseFloat(qty)

      // Log transaction
      const { error: txErr } = await supabase.from('inventory_transactions').insert({
        transaction_type: 'receive',
        part_id:          selPart.id,
        quantity:         qtyNum,
        container_id:     selContainer?.id || null,
        notes:            notes || null,
        user_id:          profile?.id,
      })
      if (txErr) throw txErr

      // Update qty_on_hand
      const { error: upErr } = await supabase.rpc('increment_part_qty', {
        p_id:  selPart.id,
        p_qty: qtyNum,
      })
      // Fallback if RPC doesn't exist
      if (upErr) {
        await supabase.from('parts').update({
          qty_on_hand: (selPart.qty_on_hand || 0) + qtyNum,
          updated_at:  new Date().toISOString(),
        }).eq('id', selPart.id)
      }

      setSuccess({
        part: selPart.name,
        qty:  qtyNum,
        unit: selPart.unit_of_measure || 'EA',
        newQty: (selPart.qty_on_hand || 0) + qtyNum,
      })

      // Reset form
      setSelPart(null); setPartSearch(''); setQty(''); setNotes('')
      setSelContainer(null); setContSearch('')
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
        <h2 className="text-2xl font-display font-bold text-stone-800">Receive Stock</h2>
      </div>

      {/* Success toast */}
      {success && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
          <span className="text-xl">✅</span>
          <div>
            <div className="text-sm font-semibold text-emerald-700">Received {success.qty} {success.unit}</div>
            <div className="text-xs text-emerald-600">{success.part} — new qty: {success.newQty}</div>
          </div>
        </div>
      )}

      <div className="card p-6">
        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          {[['container','By Container 🚢'],['part','By Part ⚙️']].map(([val, label]) => (
            <button key={val} onClick={() => setMode(val)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
                mode === val ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Container selector */}
          {mode === 'container' && (
            <div className="relative">
              <label className="label">Container / PO</label>
              <input
                className="input"
                placeholder="Search containers..."
                value={contSearch}
                onChange={e => { setContSearch(e.target.value); setShowContDrop(true) }}
                onFocus={() => setShowContDrop(true)}
                onBlur={() => setTimeout(() => setShowContDrop(false), 200)}
              />
              {selContainer && (
                <div className="mt-1 text-xs text-stone-500 flex items-center gap-2">
                  <span className="text-emerald-600">✓</span> {selContainer.name} — {selContainer.vendor}
                  <button type="button" onClick={() => { setSelContainer(null); setContSearch('') }}
                    className="text-stone-300 hover:text-stone-500 ml-1">✕</button>
                </div>
              )}
              {showContDrop && filteredContainers.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {filteredContainers.map(c => (
                    <button key={c.id} type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors"
                      onClick={() => { setSelContainer(c); setContSearch(c.name); setShowContDrop(false) }}>
                      <div className="text-sm font-semibold text-stone-700">{c.name}</div>
                      <div className="text-xs text-stone-400">{c.vendor} · {c.status}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Part selector */}
          <div className="relative">
            <label className="label">Part *</label>
            <input
              className="input"
              placeholder="Search by name or vendor ID..."
              value={partSearch}
              onChange={e => { setPartSearch(e.target.value); fetchParts(e.target.value); setShowPartDrop(true); if (!e.target.value) setSelPart(null) }}
              onFocus={() => setShowPartDrop(true)}
              onBlur={() => setTimeout(() => setShowPartDrop(false), 200)}
            />
            {selPart && (
              <div className="mt-1 text-xs text-stone-500 flex items-center gap-2">
                <span className="text-emerald-600">✓</span> {selPart.name}
                <span className="text-stone-300">·</span> Current qty: {selPart.qty_on_hand || 0} {selPart.unit_of_measure}
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
                    <div className="text-xs text-stone-400">{p.vendor} · {p.part_type} · qty: {p.qty_on_hand || 0}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="label">Quantity Received *</label>
            <input
              ref={qtyRef}
              className="input text-lg font-semibold"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0"
              value={qty}
              onChange={e => setQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('receive-notes')?.focus() } }}
            />
            {selPart && qty && (
              <div className="mt-1 text-xs text-stone-400">
                New qty will be: {((selPart.qty_on_hand || 0) + parseFloat(qty || 0)).toLocaleString()} {selPart.unit_of_measure}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes <span className="text-stone-300 font-normal normal-case">(optional)</span></label>
            <input id="receive-notes" className="input" placeholder="PO number, lot number, notes..."
              value={notes} onChange={e => setNotes(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e) } }}
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate('/ops')} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving || !selPart || !qty} className="btn-primary flex-1 text-base py-3">
              {saving ? 'Saving...' : '📥 Receive Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
