import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// ── Fuzzy matching ────────────────────────────────────────────────────────────
function stringSimilarity(a, b) {
  const s1 = a.toLowerCase().trim()
  const s2 = b.toLowerCase().trim()
  if (s1 === s2) return 1.0

  const tokens1 = new Set(s1.split(/\s+|[-\/|"']/))
  const tokens2 = new Set(s2.split(/\s+|[-\/|"']/))
  const intersection = [...tokens1].filter(t => tokens2.has(t)).length
  const union = new Set([...tokens1, ...tokens2]).size
  const tokenScore = union > 0 ? intersection / union : 0

  const m = s1.length, n = s2.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s1[i-1] === s2[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  const charScore = 1 - dp[m][n] / Math.max(m, n)
  return (tokenScore * 0.6 + charScore * 0.4)
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes }
    else if (line[i] === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += line[i] }
  }
  result.push(current)
  return result
}

function parseCSV(csvText) {
  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/"/g, ''))
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line)
    const row = {}
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/"/g, '').trim() })
    return row
  })
}

export default function CommittedStockImport() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleProcess() {
    if (!file) return
    setProcessing(true)
    setError(null)
    setResult(null)

    try {
      const text = await file.text()
      const rows = parseCSV(text)

      // Skip RS COMP
      const partRows = rows.filter(r => (r.StockClass || '').trim() !== 'RS COMP')
      setProgress(`Found ${rows.length} rows, processing ${partRows.length} RS PART rows...`)

      // Load approved mappings
      setProgress('Loading approved mappings...')
      const { data: mappings } = await supabase
        .from('epic_part_mappings')
        .select('epic_stock_code, wrangl_part_id, wrangl_part_name')
      const mappingMap = {}
      ;(mappings || []).forEach(m => { mappingMap[m.epic_stock_code] = m })

      // Load all active parts for fuzzy matching
      setProgress('Loading parts for matching...')
      const { data: allParts } = await supabase
        .from('parts')
        .select('id, name, vendor_id')
        .eq('active', true)
        .limit(1000)
      const partsList = allParts || []

      const stats = { new: 0, skipped: 0, auto_matched: 0, pending_review: 0, unmatched: 0 }
      const toCommit = {}

      let i = 0
      for (const row of partRows) {
        i++
        if (i % 20 === 0) setProgress(`Processing row ${i} of ${partRows.length}...`)

        const wo          = (row.WorkOrder || '').trim()
        const lineItem    = (row.LineItem || '').trim()
        const stockCode   = (row.StockCode || '').trim()
        const description = (row.ComponentDescription || '').trim()
        const requiredQty = parseFloat(row.RequiredQty || 0) || 0
        const datePrinted = (row.DatePrinted || '').trim().slice(0, 10) || null

        if (!wo || !lineItem || !stockCode) continue

        // Check duplicate
        const { data: existing } = await supabase
          .from('epic_committed_stock')
          .select('id')
          .eq('work_order', wo)
          .eq('line_item', lineItem)
          .eq('stock_code', stockCode)
          .limit(1)

        if (existing && existing.length > 0) {
          stats.skipped++
          continue
        }

        stats.new++

        // Match
        let partId = null
        let matchStatus = 'unmatched'
        let matchScore = 0

        if (mappingMap[stockCode]) {
          partId = mappingMap[stockCode].wrangl_part_id
          matchStatus = 'auto_matched'
          matchScore = 1.0
          stats.auto_matched++
        } else {
          let bestScore = 0
          let bestPart = null
          for (const part of partsList) {
            const score = stringSimilarity(description, part.name)
            if (score > bestScore) { bestScore = score; bestPart = part }
          }

          if (bestScore >= 0.95) {
            partId = bestPart.id
            matchStatus = 'auto_matched'
            matchScore = bestScore
            stats.auto_matched++
            // Save approved mapping
            await supabase.from('epic_part_mappings').upsert({
              epic_stock_code:  stockCode,
              epic_description: description,
              wrangl_part_id:   bestPart.id,
              wrangl_part_name: bestPart.name,
              approved_at:      new Date().toISOString(),
            }, { onConflict: 'epic_stock_code' })
          } else if (bestScore >= 0.85) {
            partId = bestPart.id
            matchStatus = 'pending_review'
            matchScore = bestScore
            stats.pending_review++
          } else {
            matchStatus = 'unmatched'
            matchScore = bestScore
            stats.unmatched++
          }
        }

        // Insert committed stock line
        await supabase.from('epic_committed_stock').insert({
          work_order:            wo,
          line_item:             lineItem,
          date_printed:          datePrinted,
          stock_code:            stockCode,
          component_description: description,
          required_qty:          requiredQty,
          uom:                   (row.UOM || '').trim(),
          stock_class:           (row.StockClass || '').trim(),
          part_id:               partId,
          match_status:          matchStatus,
          match_score:           matchScore,
        })

        // Accumulate committed qty for auto-matched parts
        if (matchStatus === 'auto_matched' && partId) {
          if (!toCommit[partId]) toCommit[partId] = 0
          toCommit[partId] += requiredQty
        }
      }

      // Update qty_committed on parts
      setProgress('Updating inventory committed quantities...')
      for (const [partId, qty] of Object.entries(toCommit)) {
        const { data: parts } = await supabase
          .from('parts')
          .select('qty_committed')
          .eq('id', partId)
          .single()
        if (!parts) continue
        const current = parseFloat(parts.qty_committed) || 0
        await supabase.from('parts').update({
          qty_committed: current + qty,
          updated_at: new Date().toISOString(),
        }).eq('id', partId)
      }

      // Log import
      await supabase.from('epic_import_log').insert({
        import_type:            'committed_stock',
        records_total:          partRows.length,
        records_new:            stats.new,
        records_skipped:        stats.skipped,
        records_auto_matched:   stats.auto_matched,
        records_pending_review: stats.pending_review,
        records_unmatched:      stats.unmatched,
      })

      setResult(stats)
      setProgress('')
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Committed Stock Import</h1>
          <p className="text-sm text-stone-500 mt-0.5">Upload ePIC committed stock CSV to update inventory</p>
        </div>
        <button onClick={() => navigate('/inventory')} className="text-sm text-stone-500 hover:text-stone-800 transition-colors">
          ← Inventory
        </button>
      </div>

      {/* How it works */}
      <div className="card p-5 mb-5">
        <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-3">How this works</p>
        <div className="space-y-2 text-sm text-stone-600">
          <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>Skips fabric/extrusion rows (RS COMP) — those are tracked by cut</span></div>
          <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>Skips duplicate work order lines already processed</span></div>
          <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span><strong>95%+ match</strong> — auto-matched, qty committed immediately</span></div>
          <div className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">⚠</span><span><strong>85–94% match</strong> — flagged for your review before committing qty</span></div>
          <div className="flex items-start gap-2"><span className="text-stone-300 mt-0.5">○</span><span><strong>Below 85%</strong> — marked unmatched, no qty change</span></div>
        </div>
      </div>

      {/* Upload */}
      <div className="card p-5 mb-5">
        <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-3">Select CSV File</p>
        <input
          type="file"
          accept=".csv"
          onChange={e => setFile(e.target.files[0])}
          className="block text-sm text-stone-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-dark file:text-white hover:file:bg-brand-dark/90 cursor-pointer"
        />
        {file && (
          <p className="text-xs text-stone-400 mt-2">Selected: {file.name}</p>
        )}
      </div>

      {/* Process button */}
      <button
        onClick={handleProcess}
        disabled={!file || processing}
        className="w-full py-3 bg-brand-dark text-white font-semibold rounded-xl hover:bg-brand-dark/90 disabled:opacity-40 transition-colors mb-5"
      >
        {processing ? 'Processing...' : 'Process Committed Stock CSV'}
      </button>

      {/* Progress */}
      {progress && (
        <div className="card p-4 mb-5 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-brand-dark border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-sm text-stone-600">{progress}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 mb-5 bg-red-50 border border-red-200">
          <p className="text-sm text-red-700 font-semibold">Error</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 bg-green-50 border-b border-green-100">
            <p className="text-sm font-semibold text-green-800">✅ Import Complete</p>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-stone-50 rounded-xl">
              <p className="text-2xl font-bold text-stone-800">{result.new}</p>
              <p className="text-xs text-stone-500 mt-1">New Lines Processed</p>
            </div>
            <div className="text-center p-3 bg-stone-50 rounded-xl">
              <p className="text-2xl font-bold text-stone-400">{result.skipped}</p>
              <p className="text-xs text-stone-500 mt-1">Duplicates Skipped</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-xl">
              <p className="text-2xl font-bold text-green-700">{result.auto_matched}</p>
              <p className="text-xs text-stone-500 mt-1">Auto-Matched</p>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-xl">
              <p className="text-2xl font-bold text-amber-700">{result.pending_review}</p>
              <p className="text-xs text-stone-500 mt-1">Pending Review</p>
            </div>
            <div className="text-center p-3 bg-stone-50 rounded-xl col-span-2">
              <p className="text-2xl font-bold text-stone-400">{result.unmatched}</p>
              <p className="text-xs text-stone-500 mt-1">Unmatched</p>
            </div>
          </div>
          {result.pending_review > 0 && (
            <div className="px-5 pb-5">
              <button
                onClick={() => navigate('/inventory/match-review')}
                className="w-full py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors"
              >
                Review {result.pending_review} Pending Match{result.pending_review !== 1 ? 'es' : ''} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
