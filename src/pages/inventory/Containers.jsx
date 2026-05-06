import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_CONFIG = {
  in_transit: { label: 'In Transit', bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    icon: '🚢' },
  arrived:    { label: 'Arrived',    bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   icon: '🏭' },
  received:   { label: 'Received',   bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: '✅' },
}

export function ContainerList() {
  const navigate = useNavigate()
  const [containers, setContainers] = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => { fetchContainers() }, [])

  async function fetchContainers() {
    const { data } = await supabase
      .from('containers')
      .select('*, container_items(id)')
      .eq('active', true)
      .order('created_at', { ascending: false })
    setContainers(data || [])
    setLoading(false)
  }

  const pending  = containers.filter(c => c.status === 'in_transit').length
  const arrived  = containers.filter(c => c.status === 'arrived').length
  const received = containers.filter(c => c.status === 'received').length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/inventory')} className="btn-ghost text-sm">← Inventory</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Containers</h2>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'In Transit', value: pending,  color: 'text-blue-600' },
          { label: 'Arrived',    value: arrived,  color: 'text-amber-600' },
          { label: 'Received',   value: received, color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <div className={`text-2xl font-display font-bold ${color} mb-1`}>{value}</div>
            <div className="text-xs text-stone-400 uppercase tracking-wide font-semibold">{label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="card p-12 text-center text-stone-400">Loading containers...</div>
        ) : containers.length === 0 ? (
          <div className="card p-12 text-center text-stone-400">No containers found</div>
        ) : containers.map(c => {
          const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.in_transit
          const eta = c.eta ? new Date(c.eta).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : null
          const itemCount = c.container_items?.length || 0

          return (
            <div
              key={c.id}
              onClick={() => navigate(`/inventory/containers/${c.id}`)}
              className="card p-5 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl ${cfg.bg} border ${cfg.border}`}>
                    {cfg.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-display font-bold text-stone-800">{c.name}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="text-sm text-stone-500">{c.vendor}</div>
                    {c.notes && <div className="text-xs text-stone-400 mt-1">{c.notes}</div>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  {eta && (
                    <div className={`text-sm font-bold mb-1 ${c.status === 'in_transit' ? 'text-blue-600' : 'text-stone-500'}`}>
                      {c.status === 'received' ? 'Received' : `ETA ${eta}`}
                    </div>
                  )}
                  <div className="text-xs text-stone-400">{itemCount} SKUs</div>
                  <div className="text-stone-300 text-sm mt-1">→</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ContainerDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [container, setContainer] = useState(null)
  const [items,     setItems]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showReceiveModal, setShowReceiveModal] = useState(false)

  useEffect(() => { loadContainer() }, [id])

  async function loadContainer() {
    const [cRes, iRes] = await Promise.all([
      supabase.from('containers').select('*').eq('id', id).single(),
      supabase.from('container_items').select('*').eq('container_id', id).order('description'),
    ])
    setContainer(cRes.data)
    setItems(iRes.data || [])
    setLoading(false)
  }

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><div className="card p-12 text-center text-stone-400">Loading...</div></div>
  if (!container) return <div className="p-6 max-w-4xl mx-auto"><div className="card p-12 text-center text-stone-400">Container not found</div></div>

  const cfg = STATUS_CONFIG[container.status] || STATUS_CONFIG.in_transit
  const eta = container.eta ? new Date(container.eta).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : null
  const totalUnits = items.reduce((sum, i) => sum + (i.quantity || 0), 0)
  const totalValue = items.reduce((sum, i) => sum + ((i.quantity || 0) * (i.unit_cost || 0)), 0)
  const canReceive = container.status !== 'received'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/inventory/containers')} className="btn-ghost text-sm">← Containers</button>
      </div>

      {/* Hero */}
      <div className="card p-6 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-display font-bold text-stone-800">{container.name}</h2>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                {cfg.icon} {cfg.label}
              </span>
            </div>
            <div className="text-stone-500 text-sm">{container.vendor}</div>
            {container.notes && <div className="text-stone-400 text-xs mt-1">{container.notes}</div>}
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            {eta && (
              <div>
                <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">
                  {container.status === 'received' ? 'Received' : 'ETA'}
                </div>
                <div className={`text-lg font-display font-bold ${container.status === 'in_transit' ? 'text-blue-600' : 'text-stone-600'}`}>
                  {eta}
                </div>
              </div>
            )}
            {canReceive && (
              <button
                onClick={() => setShowReceiveModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                📥 Receive Container
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-stone-100">
          <div className="text-center">
            <div className="text-2xl font-display font-bold text-stone-800">{items.length}</div>
            <div className="text-xs text-stone-400 uppercase tracking-wide">SKUs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-display font-bold text-stone-800">{totalUnits.toLocaleString()}</div>
            <div className="text-xs text-stone-400 uppercase tracking-wide">Total Units</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-display font-bold text-stone-800">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-xs text-stone-400 uppercase tracking-wide">Container Value</div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 bg-stone-50">
          <div className="text-xs font-bold text-stone-400 uppercase tracking-wide">Contents — {items.length} SKUs</div>
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">No items recorded for this container</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="text-left px-5 py-3 text-xs font-bold text-stone-400 uppercase">Description</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-stone-400 uppercase">Qty</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Unit Cost</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-stone-400 uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={`border-b border-stone-50 ${i === items.length - 1 ? 'border-b-0' : ''}`}>
                  <td className="px-5 py-3 text-sm text-stone-700">
                    {item.description || '—'}
                    {!item.part_id && (
                      <span className="ml-2 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">UNLINKED</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-semibold text-stone-700">{item.quantity?.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-sm text-stone-500">
                    {item.unit_cost ? '$' + Number(item.unit_cost).toFixed(2) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-stone-700">
                    {item.unit_cost && item.quantity
                      ? '$' + (item.quantity * item.unit_cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-200 bg-stone-50">
                <td className="px-5 py-3 text-xs font-bold text-stone-500 uppercase">Total</td>
                <td className="px-5 py-3 text-center text-sm font-bold text-stone-700">{totalUnits.toLocaleString()}</td>
                <td></td>
                <td className="px-5 py-3 text-right text-sm font-bold text-stone-700">
                  ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {showReceiveModal && (
        <ReceiveContainerModal
          container={container}
          items={items}
          onClose={() => setShowReceiveModal(false)}
          onComplete={() => { setShowReceiveModal(false); loadContainer(); }}
        />
      )}
    </div>
  )
}

// ─── Receive Container Modal ────────────────────────────────────────────────

function ReceiveContainerModal({ container, items, onClose, onComplete }) {
  const linkedItems   = items.filter(i => i.part_id)
  const unlinkedItems = items.filter(i => !i.part_id)

  // resolutions: { [item.id]: 'create' | 'skip' | 'link:<partId>' }
  const [resolutions, setResolutions] = useState(() => {
    const init = {}
    unlinkedItems.forEach(item => { init[item.id] = 'create' })
    return init
  })
  const [allParts, setAllParts] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Load existing parts for the link dropdown (only when there are unlinked items)
  useEffect(() => {
    if (unlinkedItems.length === 0) return
    supabase.from('parts')
      .select('id, name, part_type')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setAllParts(data || []))
  }, [])

  function setResolution(itemId, value) {
    setResolutions(prev => ({ ...prev, [itemId]: value }))
  }

  // Receive count = linked items + unlinked items not skipped
  const willReceiveCount = linkedItems.length + unlinkedItems.filter(i => resolutions[i.id] !== 'skip').length

  async function handleReceive() {
    setSubmitting(true)
    setError('')

    try {
      // 1. Resolve each unlinked item: create new part OR link to existing
      for (const item of unlinkedItems) {
        const res = resolutions[item.id]
        if (res === 'create') {
          // Create new part with the description as the name
          const { data: newPart, error: createErr } = await supabase
            .from('parts')
            .insert({
              part_type: 'component',
              name:      item.description,
              vendor:    container.vendor,
              unit_cost: item.unit_cost || 0,
            })
            .select('id')
            .single()
          if (createErr) throw new Error(`Create part failed: ${createErr.message}`)

          const { error: linkErr } = await supabase
            .from('container_items')
            .update({ part_id: newPart.id })
            .eq('id', item.id)
          if (linkErr) throw new Error(`Link container item failed: ${linkErr.message}`)
        } else if (res?.startsWith('link:')) {
          const partId = res.slice(5)
          const { error: linkErr } = await supabase
            .from('container_items')
            .update({ part_id: partId })
            .eq('id', item.id)
          if (linkErr) throw new Error(`Link container item failed: ${linkErr.message}`)
        }
        // 'skip' → leave unlinked, RPC will skip it
      }

      // 2. Get current user (for transaction attribution)
      const { data: { user } } = await supabase.auth.getUser()

      // 3. Call the atomic receive function
      const { data, error: rpcErr } = await supabase.rpc('receive_container', {
        container_uuid: container.id,
        user_uuid:      user?.id ?? null,
      })
      if (rpcErr) throw new Error(rpcErr.message)

      // Done — close modal and refresh
      onComplete()
    } catch (err) {
      console.error('Receive container failed:', err)
      setError(err.message || 'Failed to receive container')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div>
            <h3 className="font-display font-bold text-stone-800">Receive Container — {container.name}</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {linkedItems.length} ready to receive
              {unlinkedItems.length > 0 && ` · ${unlinkedItems.length} need linking`}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-100 transition-colors">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Linked items */}
          {linkedItems.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2">
                ✓ Ready to receive ({linkedItems.length})
              </h4>
              <div className="border border-stone-200 rounded-lg divide-y divide-stone-100 max-h-64 overflow-y-auto">
                {linkedItems.map(item => (
                  <div key={item.id} className="px-4 py-2 flex items-center justify-between">
                    <span className="text-sm text-stone-700 truncate pr-2">{item.description}</span>
                    <span className="text-sm font-semibold text-stone-800 tabular-nums whitespace-nowrap">
                      +{item.quantity.toLocaleString()} units
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unlinked items */}
          {unlinkedItems.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
                ⚠ Needs linking ({unlinkedItems.length})
              </h4>
              <div className="space-y-2">
                {unlinkedItems.map(item => (
                  <div key={item.id} className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-stone-800">{item.description}</span>
                      <span className="text-sm font-semibold text-stone-700 tabular-nums whitespace-nowrap">
                        {item.quantity.toLocaleString()} units
                        {item.unit_cost ? ` · $${Number(item.unit_cost).toFixed(2)}` : ''}
                      </span>
                    </div>
                    <select
                      value={resolutions[item.id] || 'create'}
                      onChange={(e) => setResolution(item.id, e.target.value)}
                      className="w-full px-3 py-1.5 border border-stone-300 rounded text-sm bg-white"
                    >
                      <option value="create">+ Create new component "{item.description}"</option>
                      <option value="skip">⊘ Skip — don't receive this item</option>
                      <optgroup label="Or link to existing part">
                        {allParts.map(p => (
                          <option key={p.id} value={`link:${p.id}`}>{p.name} ({p.part_type})</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-100 flex items-center justify-between">
          <div className="text-xs">
            {error ? (
              <span className="text-red-600 font-medium">⚠ {error}</span>
            ) : (
              <span className="text-stone-500">Container will be marked received and inventory updated.</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleReceive}
              disabled={submitting || willReceiveCount === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Receiving…' : `Receive ${willReceiveCount} item${willReceiveCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
