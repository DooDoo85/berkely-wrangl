import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const TABLES = [
  { name: 'ANAB_DESIGN_G1_2026', label: 'G1 — Open Roll Base Price',          type: 'base_wxh'    },
  { name: 'ANAB_DESIGN_G2_2026', label: 'G2 — Cassette Base Price',            type: 'base_wxh'    },
  { name: 'ANAB_DESIGN_G3_2026', label: 'G3 — Cassette Base Price (Large)',    type: 'base_wxh'    },
  { name: 'ANAB_DESIGN_TOP_TRMTS_2026', label: 'Top Treatments Add-on',        type: 'addon_width' },
  { name: 'ANAB_SIDE_CH_2026',   label: 'Side Channel Add-on',                type: 'addon_height'},
  { name: 'ANAB_SILL_2026',      label: 'Sill Light Block Add-on',             type: 'addon_width' },
]

// Parse ePIC price table CSV (width across top, height down side)
// Expected format:
//   ,24,30,36,42,...  ← widths in header row
//   24,45.00,52.00,...
//   30,55.00,62.00,...
function parseWidthHeightCSV(text) {
  const rows = []
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) throw new Error('CSV needs at least a header row and one data row')

  const headers = lines[0].split(',').map(v => v.trim())
  // First column is height label, remaining are widths
  const widths = headers.slice(1).map(Number).filter(n => !isNaN(n) && n > 0)
  if (widths.length === 0) throw new Error('No valid width columns found in header row')

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(v => v.trim())
    const height = parseFloat(cols[0])
    if (isNaN(height)) continue
    widths.forEach((width, j) => {
      const price = parseFloat(cols[j + 1]?.replace(/[$,]/g, ''))
      if (!isNaN(price) && price > 0) {
        rows.push({ width, height, price })
      }
    })
  }
  return rows
}

// Parse width-only add-on table (single row)
// Expected format: 24,30,36,42,...  (first line = widths, second line = prices)
// OR: width,price pairs
function parseWidthOnlyCSV(text) {
  const rows = []
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) throw new Error('Empty CSV')

  // Try header+data format: line 1 = widths, line 2 = prices
  if (lines.length >= 2) {
    const widths = lines[0].split(',').map(Number).filter(n => !isNaN(n) && n > 0)
    const prices = lines[1].split(',').map(v => parseFloat(v.replace(/[$,]/g, '')))
    if (widths.length > 0 && widths.length === prices.length) {
      widths.forEach((w, i) => {
        if (!isNaN(prices[i]) && prices[i] > 0) rows.push({ width: w, height: 999, price: prices[i] })
      })
      return rows
    }
  }

  // Fallback: each line is "width,price"
  lines.forEach(line => {
    const [w, p] = line.split(',')
    const width = parseFloat(w)
    const price = parseFloat(p?.replace(/[$,]/g, ''))
    if (!isNaN(width) && !isNaN(price) && price > 0) rows.push({ width, height: 999, price })
  })
  return rows
}

// Parse height-only add-on table
function parseHeightOnlyCSV(text) {
  const rows = []
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)

  lines.forEach(line => {
    const [h, p] = line.split(',')
    const height = parseFloat(h)
    const price  = parseFloat(p?.replace(/[$,]/g, ''))
    if (!isNaN(height) && !isNaN(price) && price > 0) rows.push({ width: 999, height, price })
  })
  return rows
}

export default function PriceGridImport() {
  const [results, setResults]   = useState({})
  const [uploading, setUploading] = useState({})

  const handleFile = async (tableName, tableType, file) => {
    if (!file) return
    setUploading(u => ({ ...u, [tableName]: true }))
    setResults(r => ({ ...r, [tableName]: null }))

    try {
      const text = await file.text()
      let rows = []

      if (tableType === 'base_wxh') {
        rows = parseWidthHeightCSV(text)
      } else if (tableType === 'addon_width') {
        rows = parseWidthOnlyCSV(text)
      } else if (tableType === 'addon_height') {
        rows = parseHeightOnlyCSV(text)
      }

      if (rows.length === 0) throw new Error('No valid price rows found in CSV. Check format.')

      // Delete existing rows for this table
      await supabase.from('price_matrix').delete().eq('table_name', tableName)

      // Insert in batches of 200
      let inserted = 0
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200).map(r => ({ table_name: tableName, ...r }))
        const { error } = await supabase.from('price_matrix').insert(batch)
        if (error) throw new Error(error.message)
        inserted += batch.length
      }

      setResults(r => ({ ...r, [tableName]: { ok: true, count: inserted } }))
    } catch (err) {
      setResults(r => ({ ...r, [tableName]: { ok: false, error: err.message } }))
    } finally {
      setUploading(u => ({ ...u, [tableName]: false }))
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Price Grid Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload ePIC price table CSVs to enable live pricing in the Quote Builder.
          Export each table from ePIC Report Writer and upload here.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
        <div className="font-semibold mb-1">CSV Format — Width × Height Tables (G1, G2, G3):</div>
        <div className="font-mono text-xs bg-white border rounded p-2 whitespace-pre text-gray-700">
{`,24,30,36,42,48,54,60,...
24,85.00,95.00,110.00,125.00,145.00,...
30,95.00,108.00,124.00,142.00,164.00,...
36,...`}
        </div>
        <div className="mt-2 font-semibold">Width-only Add-ons (TOP_TRMTS, SILL):</div>
        <div className="font-mono text-xs bg-white border rounded p-2 mt-1 text-gray-700">
          24,30,36,42,48,... ← widths<br />
          15.00,18.00,21.00,... ← prices
        </div>
        <div className="mt-2 font-semibold">Height-only Add-ons (SIDE_CH):</div>
        <div className="font-mono text-xs bg-white border rounded p-2 mt-1 text-gray-700">
          24,45.00<br />30,60.00<br />36,72.00<br />...
        </div>
      </div>

      <div className="space-y-3">
        {TABLES.map(t => {
          const res  = results[t.name]
          const busy = uploading[t.name]
          return (
            <div key={t.name} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-900">{t.label}</div>
                <div className="font-mono text-xs text-gray-400 mt-0.5">{t.name}</div>
                {res && (
                  <div className={`mt-1 text-xs font-medium ${res.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {res.ok ? `✓ ${res.count} rows imported` : `✗ ${res.error}`}
                  </div>
                )}
              </div>
              <label className={`cursor-pointer px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${busy ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                       : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                {busy ? 'Uploading…' : 'Upload CSV'}
                <input
                  type="file" accept=".csv" className="hidden" disabled={busy}
                  onChange={e => handleFile(t.name, t.type, e.target.files?.[0])}
                />
              </label>
            </div>
          )
        })}
      </div>

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <div className="font-semibold mb-1">⚠️ After uploading price grids</div>
        Verify pricing by entering a test quote: Anabelle Cordless, Light Filtering, 48" × 60", Open Roll.
        You should see MSRP PG1: $306.00. If you see a different value, the CSV row/column orientation may need adjusting.
      </div>
    </div>
  )
}
