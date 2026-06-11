import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// ── Timber Inventory — older overflow blinds, manually tracked ──────────────
// These are legacy blinds used when E02 stock runs out. Quantities are edited
// by hand here (no ePIC feed). Each row also shows the matching E02 size's
// available stock, and flags sizes where E02 is low but Timber can cover.

const INK    = '#2e2014'
const GOLD   = '#c89860'
const BORDER = 'rgba(92,67,42,0.14)'
const LOW_THRESHOLD = 25   // E02 available at/below this = "low"

function sizeKey(label) {
  const m = (label || '').match(/([\d.]+)\s*X\s*([\d.]+)/i)
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [999, 999]
}

export default function TimberInventory() {
  const [rows, setRows]       = useState([])
  const [blinds, setBlinds]   = useState({})    // size_label → available (on_hand - committed)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [edits, setEdits]     = useState({})    // id → draft qty string
  const [saving, setSaving]   = useState({})    // id → bool

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [timberRes, blindRes] = await Promise.all([
      supabase.from('timber_inventory').select('*').order('size_label'),
      supabase.from('parts')
        .select('name, qty_on_hand, qty_committed')
        .eq('part_type', 'blind').eq('active', true),
    ])
    if (timberRes.error) { setError(timberRes.error.message); setLoading(false); return }
    const blindMap = {}
    for (const p of (blindRes.data || [])) {
      const size = (p.name || '').split(' E02')[0].trim().toUpperCase()
      blindMap[size] = (Number(p.qty_on_hand) || 0) - (Number(p.qty_committed) || 0)
    }
    setBlinds(blindMap)
    setRows((timberRes.data || []).sort((a, b) => {
      const [aw, ah] = sizeKey(a.size_label), [bw, bh] = sizeKey(b.size_label)
      return aw - bw || ah - bh
    }))
    setLoading(false)
  }

  async function saveQty(row) {
    const draft = edits[row.id]
    if (draft === undefined) return
    const qty = Math.max(0, parseInt(draft, 10) || 0)
    setSaving(s => ({ ...s, [row.id]: true }))
    const { error } = await supabase
      .from('timber_inventory')
      .update({ qty, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (!error) {
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, qty, updated_at: new Date().toISOString() } : r))
      setEdits(e => { const n = { ...e }; delete n[row.id]; return n })
    } else {
      setError(error.message)
    }
    setSaving(s => ({ ...s, [row.id]: false }))
  }

  const totals = useMemo(() => ({
    pieces: rows.reduce((s, r) => s + (Number(r.qty) || 0), 0),
    sizes:  rows.length,
    cover:  rows.filter(r => (Number(r.qty) || 0) > 0 && (blinds[r.size_label] ?? Infinity) <= LOW_THRESHOLD).length,
  }), [rows, blinds])

  if (loading) return <div className="p-8 text-stone-400 text-sm">Loading timber inventory…</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <h1 className="font-display font-bold text-2xl" style={{ color: INK }}>Timber Inventory</h1>
        <Link to="/inventory/faux-blinds" className="text-xs hover:underline" style={{ color: GOLD }}>
          ← Faux Blinds
        </Link>
      </div>
      <p className="text-xs mb-4" style={{ color: '#8c7758' }}>
        Older overflow blinds — used when E02 stock runs out. Quantities are tracked manually: edit and save below.
      </p>

      {/* Summary strip */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          [totals.sizes, 'sizes'],
          [totals.pieces.toLocaleString(), 'pcs · timber'],
          [totals.cover, 'sizes covering low E02'],
        ].map(([v, l]) => (
          <div key={l} className="bg-white rounded-xl px-4 py-2" style={{ border: `1px solid ${BORDER}` }}>
            <span className="font-display font-bold text-lg" style={{ color: INK }}>{v}</span>
            <span className="text-xs ml-2" style={{ color: '#8c7758' }}>{l}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 text-[10px] uppercase tracking-wide font-semibold"
             style={{ color: '#8c7758', borderBottom: `1px solid ${BORDER}`, background: '#faf8f4' }}>
          <span>Size</span>
          <span className="text-right w-24">E02 available</span>
          <span className="text-right w-28">Timber qty</span>
          <span className="w-16" />
        </div>
        {rows.map(r => {
          const avail   = blinds[r.size_label]
          const lowE02  = avail !== undefined && avail <= LOW_THRESHOLD
          const covers  = lowE02 && (Number(r.qty) || 0) > 0
          const draft   = edits[r.id]
          const dirty   = draft !== undefined && String(draft) !== String(r.qty)
          return (
            <div key={r.id}
                 className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-4 py-2.5"
                 style={{ borderBottom: `1px solid ${BORDER}`, background: covers ? '#fdf6e9' : '#fff' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display font-bold" style={{ color: INK }}>
                  {r.size_label.replace(' X ', ' × ')}
                </span>
                {covers && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: '#f5e7cd', border: '1px solid #c9a16b', color: '#5c432a' }}>
                    E02 low — use timber
                  </span>
                )}
              </div>
              <span className="text-right w-24 text-sm tabular-nums"
                    style={{ color: lowE02 ? '#b3503e' : '#5c432a', fontWeight: lowE02 ? 700 : 400 }}>
                {avail === undefined ? '—' : avail.toLocaleString()}
              </span>
              <input
                className="w-28 text-right text-sm tabular-nums rounded-lg px-2 py-1"
                style={{ border: `1px solid ${dirty ? GOLD : BORDER}`, background: '#fffdf9', color: INK }}
                type="number" min="0"
                value={draft !== undefined ? draft : r.qty}
                onChange={e => setEdits(ed => ({ ...ed, [r.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') saveQty(r) }}
              />
              <div className="w-16 text-right">
                {dirty && (
                  <button onClick={() => saveQty(r)} disabled={saving[r.id]}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                          style={{ background: INK, color: '#f7f0e0' }}>
                    {saving[r.id] ? '…' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] mt-3" style={{ color: '#a89a82' }}>
        "E02 available" = on-hand minus committed for the matching size. Rows highlight when E02 is at or below {LOW_THRESHOLD} and timber stock can cover.
      </p>
    </div>
  )
}
