import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════
// Offsite Fabric — rolls owned but stored at another warehouse, picked up
// over time. Receive once; draw down as pickups happen. Surfaces "already
// owned offsite" so low-stock fabrics aren't needlessly reordered.
// ═══════════════════════════════════════════════════════════════════════

const YDS_PER_ROLL = 33

export default function OffsiteFabric() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [pickupFor, setPickupFor] = useState(null)   // row being picked up
  const [pickupQty, setPickupQty] = useState(1)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('fabric_offsite')
      .select('*')
      .order('fabric_name')
    if (error) setMsg({ ok: false, text: `Load failed: ${error.message}. Has fabric_offsite_setup.sql been run?` })
    else setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const totals = useMemo(() => ({
    fabrics: rows.length,
    rollsRemaining: rows.reduce((a, r) => a + (r.rolls_remaining || 0), 0),
    rollsTotal: rows.reduce((a, r) => a + (r.rolls_total || 0), 0),
    fullyPickedUp: rows.filter(r => r.rolls_remaining === 0).length,
  }), [rows])

  async function doPickup() {
    if (!pickupFor) return
    const qty = Math.min(Math.max(1, pickupQty), pickupFor.rolls_remaining)
    const newRemaining = pickupFor.rolls_remaining - qty
    try {
      // 1. decrement offsite
      const { error: e1 } = await supabase.from('fabric_offsite')
        .update({
          rolls_remaining: newRemaining,
          yards_remaining: newRemaining * YDS_PER_ROLL,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pickupFor.id)
      if (e1) throw e1

      // 2. if linked to a part, increment on-hand by the yards picked up
      if (pickupFor.part_id) {
        const { data: part } = await supabase.from('parts')
          .select('qty_on_hand').eq('id', pickupFor.part_id).single()
        if (part) {
          await supabase.from('parts')
            .update({ qty_on_hand: (Number(part.qty_on_hand) || 0) + qty * YDS_PER_ROLL })
            .eq('id', pickupFor.part_id)
        }
      }
      setMsg({
        ok: true,
        text: `Picked up ${qty} roll${qty === 1 ? '' : 's'} of ${pickupFor.fabric_name}`
          + (pickupFor.part_id ? ` — ${qty * YDS_PER_ROLL} yds added to on-hand` : ' — not yet linked to a part, on-hand not updated'),
      })
      setPickupFor(null); setPickupQty(1)
      await load()
    } catch (e) {
      setMsg({ ok: false, text: `Pickup failed: ${e.message}` })
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1>Offsite Fabric</h1>
        <p className="text-sm text-ink-muted mt-1">
          Rolls owned but stored offsite — pick up over time. {YDS_PER_ROLL} yds/roll.
        </p>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${
          msg.ok ? 'bg-accent-gold-soft border-accent-gold/30 text-ink-strong'
                 : 'bg-status-critical/10 border-status-critical/30 text-status-critical'
        }`}>{msg.text}</div>
      )}

      {loading ? (
        <div className="text-center py-16 text-ink-muted text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-3xl mb-3">📦</div>
          <div className="font-semibold text-ink-strong mb-1">No offsite fabric</div>
          <div className="text-sm text-ink-muted">Run fabric_offsite_setup.sql to load the Elegant order.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="card p-3.5">
              <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Fabrics</p>
              <p className="text-lg font-semibold text-ink-strong tabular-nums">{totals.fabrics}</p>
            </div>
            <div className="card p-3.5">
              <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Rolls remaining</p>
              <p className="text-lg font-semibold text-ink-strong tabular-nums">{totals.rollsRemaining} <span className="text-xs text-ink-muted">of {totals.rollsTotal}</span></p>
            </div>
            <div className="card p-3.5">
              <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Yards remaining</p>
              <p className="text-lg font-semibold text-ink-strong tabular-nums">{(totals.rollsRemaining * YDS_PER_ROLL).toLocaleString()}</p>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-page/40 text-[10px] text-ink-muted uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5">Fabric</th>
                  <th className="text-left px-4 py-2.5">Location</th>
                  <th className="text-right px-4 py-2.5">Remaining</th>
                  <th className="text-right px-4 py-2.5">Yards</th>
                  <th className="text-left px-4 py-2.5">Linked</th>
                  <th className="text-right px-4 py-2.5">Pickup</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={`border-b border-surface-border-soft ${r.rolls_remaining === 0 ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-ink-strong">{r.fabric_name}</td>
                    <td className="px-4 py-2.5 text-ink-mid text-xs">{r.location}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.rolls_remaining}<span className="text-ink-muted text-xs"> / {r.rolls_total}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-mid">{(r.rolls_remaining * YDS_PER_ROLL).toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      {r.part_id
                        ? <span className="text-[10px] text-status-healthy">● linked</span>
                        : <span className="text-[10px] text-ink-muted">unlinked</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.rolls_remaining > 0 ? (
                        <button onClick={() => { setPickupFor(r); setPickupQty(1); setMsg(null) }}
                          className="btn-ghost text-xs">Pick up</button>
                      ) : (
                        <span className="text-[10px] text-ink-muted">complete</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-ink-muted mt-3">
            Linked fabrics add yards to on-hand on pickup. Unlinked rows track rolls only until matched to a fabric
            part during name reconciliation — they still count as owned stock for reorder checks.
          </p>
        </>
      )}

      {/* Pickup modal */}
      {pickupFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPickupFor(null)}>
          <div className="card p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-ink-strong mb-1">Pick up rolls</h3>
            <p className="text-sm text-ink-muted mb-4">{pickupFor.fabric_name} — {pickupFor.rolls_remaining} remaining at {pickupFor.location}</p>
            <label className="block text-xs text-ink-muted mb-1">Rolls picked up</label>
            <input type="number" min={1} max={pickupFor.rolls_remaining} value={pickupQty}
              onChange={e => setPickupQty(parseInt(e.target.value) || 1)}
              className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm mb-1" />
            <p className="text-[11px] text-ink-muted mb-4">= {Math.min(pickupQty, pickupFor.rolls_remaining) * YDS_PER_ROLL} yards{pickupFor.part_id ? ' added to on-hand' : ''}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPickupFor(null)} className="btn-ghost text-sm">Cancel</button>
              <button onClick={doPickup} className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent-clay text-ink-inverse">Confirm pickup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
