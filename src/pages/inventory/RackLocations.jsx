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
          {[['size', 'By Size'], ['rack', 'By Rack']].map(([v, l]) => (
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
    </div>
  )
}
