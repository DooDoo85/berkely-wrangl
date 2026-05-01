import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const LOGO_B64 = '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'

const fmt = n => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

const TOP_TREATMENTS = {
  OPEN_ROLL: 'Open Roll',
  '3_CURVED_CASSETTE': '3" Curved Cassette',
  '3_CURVED_CASSETTE_FABRIC': '3" Curved Cassette w/ Fabric Insert',
  '3_FLAT_FASCIA': '3" Flat Fascia',
  '4_FLAT_FASCIA': '4" Flat Fascia',
  '4_CURVED_CASSETTE': '4" Curved Cassette',
  '3_SQUARE_CASSETTE': '3" Square Cassette',
  '3_SQUARE_CASSETTE_FABRIC': '3" Square Cassette w/ Fabric Insert',
}

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-700',
  accepted:  'bg-green-100 text-green-700',
  declined:  'bg-red-100 text-red-600',
  converted: 'bg-purple-100 text-purple-700',
}

export default function QuoteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)
  const printRef = useRef()

  useEffect(() => { loadQuote() }, [id])

  const loadQuote = async () => {
    const { data } = await supabase.from('quotes').select('*').eq('id', id).single()
    setQuote(data)
    setLoading(false)
  }

  const updateStatus = async (status) => {
    await supabase.from('quotes').update({ status }).eq('id', id)
    setQuote(q => ({ ...q, status }))
  }

  const printQuote = () => {
    const printWindow = window.open('', '_blank')
    const items = Array.isArray(quote.line_items) ? quote.line_items : []

    const lineRows = items.map((item, i) => {
      const t = TOP_TREATMENTS[item.top_treatment] || item.top_treatment || '—'
      const pd = item.price_detail || {}
      const addons = [
        pd.mechanism ? `${pd.mechanism.label}: ${fmt(pd.mechanism.amount)}` : null,
        ...(pd.addons || []).map(a => `${a.label}: ${fmt(a.amount)}`),
      ].filter(Boolean).join('<br/>')

      return `
        <tr>
          <td>${i + 1}</td>
          <td>
            <strong>${item.product_name || '—'}</strong><br/>
            <span style="color:#666;font-size:11px">${item.fabric_name || ''}</span>
          </td>
          <td>${item.color || '—'}</td>
          <td>${item.width ? `${item.width}" × ${item.height}"` : '—'}</td>
          <td>${t}</td>
          <td style="font-size:11px;color:#555">${addons}</td>
          <td style="text-align:center">${item.quantity || 1}</td>
          <td style="text-align:right"><strong>${fmt(item.line_total)}</strong></td>
        </tr>`
    }).join('')

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Quote ${quote.quote_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 40px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #c8a97e; }
          .logo-block { display: flex; align-items: center; gap: 16px; }
          .logo-block img { width: 70px; height: 70px; object-fit: contain; }
          .company-name { font-size: 22px; font-weight: 800; color: #1a1a1a; letter-spacing: -0.5px; }
          .company-sub { font-size: 11px; color: #666; margin-top: 3px; }
          .quote-meta { text-align: right; }
          .quote-number { font-size: 20px; font-weight: 700; color: #c8a97e; }
          .quote-date { font-size: 11px; color: #666; margin-top: 4px; }
          .customer-block { margin-bottom: 24px; padding: 16px; background: #f9f7f4; border-radius: 6px; }
          .customer-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 4px; }
          .customer-name { font-size: 15px; font-weight: 700; }
          .customer-email { font-size: 12px; color: #555; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #2d2d2d; color: white; padding: 9px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 10px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 12px; }
          tr:nth-child(even) td { background: #fafafa; }
          .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
          .totals-box { min-width: 220px; border: 2px solid #2d2d2d; border-radius: 6px; overflow: hidden; }
          .totals-row { display: flex; justify-content: space-between; padding: 8px 14px; font-size: 13px; }
          .totals-row.total { background: #2d2d2d; color: white; font-size: 16px; font-weight: 700; }
          .notes { margin-bottom: 24px; padding: 14px; background: #f9f7f4; border-radius: 6px; font-size: 12px; }
          .notes-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; }
          .disclaimer { margin-top: 24px; padding: 14px; border: 1px solid #e0d5c8; border-radius: 6px; background: #fffbf5; }
          .disclaimer p { font-size: 11px; color: #666; line-height: 1.6; }
          .disclaimer strong { color: #333; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #999; }
          @media print {
            body { padding: 20px; }
            @page { margin: 0.5in; size: letter; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-block">
            <img src="data:image/jpeg;base64,${LOGO_B64}" alt="Berkely Distribution" />
            <div>
              <div class="company-name">Berkely Distribution</div>
              <div class="company-sub">945-327-0301 &nbsp;|&nbsp; info@berkelydistribution.com</div>
            </div>
          </div>
          <div class="quote-meta">
            <div class="quote-number">${quote.quote_number}</div>
            <div class="quote-date">Date: ${new Date(quote.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            ${quote.sales_rep ? `<div class="quote-date">Rep: ${quote.sales_rep}</div>` : ''}
          </div>
        </div>

        ${quote.customer_name || quote.customer_email ? `
        <div class="customer-block">
          <div class="customer-label">Prepared For</div>
          ${quote.customer_name ? `<div class="customer-name">${quote.customer_name}</div>` : ''}
          ${quote.customer_email ? `<div class="customer-email">${quote.customer_email}</div>` : ''}
        </div>` : ''}

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Product / Fabric</th>
              <th>Color</th>
              <th>Size</th>
              <th>Treatment</th>
              <th>Options</th>
              <th style="text-align:center">Qty</th>
              <th style="text-align:right">Price</th>
            </tr>
          </thead>
          <tbody>${lineRows}</tbody>
        </table>

        <div class="totals">
          <div class="totals-box">
            <div class="totals-row total">
              <span>Total</span>
              <span>${fmt(quote.subtotal)}</span>
            </div>
          </div>
        </div>

        ${quote.notes ? `
        <div class="notes">
          <div class="notes-label">Notes</div>
          ${quote.notes}
        </div>` : ''}

        <div class="disclaimer">
          <p><strong>Important:</strong> This is not an official quote. Pricing is provided for reference purposes only and is subject to change. An official quote must be completed by the customer through the ePIC customer portal at <strong>berkelydistribution.com</strong>. Prices shown reflect standard MSRP and do not include applicable taxes, shipping, or installation.</p>
        </div>

        <div class="footer">
          Berkely Distribution LLC &nbsp;|&nbsp; 945-327-0301 &nbsp;|&nbsp; info@berkelydistribution.com
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `)
    printWindow.document.close()
  }

  if (loading) return <div className="p-6 text-gray-400">Loading…</div>
  if (!quote) return <div className="p-6 text-red-500">Quote not found.</div>

  const items = Array.isArray(quote.line_items) ? quote.line_items : []

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => navigate('/quotes')} className="text-sm text-blue-600 hover:underline mb-2">← All Quotes</button>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{quote.quote_number}</h1>
          <div className="text-sm text-gray-500 mt-1">
            Created {new Date(quote.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            {quote.sales_rep && ` · ${quote.sales_rep}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[quote.status] || STATUS_COLORS.draft}`}>
            {quote.status}
          </span>
          <button onClick={printQuote}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 flex items-center gap-2">
            🖨️ Download PDF
          </button>
        </div>
      </div>

      {/* Customer + Status */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Customer</div>
          <div className="font-semibold text-gray-900">{quote.customer_name || '—'}</div>
          {quote.customer_email && <div className="text-sm text-gray-500 mt-0.5">{quote.customer_email}</div>}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Update Status</div>
          <div className="flex gap-2 flex-wrap">
            {['draft','sent','accepted','declined','converted'].map(s => (
              <button key={s} onClick={() => updateStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                  ${quote.status === s ? STATUS_COLORS[s] + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-white text-xs uppercase">
            <tr>
              <th className="px-3 py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">Product</th>
              <th className="px-3 py-3 text-left">Color</th>
              <th className="px-3 py-3 text-left">Size</th>
              <th className="px-3 py-3 text-left">Treatment</th>
              <th className="px-3 py-3 text-center">Qty</th>
              <th className="px-3 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const t = TOP_TREATMENTS[item.top_treatment] || item.top_treatment || '—'
              const pd = item.price_detail || {}
              return (
                <tr key={item.id || i} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900 text-xs">{item.product_name}</div>
                    <div className="text-xs text-gray-500">{item.fabric_name}</div>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600">{item.color || '—'}</td>
                  <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {item.width ? `${item.width}" × ${item.height}"` : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600">{t}</td>
                  <td className="px-3 py-3 text-center text-xs text-gray-600">{item.quantity || 1}</td>
                  <td className="px-3 py-3 text-right font-medium">{fmt(item.line_total)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-900">
            <tr className="bg-gray-900 text-white">
              <td colSpan={6} className="px-3 py-3 text-right font-bold">Total</td>
              <td className="px-3 py-3 text-right font-bold text-lg">{fmt(quote.subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Notes</div>
          <div className="text-sm text-gray-700">{quote.notes}</div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500 leading-relaxed">
        <strong className="text-gray-700">Note:</strong> This is not an official quote. An official quote must be completed by the customer through the ePIC customer portal. Prices shown reflect standard MSRP and are subject to change.
      </div>
    </div>
  )
}
