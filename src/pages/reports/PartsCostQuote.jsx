import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const TABS = [
  { key: 'component', label: 'Components' },
  { key: 'extrusion', label: 'Extrusions' },
  { key: 'fabric',    label: 'Fabrics'    },
]

const usd = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n))

// Fabric is bought/quoted by the roll: 1 roll = 33 yd = 1188". unit_cost is per-inch.
const ROLL_INCHES = 1188
const rollCost = (unitCostPerInch) => (unitCostPerInch == null ? null : unitCostPerInch * ROLL_INCHES)

export default function PartsCostQuote() {
  const { profile } = useAuth()
  const role = profile?.role
  const canUse = role === 'owner' || role === 'executive'

  const [tab, setTab]         = useState('component')
  const [parts, setParts]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  // Worksheet: array of { part_id, name, vendor, unit_cost, unit_of_measure, qty }
  const [lines, setLines]     = useState([])
  const [quoteName, setQuoteName] = useState('')
  const [quoteCustomer, setQuoteCustomer] = useState('')
  const [currentId, setCurrentId] = useState(null)   // loaded quote id, or null for new
  const [saved, setSaved]     = useState([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [savedOpen, setSavedOpen] = useState(false)

  useEffect(() => { if (canUse) { loadParts(); loadSaved() } else { setLoading(false) } }, [canUse])

  async function loadParts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('parts')
      .select('id, name, vendor, unit_cost, unit_of_measure, part_type, pricing_flagged, pricing_flag_note')
      .in('part_type', ['component', 'extrusion', 'fabric'])
      .eq('active', true)
      .order('name')
    if (error) { setError(error.message); setLoading(false); return }
    setParts(data || [])
    setLoading(false)
  }

  async function loadSaved() {
    const { data } = await supabase
      .from('quote_worksheets')
      .select('id, name, customer, total_cost, updated_at')
      .order('updated_at', { ascending: false })
    setSaved(data || [])
  }

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim()
    return parts
      .filter(p => p.part_type === tab)
      .filter(p => !q || p.name?.toLowerCase().includes(q) || p.vendor?.toLowerCase().includes(q))
  }, [parts, tab, search])

  const addLine = useCallback((p) => {
    setLines(prev => {
      const existing = prev.find(l => l.part_id === p.id)
      if (existing) return prev.map(l => l.part_id === p.id ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, {
        part_id: p.id, name: p.name, vendor: p.vendor,
        unit_cost: p.unit_cost == null ? null : Number(p.unit_cost),
        unit_of_measure: p.unit_of_measure || (p.part_type === 'fabric' ? 'in' : 'ea'),
        part_type: p.part_type,
        qty: 1,
      }]
    })
  }, [])

  const setQty = (partId, qty) => setLines(prev => prev.map(l => l.part_id === partId ? { ...l, qty } : l))
  const removeLine = (partId) => setLines(prev => prev.filter(l => l.part_id !== partId))

  const lineCostOf = (l) => {
    if (l.unit_cost == null) return null
    const qty = Number(l.qty) || 0
    return l.part_type === 'fabric'
      ? rollCost(l.unit_cost) * qty   // qty = rolls
      : l.unit_cost * qty             // qty = pieces
  }
  const total = useMemo(
    () => lines.reduce((s, l) => { const c = lineCostOf(l); return s + (c || 0) }, 0),
    [lines]
  )
  const hasMissingCost = lines.some(l => l.unit_cost == null)

  function newQuote() {
    setLines([]); setQuoteName(''); setQuoteCustomer(''); setCurrentId(null); setError('')
  }

  async function saveQuote() {
    if (!quoteName.trim()) { setError('Give the quote a name before saving.'); return }
    if (lines.length === 0) { setError('Add at least one part before saving.'); return }
    setSaving(true); setError('')
    const payload = {
      name: quoteName.trim(),
      customer: quoteCustomer.trim() || null,
      line_items: lines,
      total_cost: Math.round(total * 100) / 100,
      created_by: profile?.id || null,
      updated_at: new Date().toISOString(),
    }
    let res
    if (currentId) {
      res = await supabase.from('quote_worksheets').update(payload).eq('id', currentId).select('id').single()
    } else {
      res = await supabase.from('quote_worksheets').insert(payload).select('id').single()
    }
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    setCurrentId(res.data.id)
    loadSaved()
  }

  async function loadQuote(id) {
    const { data, error } = await supabase.from('quote_worksheets').select('*').eq('id', id).single()
    if (error) { setError(error.message); return }
    setCurrentId(data.id)
    setQuoteName(data.name || '')
    setQuoteCustomer(data.customer || '')
    setLines(Array.isArray(data.line_items) ? data.line_items : [])
    setSavedOpen(false)
    setError('')
  }

  async function deleteQuote(id, e) {
    e.stopPropagation()
    if (!confirm('Delete this saved quote?')) return
    await supabase.from('quote_worksheets').delete().eq('id', id)
    if (id === currentId) newQuote()
    loadSaved()
  }

  if (!canUse) {
    return (
      <div className="min-h-screen bg-surface-page">
        <div className="max-w-screen-xl mx-auto p-6">
          <h1 className="font-display font-bold text-ink-strong text-xl mb-2">Parts Cost Quote</h1>
          <p className="text-sm text-ink-mid">This tool is limited to owner/executive accounts.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-page">
      <div className="max-w-screen-xl mx-auto p-3 md:p-4 pb-12">

        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <h1 className="font-display font-bold text-ink-strong text-xl md:text-2xl">Parts Cost Quote</h1>
            <p className="text-xs text-ink-muted mt-0.5">What parts cost us — build a worksheet to price a job. Costs shown are our cost, not customer price.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setSavedOpen(o => !o)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-ink-mid hover:border-stone-300">
                Saved quotes ({saved.length}) ▾
              </button>
              {savedOpen && (
                <div className="absolute right-0 mt-1 w-72 max-h-80 overflow-y-auto bg-white ring-1 ring-stone-200 rounded-lg shadow-lg z-10 p-1">
                  {saved.length === 0 ? (
                    <p className="text-xs text-ink-muted p-3">No saved quotes yet.</p>
                  ) : saved.map(q => (
                    <div key={q.id} onClick={() => loadQuote(q.id)}
                      className="flex items-center justify-between gap-2 px-2.5 py-2 rounded hover:bg-stone-50 cursor-pointer">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink-strong truncate">{q.name}</p>
                        <p className="text-[11px] text-ink-muted truncate">{q.customer || '—'} · {usd(q.total_cost)}</p>
                      </div>
                      <button onClick={(e) => deleteQuote(q.id, e)}
                        className="text-ink-muted hover:text-red-600 text-sm flex-shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={newQuote}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-strong text-white hover:brightness-110">
              + New quote
            </button>
          </div>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-3">

          {/* ─── LEFT: parts catalog ─── */}
          <div className="card !rounded-lg ring-1 ring-stone-200 shadow-none overflow-hidden flex flex-col">
            <div className="p-3 border-b border-stone-200">
              <div className="flex gap-1 mb-2">
                {TABS.map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      tab === t.key ? 'bg-ink-strong text-white border-ink-strong'
                                    : 'bg-white text-ink-mid border-stone-200 hover:border-stone-300'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by part name or vendor…"
                className="w-full text-sm border border-stone-300 rounded-lg px-3 py-2" />
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {loading ? (
                <div className="p-8 text-center text-ink-muted text-sm">Loading parts…</div>
              ) : visible.length === 0 ? (
                <div className="p-8 text-center text-ink-muted text-sm">No matching parts.</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-stone-50/95">
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-ink-muted border-b border-stone-200">
                      <th className="px-3 py-2">Part</th>
                      <th className="px-3 py-2">Vendor</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(p => (
                      <tr key={p.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/40">
                        <td className="px-3 py-2 text-[13px] text-ink-strong">
                          {p.name}
                          {p.pricing_flagged && (
                            <span className="ml-1.5 text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0.5 rounded" title={p.pricing_flag_note || 'Cost flagged for review'}>
                              ⚠ COST
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-ink-muted truncate max-w-[120px]">{p.vendor || '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-right tabular-nums">
                          {p.unit_cost == null
                            ? <span className="text-amber-700 text-[11px]">no cost</span>
                            : p.part_type === 'fabric'
                              ? <span className="text-ink-mid">{usd(rollCost(Number(p.unit_cost)))}<span className="text-ink-muted">/roll</span></span>
                              : <span className="text-ink-mid">{usd(p.unit_cost)}<span className="text-ink-muted">/{p.unit_of_measure || 'ea'}</span></span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => addLine(p)}
                            className="text-[11px] font-semibold text-brand-gold hover:underline">+ Add</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ─── RIGHT: worksheet ─── */}
          <div className="card !rounded-lg ring-1 ring-stone-200 shadow-none overflow-hidden flex flex-col">
            <div className="p-3 border-b border-stone-200 space-y-2">
              <input value={quoteName} onChange={e => setQuoteName(e.target.value)}
                placeholder="Quote name (e.g. Smith job — 40 shades)"
                className="w-full text-sm font-medium border border-stone-300 rounded-lg px-3 py-2" />
              <input value={quoteCustomer} onChange={e => setQuoteCustomer(e.target.value)}
                placeholder="Customer / job (optional)"
                className="w-full text-xs border border-stone-300 rounded-lg px-3 py-1.5" />
            </div>

            <div className="overflow-y-auto flex-1" style={{ maxHeight: '46vh' }}>
              {lines.length === 0 ? (
                <div className="p-8 text-center text-ink-muted text-sm">
                  Add parts from the left to build your quote.
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-stone-50/95">
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-ink-muted border-b border-stone-200">
                      <th className="px-3 py-2">Part</th>
                      <th className="px-3 py-2 text-center">Qty</th>
                      <th className="px-3 py-2 text-right">Line cost</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => {
                      const isFabric = l.part_type === 'fabric'
                      const perUnit  = isFabric ? rollCost(l.unit_cost) : l.unit_cost
                      const lineCost = lineCostOf(l)
                      return (
                        <tr key={l.part_id} className="border-b border-stone-100 last:border-0">
                          <td className="px-3 py-2">
                            <p className="text-[13px] text-ink-strong">{l.name}</p>
                            <p className="text-[11px] text-ink-muted">
                              {l.unit_cost == null ? <span className="text-amber-700">no cost on file</span>
                                : isFabric ? `${usd(perUnit)}/roll · 33 yd`
                                : `${usd(perUnit)}/${l.unit_of_measure || 'ea'}`}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input type="number" min="0" step="1" value={l.qty}
                              onChange={e => setQty(l.part_id, e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))))}
                              className="w-20 text-center text-sm border border-stone-300 rounded px-1.5 py-1" />
                            <p className="text-[9px] text-ink-muted mt-0.5">{isFabric ? 'rolls' : 'qty'}</p>
                          </td>
                          <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums text-ink-strong">
                            {lineCost == null ? <span className="text-amber-700 text-[11px]">—</span> : usd(lineCost)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => removeLine(l.part_id)} className="text-ink-muted hover:text-red-600 text-sm">✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Total + save */}
            <div className="border-t border-stone-200 p-3">
              {hasMissingCost && (
                <p className="text-[11px] text-amber-700 mb-2">⚠ Some parts have no cost on file — total excludes them and is understated.</p>
              )}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total parts cost</span>
                <span className="text-2xl font-medium text-ink-strong tabular-nums">{usd(total)}</span>
              </div>
              <button onClick={saveQuote} disabled={saving || lines.length === 0}
                className="w-full text-sm font-semibold py-2 rounded-lg bg-brand-gold text-white hover:brightness-105 disabled:opacity-40">
                {saving ? 'Saving…' : currentId ? 'Update saved quote' : 'Save quote'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
