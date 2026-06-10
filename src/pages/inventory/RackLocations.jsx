import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// ── Faux rack locations — reference snapshot from physical count ─────────────
// Two views: BY SIZE (where does a size live?) and MAP (the warehouse itself).
// Clicking any bay on the map opens what's inside it. Quantities are AS OF THE
// COUNT DATE — reference only, not live on-hand.

const sizeOf = (name) => (name || '').split(' E02')[0].trim()

function sizeKey(label) {
  const m = label.match(/([\d.]+)\s*X\s*([\d.]+)/i)
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [999, 999]
}

// Wrangl theme tokens (match sidebar / layout)
const INK    = '#2e2014'
const GOLD   = '#c89860'
const BORDER = 'rgba(92,67,42,0.14)'
const POST   = '#e0561e'   // orange upright
const BEAM   = '#2f8f74'   // teal beam
const STACK_BG = 'repeating-linear-gradient(180deg,#d6ae74 0px,#d6ae74 7px,#c2945a 7px,#c2945a 8px)'

const AISLE_ORDER = ['E', 'F', 'G', 'H', 'I']
const RACK_BAYS   = { E: 8, F: 8, G: 11, H: 9, I: 8 }   // physical bays per rack

export default function RackLocations() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [view, setView]       = useState('size')   // 'size' | 'map'
  const [search, setSearch]   = useState('')
  const [sel, setSel]         = useState(null)     // {aisle,bay,level} | {misc:label}

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

  const mapData = useMemo(() => {
    const aisles = new Map()
    const misc   = new Map()
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
    return { aisles, misc }
  }, [rows])

  // jump from a size's rack chip to that bay on the map
  function gotoLocation(rack) {
    const m = (rack || '').match(/^([A-Za-z])(\d+)([abc])$/)
    if (m && AISLE_ORDER.includes(m[1].toUpperCase())) {
      setSel({ aisle: m[1].toUpperCase(), bay: parseInt(m[2], 10), level: m[3].toLowerCase() })
    } else if (rack) {
      setSel({ misc: rack })
    }
    setView('map')
  }

  const selCell = sel && !sel.misc ? mapData.aisles.get(sel.aisle)?.cells.get(`${sel.bay}|${sel.level}`) : null
  const selMisc = sel?.misc ? mapData.misc.get(sel.misc) : null

  const q = search.trim().toUpperCase()
  const sizeList = q ? bySize.filter(g => g.size.includes(q)) : bySize

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

  const chipStyle = (wh) =>
    wh === 'A'
      ? { background: '#ece4d3', border: `1px solid ${BORDER}`, color: '#5c432a' }
      : wh === 'B'
      ? { background: '#faf7f0', border: '1px dashed #c9a16b', color: '#8c7758' }
      : { background: '#f5e7cd', border: '1px solid #c9a16b', color: '#5c432a' }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <h1 className="font-display font-bold text-2xl" style={{ color: INK }}>Faux Rack Locations</h1>
        <span className="text-xs" style={{ color: '#8c7758' }}>
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
          <div key={l} className="bg-white rounded-xl px-4 py-2" style={{ border: `1px solid ${BORDER}` }}>
            <span className="font-display font-bold text-lg" style={{ color: INK }}>{v}</span>
            <span className="text-xs ml-2" style={{ color: '#8c7758' }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          {[['size', 'By Size'], ['map', 'Map']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-2 text-sm font-semibold transition-colors"
              style={view === v
                ? { background: INK, color: '#f7f0e0' }
                : { background: '#fff', color: '#8c7758' }}>
              {l}
            </button>
          ))}
        </div>
        {view === 'size' && (
          <>
            <input
              className="input flex-1 min-w-[200px] max-w-xs"
              placeholder="Search size… e.g. 36 X 84"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-sm" style={{ color: '#8c7758' }}>Clear</button>
            )}
          </>
        )}
      </div>

      {/* BY SIZE */}
      {view === 'size' && (
        <div className="grid gap-2">
          {sizeList.map(g => (
            <div key={g.size} className="bg-white rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2"
                 style={{ border: `1px solid ${BORDER}` }}>
              <div className="w-28 shrink-0">
                <div className="font-display font-bold text-lg leading-tight" style={{ color: INK }}>
                  {g.size.replace(' X ', ' × ')}
                </div>
                <div className="text-xs" style={{ color: GOLD }}>{g.total.toLocaleString()} pcs</div>
              </div>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {g.locs.map((l, i) => (
                  <button key={i} type="button"
                    onClick={() => { if (l.warehouse === 'MAIN' && l.rack) gotoLocation(l.rack) }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-opacity ${
                      l.warehouse === 'MAIN' && l.rack ? 'hover:opacity-75' : 'cursor-default'
                    }`}
                    style={chipStyle(l.warehouse)}
                    title={l.warehouse === 'B' ? 'Estimated from ePIC — warehouse B not physically counted' : undefined}>
                    {l.warehouse === 'A' ? 'Warehouse A'
                      : l.warehouse === 'B' ? 'Warehouse B (est.)'
                      : l.rack || 'no rack'} · {l.qty.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {sizeList.length === 0 && <div className="text-sm p-6" style={{ color: '#8c7758' }}>No sizes match "{search}"</div>}
        </div>
      )}

      {/* MAP */}
      {view === 'map' && (
        <div className="space-y-6">
          {AISLE_ORDER.filter(a => mapData.aisles.has(a)).map(aisle => {
            const A = mapData.aisles.get(aisle)
            const maxBay = Math.max(RACK_BAYS[aisle] || 0, ...A.bayList)
            const bays = Array.from({ length: maxBay }, (_, i) => i + 1)
            const Post = () => <div className="self-stretch rounded-[1px]" style={{ width: 7, background: POST }} />
            return (
              <div key={aisle} className="bg-white rounded-xl p-4 overflow-x-auto" style={{ border: `1px solid ${BORDER}` }}>
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-display font-bold text-lg" style={{ color: INK }}>Rack {aisle}</span>
                  <span className="text-xs" style={{ color: '#8c7758' }}>{A.total.toLocaleString()} pcs</span>
                </div>
                <div className="inline-block">
                  {['c', 'b', 'a'].map(lvl => (
                    <div key={lvl} className="flex">
                      <div className="w-16 flex items-end justify-end pr-2 pb-1 text-[10px] whitespace-nowrap" style={{ color: '#8c7758' }}>
                        {lvl === 'c' ? 'top · c' : lvl === 'b' ? 'mid · b' : 'floor · a'}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-stretch">
                          <Post />
                          {bays.map(b => {
                            const cell = A.cells.get(`${b}|${lvl}`)
                            const qty = cell?.qty || 0
                            const active = sel && !sel.misc && sel.aisle === aisle && sel.bay === b && sel.level === lvl
                            const sizesDesc = (cell?.sizes || []).slice().sort((x, y) => y.qty - x.qty)
                            const shown = sizesDesc.slice(0, 3)
                            const extra = sizesDesc.length - shown.length
                            return (
                              <div key={b} className="flex items-stretch">
                                <button type="button"
                                  title={`${aisle}${b}${lvl}${qty ? ` · ${qty} pcs · ${sizesDesc.length} size${sizesDesc.length !== 1 ? 's' : ''}` : ' · empty'}`}
                                  onClick={() => setSel(active ? null : { aisle, bay: b, level: lvl })}
                                  className={`relative w-28 h-[5.5rem] overflow-hidden transition-all flex flex-col justify-end p-0.5 gap-0.5 ${
                                    active ? 'ring-2 ring-inset' : ''
                                  }`}
                                  style={{
                                    background: active ? '#fbf6ec' : '#faf8f4',
                                    ...(active ? { '--tw-ring-color': INK } : {}),
                                  }}>
                                  {qty > 0 && (
                                    <span className="absolute top-0.5 right-1 text-[9px] font-bold" style={{ color: '#a89a82' }}>
                                      {qty.toLocaleString()}{extra > 0 ? ` · +${extra}` : ''}
                                    </span>
                                  )}
                                  {shown.slice().reverse().map((s, i) => (
                                    <span key={i}
                                      className="w-full rounded-[2px] px-1 py-[1px] text-[9px] font-semibold text-left leading-tight truncate"
                                      style={{ background: STACK_BG, border: '1px solid #a87c44', color: '#3d2c18' }}>
                                      {s.size.replace(' X ', 'x')} · {s.qty.toLocaleString()}
                                    </span>
                                  ))}
                                </button>
                                <Post />
                              </div>
                            )
                          })}
                        </div>
                        <div className="rounded-[1px]" style={{ height: 6, background: BEAM }} />
                      </div>
                    </div>
                  ))}
                  <div className="flex">
                    <div className="w-16" />
                    <div className="flex flex-col" style={{ width: bays.length * 112 + (bays.length + 1) * 7 }}>
                      <div className="h-1.5 w-full rounded-b-sm" style={{ background: '#cfc6b6' }} />
                      <div className="flex">
                        <div style={{ width: 7 }} />
                        {bays.map(b => (
                          <div key={b} className="flex">
                            <div className="w-28 text-center text-[10px] pt-1 font-medium" style={{ color: '#8c7758' }}>{aisle}{b}</div>
                            <div style={{ width: 7 }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Non-grid locations */}
          {mapData.misc.size > 0 && (
            <div className="bg-white rounded-xl p-4" style={{ border: `1px solid ${BORDER}` }}>
              <div className="font-display font-bold text-lg mb-3" style={{ color: INK }}>Other locations</div>
              <div className="flex flex-wrap gap-2">
                {[...mapData.misc.entries()].sort((a, b) => b[1].qty - a[1].qty).map(([label, g]) => {
                  const active = sel?.misc === label
                  return (
                    <button key={label} type="button"
                      onClick={() => setSel(active ? null : { misc: label })}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${active ? 'ring-2' : 'hover:opacity-75'}`}
                      style={{ ...chipStyle('MAIN'), ...(active ? { '--tw-ring-color': INK } : {}) }}>
                      {label} · {g.qty.toLocaleString()}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Selected bay contents */}
          {(selCell || selMisc) && (
            <div className="bg-white rounded-xl p-4" style={{ border: `2px solid ${INK}` }}>
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-display font-bold text-lg" style={{ color: INK }}>
                  {sel.misc ? sel.misc : `${sel.aisle}${sel.bay}${sel.level}`}
                </span>
                <span className="text-xs" style={{ color: '#8c7758' }}>
                  {(selCell || selMisc).qty.toLocaleString()} pcs · {(selCell || selMisc).sizes.length} size{(selCell || selMisc).sizes.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(selCell || selMisc).sizes.slice().sort((a, b) => b.qty - a.qty).map((s, i) => (
                  <button key={i} type="button"
                    onClick={() => { setView('size'); setSearch(s.size) }}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-75"
                    style={chipStyle('MAIN')}>
                    {s.size.replace(' X ', ' × ')} · {s.qty.toLocaleString()}
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
