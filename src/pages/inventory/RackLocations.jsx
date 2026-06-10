import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// ── Faux rack locations — reference snapshot from physical count ─────────────
// Reads part_locations (part_id → parts.name, warehouse, rack, qty, counted_on).
// Two views: BY SIZE (where does a size live?) and BY RACK (what's in a rack?).
// Quantities are AS OF THE COUNT DATE — reference only, not live on-hand.

const sizeOf = (name) => (name || '').split(' E02')[0].trim()

// sort sizes numerically by width then height ("12.5 X 72" → [12.5, 72])
function sizeKey(label) {
  const m = label.match(/([\d.]+)\s*X\s*([\d.]+)/i)
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [999, 999]
}

// sort racks naturally: aisle letter, bay number, level letter (F4c → F,4,c)
function rackKey(rack) {
  const m = (rack || '').match(/^([A-Za-z]+)(\d+)?([A-Za-z])?/)
  return m ? [m[1].toUpperCase(), parseInt(m[2] || '0', 10), (m[3] || '').toLowerCase()] : [rack, 0, '']
}

export default function RackLocations() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [view, setView]       = useState('size')   // 'size' | 'rack'
  const [search, setSearch]   = useState('')

  useEffect(() => { fetchLocations() }, [])

  async function fetchLocations() {
    setLoading(true)
    const { data, error } = await supabase
      .from('part_locations')
      .select('warehouse, rack, qty, counted_on, parts ( name )')
      .order('rack')
    if (error) { setError(error.message); setLoading(false); return }
    setRows((data || []).map(r => ({
      size:      sizeOf(r.parts?.name),
      warehouse: r.warehouse,
      rack:      r.rack,
      qty:       Number(r.qty) || 0,
      counted:   r.counted_on,
    })).filter(r => r.size))
    setLoading(false)
  }

  const countDate = rows[0]?.counted

  // group by size → [{size, total, locs:[{warehouse, rack, qty}]}]
  const bySize = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.size)) map.set(r.size, { size: r.size, total: 0, locs: [] })
      const g = map.get(r.size)
      g.total += r.qty
      g.locs.push(r)
    }
    const list = [...map.values()]
    list.forEach(g => g.locs.sort((a, b) => b.qty - a.qty))
    return list.sort((a, b) => {
      const [aw, ah] = sizeKey(a.size), [bw, bh] = sizeKey(b.size)
      return aw - bw || ah - bh
    })
  }, [rows])

  // group by rack → [{rack, total, sizes:[{size, qty}]}] (MAIN only — separate WH has no racks)
  const byRack = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (!r.rack) continue
      if (!map.has(r.rack)) map.set(r.rack, { rack: r.rack, total: 0, sizes: [] })
      const g = map.get(r.rack)
      g.total += r.qty
      g.sizes.push(r)
    }
    const list = [...map.values()]
    list.forEach(g => g.sizes.sort((a, b) => b.qty - a.qty))
    return list.sort((a, b) => {
      const [aa, an, al] = rackKey(a.rack), [ba, bn, bl] = rackKey(b.rack)
      return aa < ba ? -1 : aa > ba ? 1 : an - bn || (al < bl ? -1 : al > bl ? 1 : 0)
    })
  }, [rows])

  const [sel, setSel] = useState(null)   // {aisle, bay, level} selected map cell

  // ── Warehouse map structure ──────────────────────────────────────────
  // Rack codes encode position: E4b = rack E, bay 4, level b.
  // Levels per the building: c = top, b = middle, a = floor.
  // Racks run 1, E, F, G, H, I left→right; non-coded spots (WC, Back
  // Aisle, "1") render as standalone blocks.
  const AISLE_ORDER = ['E', 'F', 'G', 'H', 'I']
  const RACK_BAYS   = { E: 8, F: 8, G: 11, H: 9, I: 8 }   // physical bays per rack (from layout)
  const mapData = useMemo(() => {
    const aisles = new Map()   // aisle → { bays:Set, cells: Map("bay|lvl" → {qty, sizes[]}) , total }
    const misc   = new Map()   // label → { qty, sizes[] }
    for (const r of rows) {
      if (r.warehouse !== 'MAIN') continue
      const m = (r.rack || '').match(/^([A-Za-z])(\d+)([abc])$/)
      if (m && AISLE_ORDER.includes(m[1].toUpperCase())) {
        const aisle = m[1].toUpperCase(), bay = parseInt(m[2], 10), lvl = m[3].toLowerCase()
        if (!aisles.has(aisle)) aisles.set(aisle, { bays: new Set(), cells: new Map(), total: 0 })
        const A = aisles.get(aisle)
        A.bays.add(bay); A.total += r.qty
        const key = `${bay}|${lvl}`
        if (!A.cells.has(key)) A.cells.set(key, { qty: 0, sizes: [] })
        const c = A.cells.get(key)
        c.qty += r.qty; c.sizes.push(r)
      } else {
        const label = r.rack || 'No rack'
        if (!misc.has(label)) misc.set(label, { qty: 0, sizes: [] })
        const g = misc.get(label)
        g.qty += r.qty; g.sizes.push(r)
      }
    }
    aisles.forEach(A => { A.bayList = [...A.bays].sort((x, y) => x - y) })
    const maxCell = Math.max(1, ...[...aisles.values()].flatMap(A => [...A.cells.values()].map(c => c.qty)))
    return { aisles, misc, maxCell }
  }, [rows])

  const heat = (qty) =>
    qty === 0   ? 'bg-white text-stone-300'
    : qty < 40  ? 'bg-amber-50 text-amber-900'
    : qty < 90  ? 'bg-amber-100 text-amber-900'
    : qty < 160 ? 'bg-amber-200 text-amber-950'
    : qty < 280 ? 'bg-amber-300 text-amber-950'
    :             'bg-amber-400 text-amber-950'

  // cardboard "stack" fill — looks like boxes piling up in the slot
  const STACK_BG = 'repeating-linear-gradient(180deg,#d6ae74 0px,#d6ae74 7px,#c2945a 7px,#c2945a 8px)'
  const BEAM = '#2f8f74'      // teal beam color (matches the racking)
  const POST = '#e0561e'      // orange upright color

  const selCell = sel ? mapData.aisles.get(sel.aisle)?.cells.get(`${sel.bay}|${sel.level}`) : null
  const selMisc = sel?.misc ? mapData.misc.get(sel.misc) : null

  const q = search.trim().toUpperCase()
  const sizeList = q ? bySize.filter(g => g.size.includes(q)) : bySize
  const rackList = q ? byRack.filter(g => g.rack.toUpperCase().includes(q)) : byRack

  const totals = useMemo(() => ({
    pieces: rows.reduce((s, r) => s + r.qty, 0),
    main:   rows.filter(r => r.warehouse === 'MAIN').reduce((s, r) => s + r.qty, 0),
    whA:    rows.filter(r => r.warehouse === 'A').reduce((s, r) => s + r.qty, 0),
    whB:    rows.filter(r => r.warehouse === 'B').reduce((s, r) => s + r.qty, 0),
    racks:  new Set(rows.filter(r => r.rack).map(r => r.rack)).size,
    sizes:  new Set(rows.map(r => r.size)).size,
  }), [rows])

  if (loading) return <div className="p-8 text-stone-400 text-sm">Loading locations…</div>
  if (error)   return <div className="p-8 text-red-600 text-sm">Error loading locations: {error}</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <h1 className="font-display font-bold text-2xl text-stone-800">Faux Rack Locations</h1>
        <span className="text-xs text-stone-400">
          Snapshot from physical count{countDate ? ` · ${countDate}` : ''} — reference only, not live on-hand
        </span>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap gap-2 my-4">
        {[
          [totals.sizes,  'sizes'],
          [totals.racks,  'racks'],
          [totals.main.toLocaleString(),   'pcs · main WH'],
          [totals.whA.toLocaleString(),    'pcs · warehouse A'],
          [totals.whB.toLocaleString(),    'pcs · warehouse B (est.)'],
          [totals.pieces.toLocaleString(), 'pcs · total'],
        ].map(([v, l]) => (
          <div key={l} className="bg-white border border-stone-200 rounded-xl px-4 py-2">
            <span className="font-display font-bold text-stone-800 text-lg">{v}</span>
            <span className="text-xs text-stone-400 ml-2">{l}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex rounded-xl border border-stone-200 overflow-hidden">
          {[['size', 'By Size'], ['rack', 'By Rack'], ['map', 'Map']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                view === v ? 'bg-brand-dark text-white' : 'bg-white text-stone-500 hover:bg-stone-50'
              }`}>
              {l}
            </button>
          ))}
        </div>
        <input
          className="input flex-1 min-w-[200px] max-w-xs"
          placeholder={view === 'size' ? 'Search size… e.g. 36 X 84' : 'Search rack… e.g. G10'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-stone-400 hover:text-stone-600 text-sm">Clear</button>
        )}
      </div>

      {/* BY SIZE */}
      {view === 'size' && (
        <div className="grid gap-2">
          {sizeList.map(g => (
            <div key={g.size} className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="w-28 shrink-0">
                <div className="font-display font-bold text-stone-800">{g.size}</div>
                <div className="text-xs text-stone-400">{g.total.toLocaleString()} pcs</div>
              </div>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {g.locs.map((l, i) => (
                  <button key={i} type="button"
                    onClick={() => { if (l.warehouse === 'MAIN' && l.rack) { setView('rack'); setSearch(l.rack) } }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      l.warehouse === 'A' ? 'bg-violet-50 text-violet-700 border-violet-200 cursor-default'
                      : l.warehouse === 'B' ? 'bg-amber-50 text-amber-700 border-amber-200 cursor-default'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    }`}
                    title={l.warehouse === 'B' ? 'Estimated from ePIC — warehouse B not physically counted' : undefined}>
                    {l.warehouse === 'A' ? 'Warehouse A'
                      : l.warehouse === 'B' ? 'Warehouse B (est.)'
                      : l.rack || 'no rack'} · {l.qty.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {sizeList.length === 0 && <div className="text-stone-400 text-sm p-6">No sizes match "{search}"</div>}
        </div>
      )}

      {/* BY RACK */}
      {view === 'rack' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {rackList.map(g => (
            <div key={g.rack} className="bg-white border border-stone-200 rounded-xl px-4 py-3">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-display font-bold text-stone-800 text-lg">{g.rack}</span>
                <span className="text-xs text-stone-400">{g.total.toLocaleString()} pcs · {g.sizes.length} size{g.sizes.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.sizes.map((s, i) => (
                  <button key={i} type="button"
                    onClick={() => { setView('size'); setSearch(s.size) }}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-50 text-stone-600 border border-stone-200 hover:bg-stone-100 transition-colors">
                    {s.size} · {s.qty.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {rackList.length === 0 && <div className="text-stone-400 text-sm p-6">No racks match "{search}"</div>}
        </div>
      )}

      {/* MAP — warehouse layout: racks 1,E,F,G,H,I; levels c top / b mid / a floor */}
      {view === 'map' && (
        <div className="space-y-6">
          {AISLE_ORDER.filter(a => mapData.aisles.has(a)).map(aisle => {
            const A = mapData.aisles.get(aisle)
            return (
              <div key={aisle} className="bg-white border border-stone-200 rounded-xl p-4 overflow-x-auto">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-display font-bold text-stone-800 text-lg">Rack {aisle}</span>
                  <span className="text-xs text-stone-400">{A.total.toLocaleString()} pcs</span>
                </div>
                {(() => {
                  const maxBay = Math.max(RACK_BAYS[aisle] || 0, ...A.bayList)
                  const bays = Array.from({ length: maxBay }, (_, i) => i + 1)
                  const Post = () => <div className="self-stretch rounded-[1px]" style={{ width: 7, background: POST }} />
                  return (
                    <div className="inline-block">
                      {['c', 'b', 'a'].map(lvl => (
                        <div key={lvl} className="flex">
                          <div className="w-16 flex items-end justify-end pr-2 pb-1 text-[10px] text-stone-400 whitespace-nowrap">
                            {lvl === 'c' ? 'top · c' : lvl === 'b' ? 'mid · b' : 'floor · a'}
                          </div>
                          <div className="flex flex-col">
                            {/* level shelf contents framed by uprights */}
                            <div className="flex items-stretch">
                              <Post />
                              {bays.map(b => {
                                const cell = A.cells.get(`${b}|${lvl}`)
                                const qty = cell?.qty || 0
                                const fill = Math.max(qty > 0 ? 12 : 0, Math.min(100, (qty / mapData.maxCell) * 100))
                                const active = sel && !sel.misc && sel.aisle === aisle && sel.bay === b && sel.level === lvl
                                return (
                                  <div key={b} className="flex items-stretch">
                                    <button type="button"
                                      title={`${aisle}${b}${lvl}${qty ? ` · ${qty} pcs` : ' · empty'}`}
                                      onClick={() => setSel(active ? null : { aisle, bay: b, level: lvl })}
                                      className={`relative w-16 h-14 bg-stone-50 overflow-hidden transition-all ${
                                        active ? 'ring-2 ring-inset ring-stone-800' : 'hover:bg-stone-100'
                                      }`}>
                                      {qty > 0 && (
                                        <span className="absolute inset-x-0 bottom-0 border-t border-[#a87c44]"
                                              style={{ height: `${fill}%`, background: STACK_BG }} />
                                      )}
                                      <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold ${
                                        qty > 0 ? 'text-stone-800' : 'text-stone-300'
                                      }`} style={qty > 0 ? { textShadow: '0 1px 2px rgba(255,255,255,0.8)' } : undefined}>
                                        {qty > 0 ? qty.toLocaleString() : ''}
                                      </span>
                                    </button>
                                    <Post />
                                  </div>
                                )
                              })}
                            </div>
                            {/* teal beam under this level */}
                            <div className="rounded-[1px]" style={{ height: 6, background: BEAM }} />
                          </div>
                        </div>
                      ))}
                      {/* concrete floor + bay labels */}
                      <div className="flex">
                        <div className="w-16" />
                        <div className="flex flex-col" style={{ width: bays.length * 64 + (bays.length + 1) * 7 }}>
                          <div className="h-1.5 w-full bg-stone-300 rounded-b-sm" />
                          <div className="flex">
                            <div style={{ width: 7 }} />
                            {bays.map(b => (
                              <div key={b} className="flex">
                                <div className="w-16 text-center text-[10px] text-stone-400 pt-1 font-medium">{aisle}{b}</div>
                                <div style={{ width: 7 }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })}

          {/* Non-grid locations: Rack 1, WC, Back Aisle, etc. */}
          {mapData.misc.size > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="font-display font-bold text-stone-800 text-lg mb-3">Other locations</div>
              <div className="flex flex-wrap gap-2">
                {[...mapData.misc.entries()].sort((a, b) => b[1].qty - a[1].qty).map(([label, g]) => {
                  const active = sel?.misc === label
                  return (
                    <button key={label} type="button"
                      onClick={() => setSel(active ? null : { misc: label })}
                      className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${heat(g.qty)} ${
                        active ? 'border-stone-800 ring-1 ring-stone-800' : 'border-stone-200 hover:border-stone-400'
                      }`}>
                      {label} · {g.qty.toLocaleString()}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Selected cell contents */}
          {(selCell || selMisc) && (
            <div className="bg-white border-2 border-stone-800 rounded-xl p-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-display font-bold text-stone-800">
                  {sel.misc ? sel.misc : `${sel.aisle}${sel.bay}${sel.level}`}
                </span>
                <span className="text-xs text-stone-400">
                  {(selCell || selMisc).qty.toLocaleString()} pcs · {(selCell || selMisc).sizes.length} size{(selCell || selMisc).sizes.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(selCell || selMisc).sizes.sort((a, b) => b.qty - a.qty).map((s, i) => (
                  <button key={i} type="button"
                    onClick={() => { setView('size'); setSearch(s.size) }}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-50 text-stone-600 border border-stone-200 hover:bg-stone-100 transition-colors">
                    {s.size} · {s.qty.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
