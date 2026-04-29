import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STATUS_STYLES = {
  draft:      'bg-stone-100 text-stone-600',
  submitted:  'bg-blue-50 text-blue-700',
  exported:   'bg-amber-50 text-amber-700',
  received:   'bg-green-50 text-green-700',
  cancelled:  'bg-red-50 text-red-500',
}

export default function PurchaseOrders() {
  const navigate = useNavigate()
  const [pos, setPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [queueCount, setQueueCount] = useState(0)
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: orders }, { count }] = await Promise.all([
      supabase.from('purchase_orders').select('*, purchase_order_items(id)').order('created_at', { ascending: false }),
      supabase.from('reorder_queue').select('*', { count: 'exact', head: true })
    ])
    setPOs(orders || [])
    setQueueCount(count || 0)
    setLoading(false)
  }

  const filtered = filter === 'all' ? pos : pos.filter(p => p.status === filter)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Purchase Orders</h1>
          <p className="text-sm text-stone-500 mt-0.5">{pos.length} total orders</p>
        </div>
        <div className="flex items-center gap-3">
          {queueCount > 0 && (
            <button
              onClick={() => navigate('/purchasing/queue')}
              className="flex items-center gap-2 text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded hover:bg-amber-100 transition-colors"
            >
              <span className="w-5 h-5 bg-amber-500 text-white rounded-full text-xs flex items-center justify-center font-bold">{queueCount}</span>
              Reorder Queue
            </button>
          )}
          {queueCount === 0 && (
            <button onClick={() => navigate('/purchasing/queue')} className="text-sm text-stone-500 hover:text-stone-800 transition-colors border border-stone-200 px-3 py-1.5 rounded">
              Reorder Queue
            </button>
          )}
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-5">
        {['all', 'draft', 'submitted', 'exported', 'received', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors capitalize ${
              filter === s ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-stone-400 py-8 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-stone-400 text-sm">No purchase orders yet.</p>
          <p className="text-stone-400 text-xs mt-1">Add items to the reorder queue and create a PO from there.</p>
          <button onClick={() => navigate('/purchasing/queue')} className="mt-4 text-sm font-semibold text-brand-dark hover:underline">
            Go to Reorder Queue →
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold tracking-[0.1em] text-stone-400 uppercase border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3">PO Number</th>
                <th className="text-left px-5 py-3">Vendor</th>
                <th className="text-center px-5 py-3">Lines</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">ePIC PO</th>
                <th className="text-left px-5 py-3">Created</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(po => (
                <tr
                  key={po.id}
                  onClick={() => navigate(`/purchasing/po/${po.id}`)}
                  className="border-b border-stone-50 hover:bg-stone-50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3 font-mono font-semibold text-brand-dark text-xs">{po.wrangl_po_number}</td>
                  <td className="px-5 py-3 text-stone-800 font-medium">{po.vendor_name}</td>
                  <td className="px-5 py-3 text-center text-stone-500">{po.purchase_order_items?.length || 0}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_STYLES[po.status]}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-stone-400 text-xs font-mono">{po.epic_po_number || '—'}</td>
                  <td className="px-5 py-3 text-stone-400 text-xs">{new Date(po.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right text-stone-400 text-xs">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
