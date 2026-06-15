import { useState, useMemo } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// FedEx rate estimator — empirical, learned from ~1,670 of your own
// shipments (invoice through June 2026). NOT FedEx's official rate table:
// it finds the charge band for similar past packages by zone + billable
// weight. Treat the result as a likely range, not a guaranteed quote.
//
// Billable weight = greater of actual weight and dimensional weight
// (L×W×H ÷ divisor). FedEx Ground uses divisor 139 (in³/lb).
// ═══════════════════════════════════════════════════════════════════════

const MODEL = {"grid": {"2": {"(0, 2]": {"lo": 17.85, "med": 18.34, "hi": 23.36, "nn": 17}, "(2, 5]": {"lo": 17.94, "med": 21.56, "hi": 22.15, "nn": 10}, "(5, 10]": {"lo": 21.25, "med": 22.15, "hi": 22.86, "nn": 20}, "(10, 15]": {"lo": 22.15, "med": 22.19, "hi": 38.45, "nn": 26}, "(15, 20]": {"lo": 22.15, "med": 25.95, "hi": 32.12, "nn": 10}, "(20, 30]": {"lo": 22.15, "med": 30.41, "hi": 30.66, "nn": 13}, "(30, 40]": {"lo": 34.48, "med": 40.81, "hi": 48.78, "nn": 55}, "(40, 50]": {"lo": 40.4, "med": 40.88, "hi": 40.88, "nn": 6}}, "3": {"(0, 2]": {"lo": 13.92, "med": 17.92, "hi": 22.35, "nn": 15}, "(2, 5]": {"lo": 13.82, "med": 18.76, "hi": 22.1, "nn": 22}, "(5, 10]": {"lo": 13.79, "med": 17.27, "hi": 21.96, "nn": 28}, "(10, 15]": {"lo": 13.84, "med": 21.94, "hi": 31.3, "nn": 39}, "(15, 20]": {"lo": 20.41, "med": 22.06, "hi": 30.5, "nn": 15}, "(20, 30]": {"lo": 21.41, "med": 22.1, "hi": 28.75, "nn": 50}, "(30, 40]": {"lo": 35.99, "med": 36.64, "hi": 44.7, "nn": 105}, "(40, 50]": {"lo": 37.97, "med": 42.2, "hi": 45.82, "nn": 21}}, "4": {"(0, 2]": {"lo": 17.63, "med": 21.33, "hi": 27.3, "nn": 7}, "(2, 5]": {"lo": 13.78, "med": 13.96, "hi": 21.94, "nn": 8}, "(5, 10]": {"lo": 13.92, "med": 21.95, "hi": 30.41, "nn": 28}, "(10, 15]": {"lo": 13.9, "med": 21.84, "hi": 28.7, "nn": 41}, "(15, 20]": {"lo": 13.9, "med": 21.84, "hi": 22.15, "nn": 21}, "(20, 30]": {"lo": 20.37, "med": 22.13, "hi": 22.7, "nn": 24}, "(30, 40]": {"lo": 38.34, "med": 43.23, "hi": 53.68, "nn": 91}, "(40, 50]": {"lo": 39.47, "med": 41.7, "hi": 45.39, "nn": 17}}, "5": {"(0, 2]": {"lo": 13.99, "med": 22.06, "hi": 30.41, "nn": 13}, "(2, 5]": {"lo": 13.99, "med": 21.84, "hi": 22.19, "nn": 25}, "(5, 10]": {"lo": 16.53, "med": 22.06, "hi": 30.08, "nn": 56}, "(10, 15]": {"lo": 21.81, "med": 22.06, "hi": 32.11, "nn": 26}, "(15, 20]": {"lo": 22.2, "med": 22.87, "hi": 31.22, "nn": 29}, "(20, 30]": {"lo": 23.11, "med": 24.8, "hi": 32.82, "nn": 82}, "(30, 40]": {"lo": 51.14, "med": 53.81, "hi": 54.36, "nn": 246}, "(40, 50]": {"lo": 54.15, "med": 56.36, "hi": 57.99, "nn": 45}, "(50, 75]": {"lo": 67.81, "med": 68.22, "hi": 68.22, "nn": 3}}, "6": {"(0, 2]": {"lo": 21.17, "med": 21.25, "hi": 22.24, "nn": 5}, "(2, 5]": {"lo": 22.06, "med": 22.24, "hi": 30.41, "nn": 13}, "(5, 10]": {"lo": 22.06, "med": 22.08, "hi": 28.08, "nn": 42}, "(10, 15]": {"lo": 21.33, "med": 22.06, "hi": 22.29, "nn": 33}, "(15, 20]": {"lo": 23.7, "med": 24.16, "hi": 27.19, "nn": 20}, "(20, 30]": {"lo": 24.74, "med": 28.05, "hi": 30.94, "nn": 50}, "(30, 40]": {"lo": 51.31, "med": 59.47, "hi": 59.82, "nn": 116}, "(40, 50]": {"lo": 54.58, "med": 59.11, "hi": 64.14, "nn": 24}, "(50, 75]": {"lo": 65.41, "med": 65.47, "hi": 66.85, "nn": 3}}, "7": {"(0, 2]": {"lo": 20.75, "med": 21.8, "hi": 24.74, "nn": 4}, "(2, 5]": {"lo": 13.93, "med": 13.93, "hi": 21.2, "nn": 5}, "(5, 10]": {"lo": 21.99, "med": 22.13, "hi": 22.19, "nn": 12}, "(10, 15]": {"lo": 22.81, "med": 23.39, "hi": 31.16, "nn": 5}, "(15, 20]": {"lo": 28.57, "med": 28.68, "hi": 36.42, "nn": 9}, "(20, 30]": {"lo": 33.86, "med": 38.7, "hi": 41.55, "nn": 16}, "(30, 40]": {"lo": 64.78, "med": 65.91, "hi": 74.34, "nn": 78}, "(40, 50]": {"lo": 66.48, "med": 70.9, "hi": 78.04, "nn": 18}}}, "perlb": {"2": 1.501, "3": 1.118, "4": 1.168, "5": 1.351, "6": 1.488, "7": 1.664}, "base": {"2": 18.0, "3": 13.9, "4": 13.9, "5": 21.84, "6": 21.75, "7": 22.09}, "edges": [0, 2, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 500]}

