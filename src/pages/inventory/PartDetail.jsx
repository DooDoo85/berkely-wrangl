import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TYPE_CONFIG = {
  fabric:    { label: 'Fabric',     icon: '🧻', color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  component: { label: 'Component',  icon: '⚙️', color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  extrusion: { label: 'Extrusion',  icon: '📏', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  blind:     { label: 'Faux Blind', icon: '🪟', color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200' },
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-3 py-2.5 border-b border-stone-50 last:border-0">
      <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide w-36 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-stone-700">{value}</span>
    </div>
  )
}

export default function PartDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [part,    setPart]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadPart() }, [id])

  async function loadPart() {
    const { data } = await supabase.from('parts').select('*').eq('id', id).single()
    setPart(data)
    setLoading(false)
  }

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><div className="card p-12 text-center text-stone-400">Loading...</div></div>
  if (!part)   return <div className="p-6 max-w-3xl mx-auto"><div className="card p-12 text-center text-stone-400">Part not found</div></div>

  const cfg = TYPE_CONFIG[part.part_type] || TYPE_CONFIG.component
  const isLow  = part.reorder_level && part.qty_on_hand > 0 && part.qty_on_hand <= part.reorder_level
  const isOut  = part.qty_on_hand <= 0

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/inventory')} className="btn-ghost text-sm">← Inventory</button>
      </div>

      {/* Hero */}
      <div className="card p-6 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                {cfg.icon} {cfg.label}
              </span>
              {isOut && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">OUT OF STOCK</span>}
              {isLow && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">LOW STOCK</span>}
              <span className="text-xs text-stone-400 border border-stone-200 px-2 py-0.5 rounded">Read Only</span>
            </div>
            <h2 className="text-xl font-display font-bold text-stone-800">{part.name}</h2>
            {part.description && <div className="text-sm text-stone-400 mt-0.5">{part.description}</div>}
          </div>

          {/* Stock display */}
          <div className={`ml-4 text-center px-6 py-4 rounded-xl border flex-shrink-0 ${
            isOut ? 'bg-red-50 border-red-200' : isLow ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200'
          }`}>
            <div className={`text-3xl font-display font-bold ${isOut ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-stone-800'}`}>
              {Number(part.qty_on_hand || 0).toLocaleString()}
            </div>
            <div className="text-xs text-stone-400 mt-0.5">{part.unit_of_measure || 'EA'} on hand</div>
            {part.reorder_level && (
              <div className="text-xs text-stone-400 mt-1">Reorder at {part.reorder_level}</div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-stone-100">
          <InfoRow label="Vendor"          value={part.vendor} />
          <InfoRow label="Vendor ID"       value={part.vendor_id} />
          <InfoRow label="Vendor Part"     value={part.vendor_part_name} />
          <InfoRow label="Legacy Stock ID" value={part.legacy_stock_id} />
          <InfoRow label="Unit"            value={part.unit_of_measure} />
          <InfoRow label="Last Updated"    value={part.updated_at ? new Date(part.updated_at).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : null} />
        </div>
      </div>

      {/* Physical count note */}
      <div className="card p-5 border-dashed bg-stone-50/50">
        <div className="flex items-start gap-3">
          <span className="text-xl">📋</span>
          <div>
            <div className="text-sm font-semibold text-stone-600 mb-1">Physical Count Pending</div>
            <div className="text-xs text-stone-400 leading-relaxed">
              Quantities will be updated after the physical inventory count.
              Inventory write functionality (receiving, adjustments) coming in Phase 5.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
