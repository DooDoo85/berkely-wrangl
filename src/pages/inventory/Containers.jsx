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
              <span className="text-xs text-stone-400 border border-stone-200 px-2 py-0.5 rounded">Read Only</span>
            </div>
            <div className="text-stone-500 text-sm">{container.vendor}</div>
            {container.notes && <div className="text-stone-400 text-xs mt-1">{container.notes}</div>}
          </div>
          {eta && (
            <div className="text-right">
              <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">
                {container.status === 'received' ? 'Received' : 'ETA'}
              </div>
              <div className={`text-lg font-display font-bold ${container.status === 'in_transit' ? 'text-blue-600' : 'text-stone-600'}`}>
                {eta}
              </div>
            </div>
          )}
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
                  <td className="px-5 py-3 text-sm text-stone-700">{item.description || '—'}</td>
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
    </div>
  )
}