// Berkely is in Dallas TX (752xx). Rough zone by destination state — FedEx
// zones are distance bands from origin; this maps common states to the zone
// they most often fell in across your shipment history.
const STATE_ZONE = {
  TX:'2', OK:'3', LA:'3', AR:'3', NM:'3', KS:'4', MO:'4', MS:'4', AL:'4',
  CO:'4', TN:'4', GA:'5', FL:'5', AZ:'5', NE:'4', IA:'5', IL:'5', KY:'5',
  SC:'5', NC:'5', VA:'6', IN:'5', OH:'6', WI:'5', MN:'5', UT:'5', NV:'5',
  CA:'6', PA:'6', MD:'6', DC:'6', NJ:'6', NY:'6', MI:'6', WV:'6', SD:'5',
  ND:'5', MT:'6', WY:'5', ID:'6', CT:'6', MA:'7', RI:'7', VT:'7', NH:'7',
  ME:'7', DE:'6', WA:'7', OR:'7',
}

function bucketLabel(w, edges) {
  for (let i = 0; i < edges.length - 1; i++) {
    if (w > edges[i] && w <= edges[i + 1]) return `(${edges[i]}, ${edges[i + 1]}]`
  }
  return null
}

export default function FreightRateCalc() {
  const [L, setL] = useState('')
  const [W, setW] = useState('')
  const [H, setH] = useState('')
  const [wt, setWt] = useState('')
  const [zone, setZone] = useState('5')
  const [state, setState] = useState('')

  const est = useMemo(() => {
    const l = parseFloat(L), w = parseFloat(W), h = parseFloat(H), aw = parseFloat(wt)
    if (!aw && !(l && w && h)) return null
    const dimwt = (l && w && h) ? (l * w * h) / 139 : 0
    const billwt = Math.max(aw || 0, dimwt)
    if (!billwt) return null
    const z = MODEL.grid[zone] ? zone : '5'
    const lbl = bucketLabel(billwt, MODEL.edges)
    const cell = lbl && MODEL.grid[z] ? MODEL.grid[z][lbl] : null
    if (cell) {
      return { billwt, dimwt, dimDriven: dimwt > (aw || 0), med: cell.med, lo: cell.lo, hi: cell.hi, n: cell.nn, basis: 'similar shipments' }
    }
    // fallback: per-lb rate for the zone
    const perlb = MODEL.perlb[z] || 1.4
    const base = MODEL.base[z] || 14
    const est = Math.max(base, billwt * perlb)
    return { billwt, dimwt, dimDriven: dimwt > (aw || 0), med: est, lo: est * 0.8, hi: est * 1.25, n: 0, basis: 'per-lb estimate (weight outside common range)' }
  }, [L, W, H, wt, zone])

  const usd = (x) => `$${Number(x).toFixed(2)}`

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1>FedEx Rate Estimator</h1>
        <p className="text-sm text-ink-muted mt-1">
          Likely charge for a package, learned from your shipment history. An estimate range, not an official quote.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Inputs */}
        <div className="card p-5 space-y-4">
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wider mb-1.5">Dimensions (inches)</label>
            <div className="flex gap-2 items-center">
              <input type="number" placeholder="L" value={L} onChange={e => setL(e.target.value)} className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm" />
              <span className="text-ink-muted">×</span>
              <input type="number" placeholder="W" value={W} onChange={e => setW(e.target.value)} className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm" />
              <span className="text-ink-muted">×</span>
              <input type="number" placeholder="H" value={H} onChange={e => setH(e.target.value)} className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wider mb-1.5">Actual weight (lb)</label>
            <input type="number" placeholder="lb" value={wt} onChange={e => setWt(e.target.value)} className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wider mb-1.5">Destination</label>
            <div className="flex gap-2">
              <input placeholder="State (e.g. CA)" value={state} maxLength={2}
                onChange={e => { const s = e.target.value.toUpperCase(); setState(s); if (STATE_ZONE[s]) setZone(STATE_ZONE[s]) }}
                className="w-28 border border-surface-border rounded-lg px-3 py-2 text-sm uppercase" />
              <select value={zone} onChange={e => setZone(e.target.value)} className="flex-1 border border-surface-border rounded-lg px-3 py-2 text-sm">
                {['2','3','4','5','6','7'].map(z => <option key={z} value={z}>Zone {z}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-ink-muted mt-1">Type a state to auto-pick its usual zone, or set zone directly.</p>
          </div>
        </div>

        {/* Result */}
        <div className="card p-5 flex flex-col justify-center">
          {est ? (
            <>
              <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Estimated charge</p>
              <p className="text-4xl font-semibold text-ink-strong tabular-nums">{usd(est.med)}</p>
              <p className="text-sm text-ink-mid mt-1">likely {usd(est.lo)} – {usd(est.hi)}</p>
              <div className="mt-4 pt-4 border-t border-surface-border space-y-1.5 text-xs text-ink-mid">
                <div className="flex justify-between"><span>Billable weight</span><span className="tabular-nums font-medium">{est.billwt.toFixed(1)} lb</span></div>
                {est.dimwt > 0 && (
                  <div className="flex justify-between">
                    <span>Dimensional weight</span>
                    <span className={`tabular-nums ${est.dimDriven ? 'text-status-critical font-semibold' : ''}`}>{est.dimwt.toFixed(1)} lb</span>
                  </div>
                )}
                {est.dimDriven && <p className="text-[11px] text-status-critical pt-1">⚠ Dim weight exceeds actual — this box is billed for its size. A smaller carton would cost less.</p>}
                <div className="flex justify-between pt-1"><span>Based on</span><span>{est.n > 0 ? `${est.n} similar shipments` : est.basis}</span></div>
              </div>
            </>
          ) : (
            <div className="text-center text-ink-muted text-sm py-8">Enter dimensions and/or weight to estimate.</div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-ink-muted mt-4">
        Estimates come from the charge range of past shipments in the same zone and billable-weight band — they reflect
        your negotiated rates and typical surcharges, but actual charges vary with fuel, residential, and accessorial
        fees. Ground dim divisor 139. Use as a sanity check, not a binding quote.
      </p>
    </div>
  )
}
