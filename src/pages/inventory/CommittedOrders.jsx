import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════
// Committed Orders Search — "which open orders are using this part?"
//
// Pick a part type (fabric / component / extrusion), search for the part by
// name, then see every open (unrelieved) order committing it: work order,
// qty + native UOM, status (Printed / Credit OK), and date.
//
// Reads v_committed_orders (per-order grain) + parts (for the search list).
// Inverse of the Reorder Queue's fabric-shortage panel: that says "what's
// short", this says "who's eating this part".
//
// Customer column exists in the view but isn't populated yet (ingestion
// doesn't persist it). Shown when present, omitted gracefully when null.
// ═══════════════════════════════════════════════════════════════════════

const PART_TYPES = [
  { value: 'fabric',    label: 'Fabric' },
  { value: 'component', label: 'Component' },
  { value: 'extrusion', label: 'Extrusion' },
]

export default function CommittedOrders() {
  const [partType, setPartType]   = useState('fabric')
  const [search, setSearch]       = useState('')
  const [matches, setMatches]     = useState([])     // parts matching the search
  const [searching, setSearching] = useState(false)
  const [searched, setSearched]   = useState(false)

  const [selectedPart, setSelectedPart] = useState(null)
  const [orders, setOrders]       = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Search parts of the chosen type by name
  async function runSearch(e) {
    e?.preventDefault()
    const term = search.trim()
    if (!term) return
    setSearching(true)
    setSearched(true)
    setSelectedPart(null)
    setOrders([])

    const { data, error } = await supabase
      .from('parts')
      .select('id, name, part_type, qty_on_hand, qty_committed, unit_of_measure')
      .eq('part_type', partType)
      .eq('active', true)
      .ilike('name', `%${term}%`)
      .order('name')
      .limit(25)

    if (error) {
      console.error('Part search error:', error)
      setMatches([])
    } else {
      setMatches(data || [])
      // If exactly one match, auto-select it — common case when you know the name
      if (data && data.length === 1) selectPart(data[0])
    }
    setSearching(false)
  }

  // Load the committed orders for a chosen part
  async function selectPart(part) {
    setSelectedPart(part)
    setOrdersLoading(true)
    const { data, error } = await supabase
      .from('v_committed_orders')
      .select('work_order, line_item, customer, qty, uom, order_status, date_ref')
      .eq('part_id', part.id)
      .order('order_status', { ascending: true })   // CREDIT OK before PRINTED alphabetically
      .order('qty', { ascending: false })
    if (error) {
      console.error('Committed orders load error:', error)
      setOrders([])
    } else {
      setOrders(data || [])
    }
    setOrdersLoading(false)
  }

  const totalCommitted = orders.reduce((sum, o) => sum + (Number(o.qty) || 0), 0)
  const anyCustomer = orders.some(o => o.customer)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-800">Committed Orders</h1>
        <p className="text-sm text-stone-500 mt-1">
          Find which open orders are committing a part. Pick a type, search the part, see the orders.
        </p>
      </div>

      {/* Search controls */}
      <form onSubmit={runSearch} className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Type picker */}
          <div className="flex rounded-lg border border-stone-200 overflow-hidden shrink-0">
            {PART_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => { setPartType(t.value); setMatches([]); setSelectedPart(null); setOrders([]); setSearched(false) }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  partType === t.value
                    ? 'bg-brand-dark text-white'
                    : 'bg-white text-stone-600 hover:bg-stone-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${partType} by name…`}
            className="flex-1 px-4 py-2 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark/30"
          />
          <button
            type="submit"
            disabled={searching || !search.trim()}
            className="px-5 py-2 rounded-lg bg-brand-dark text-white text-sm font-semibold hover:bg-brand-dark/90 disabled:opacity-50 shrink-0"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {/* Match list — shown when a search returned multiple parts and none selected */}
      {searched && !selectedPart && (
        <div className="card mb-6">
          {matches.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500">
              No active {partType} parts match “{search.trim()}”.
            </div>
          ) : (
            <>
              <div className="px-4 py-2 border-b border-stone-100 text-[11px] font-bold uppercase tracking-widest text-stone-400">
                {matches.length} match{matches.length !== 1 ? 'es' : ''} — pick one
              </div>
              {matches.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectPart(p)}
                  className="w-full text-left px-4 py-3 border-b border-stone-50 last:border-b-0 hover:bg-stone-50 transition-colors flex items-center justify-between"
                >
                  <span className="text-sm font-medium text-stone-800">{p.name}</span>
                  <span className="text-xs text-stone-400">
                    {Number(p.qty_on_hand || 0).toLocaleString()} {p.unit_of_measure} on hand
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Selected part + its committed orders */}
      {selectedPart && (
        <div className="card overflow-hidden">
          {/* Part header */}
          <div className="px-5 py-4 border-b border-stone-100 bg-stone-50/60 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-stone-800">{selectedPart.name}</p>
              <p className="text-xs text-stone-500 mt-0.5">
                {Number(selectedPart.qty_on_hand || 0).toLocaleString()} {selectedPart.unit_of_measure} on hand
                {' · '}
                {Number(selectedPart.qty_committed || 0).toLocaleString()} {selectedPart.unit_of_measure} committed
              </p>
            </div>
            <button
              onClick={() => { setSelectedPart(null); setOrders([]) }}
              className="text-xs text-stone-400 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100"
            >
              ← Back to results
            </button>
          </div>

          {ordersLoading ? (
            <div className="p-6 flex items-center gap-3 text-sm text-stone-500">
              <div className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin"></div>
              Loading committed orders…
            </div>
          ) : orders.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500">
              No open orders are currently committing this part.
            </div>
          ) : (
            <>
              {/* Summary row */}
              <div className="px-5 py-2 bg-stone-50/40 border-b border-stone-100 text-xs text-stone-600">
                <span className="font-semibold">{orders.length}</span> open order line{orders.length !== 1 ? 's' : ''}
                {' · '}
                <span className="font-semibold">{totalCommitted.toLocaleString(undefined, { maximumFractionDigits: 1 })} {orders[0]?.uom}</span> committed total
              </div>

              {/* Table header */}
              <div className="px-5 py-2 grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100">
                <div className="col-span-3">Order #</div>
                {anyCustomer && <div className="col-span-3">Customer</div>}
                <div className={anyCustomer ? 'col-span-2 text-right' : 'col-span-3 text-right'}>Qty</div>
                <div className="col-span-2">Status</div>
                <div className={anyCustomer ? 'col-span-2 text-right' : 'col-span-3 text-right'}>Date</div>
              </div>

              {/* Rows */}
              {orders.map((o, i) => (
                <div
                  key={`${o.work_order}-${o.line_item || ''}-${i}`}
                  className="px-5 py-3 grid grid-cols-12 gap-2 text-sm border-b border-stone-50 last:border-b-0 hover:bg-stone-50/40 transition-colors items-center"
                >
                  <div className="col-span-3 font-mono font-medium text-stone-800">{o.work_order}</div>
                  {anyCustomer && (
                    <div className="col-span-3 text-stone-600 truncate">{o.customer || '—'}</div>
                  )}
                  <div className={`${anyCustomer ? 'col-span-2' : 'col-span-3'} text-right font-mono tabular-nums text-stone-800`}>
                    {Number(o.qty).toLocaleString(undefined, { maximumFractionDigits: 1 })} {o.uom}
                  </div>
                  <div className="col-span-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      o.order_status === 'CREDIT OK'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-stone-200 text-stone-700'
                    }`}>
                      {o.order_status === 'CREDIT OK' ? 'Credit OK' : 'Printed'}
                    </span>
                  </div>
                  <div className={`${anyCustomer ? 'col-span-2' : 'col-span-3'} text-right text-xs text-stone-500 tabular-nums`}>
                    {o.date_ref ? new Date(o.date_ref).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
