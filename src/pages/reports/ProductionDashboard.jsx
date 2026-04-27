import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function startOfWeek() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
  return d.toISOString()
}

function startOfMonth() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function startOfYear() {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function fmt$(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000)    return `$${(n / 1000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

function fmtPct(a, b) {
  if (!b) return '—'
  return `${Math.round((a / b) * 100)}%`
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase mb-3">{children}</p>
  )
}

function KpiCard({ label, value, sub, accent = 'text-stone-800', loading }) {
  return (
    <div className="card p-5 text-center">
      <div className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase mb-3">{label}</div>
      <div className={`text-3xl font-display font-bold mb-1.5 ${accent}`}>
        {loading ? <span className="text-stone-200">—</span> : value}
      </div>
      {sub && <div className="text-xs text-stone-400">{sub}</div>}
    </div>
  )
}

function MiniBar({ data = [], color = '#a5b4fc' }) {
  const max = Math.max(...data.map(d => d.v), 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 gap-1">
          <div
            className="w-full rounded-t"
            style={{ height: `${Math.max((d.v / max) * 56, 2)}px`, background: d.highlight ? '#6366f1' : color }}
          />
          <span className="text-stone-400" style={{ fontSize: 8 }}>{d.l}</span>
        </div>
      ))}
    </div>
  )
}

function ProductLineCard({ title, data, total, color, onClick, loading }) {
  const pct = total > 0 ? Math.round(((data?.units_mtd || 0) / total) * 100) : 0
  return (
    <div
      onClick={onClick}
      className="card p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <p className="text-sm font-bold text-stone-700">{title}</p>
        </div>
        <span className="text-xs text-stone-400">View orders →</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-1">Units WTD</p>
          <p className="text-2xl font-display font-bold text-stone-800">
            {loading ? '—' : (data?.units_wtd ?? '—')}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-1">Units MTD</p>
          <p className="text-2xl font-display font-bold text-stone-800">
            {loading ? '—' : (data?.units_mtd ?? '—')}
          </p>
          <p className="text-xs text-stone-400 mt-0.5">{loading ? '' : fmt$(data?.sales_mtd)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-1">Units YTD</p>
          <p className="text-2xl font-display font-bold text-stone-800">
            {loading ? '—' : (data?.units_ytd ?? '—')}
          </p>
          <p className="text-xs text-stone-400 mt-0.5">{loading ? '' : fmt$(data?.sales_ytd)}</p>
        </div>
      </div>
      {/* % of total bar */}
      <div>
        <div className="flex justify-between text-[10px] text-stone-400 mb-1">
          <span>% of total MTD</span>
          <span>{loading ? '—' : `${pct}%`}</span>
        </div>
        <div className="h-1.5 bg-stone-100 rounded-full">
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function ProductionDashboard() {
  const navigate  = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data,    setData]    = useState({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const weekStart  = startOfWeek()
      const monthStart = startOfMonth()
      const yearStart  = startOfYear()

      const [
        shippedWTD, shippedMTD, shippedYTD,
        inProdRes, printedRes, submittedRes,
        revenueWTD, revenueMTD,
        productLines,
        topFabrics, topComponents,
        inventoryValue,
        dailyShipped,
      ] = await Promise.all([
        // shipped counts
        supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'invoiced').gte('updated_at', weekStart),
        supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'invoiced').gte('updated_at', monthStart),
        supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'invoiced').gte('updated_at', yearStart),

        // pipeline counts
        supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'in_production'),
        supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'printed'),
        supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'submitted'),

        // revenue
        supabase.from('orders').select('subtotal')
          .eq('status', 'invoiced').gte('updated_at', weekStart),
        supabase.from('orders').select('subtotal')
          .eq('status', 'invoiced').gte('updated_at', monthStart),

        // product lines
        supabase.from('product_line_sales').select('*'),

        // top fabrics by qty
        supabase.from('parts').select('name, qty_on_hand, unit_cost')
          .eq('part_type', 'fabric')
          .gt('qty_on_hand', 0)
          .order('qty_on_hand', { ascending: false })
          .limit(6),

        // top components by qty
        supabase.from('parts').select('name, qty_on_hand, unit_cost')
          .eq('part_type', 'component')
          .gt('qty_on_hand', 0)
          .order('qty_on_hand', { ascending: false })
          .limit(6),

        // inventory value
        supabase.from('parts').select('part_type, qty_on_hand, unit_cost')
          .in('part_type', ['fabric', 'component', 'blind'])
          .gt('unit_cost', 0),

        // daily shipped last 15 days
        supabase.from('orders').select('updated_at')
          .eq('status', 'invoiced')
          .gte('updated_at', new Date(Date.now() - 14 * 86400000).toISOString())
          .order('updated_at', { ascending: true }),
      ])

      // revenue sums
      const revenueWTDSum = (revenueWTD.data || []).reduce((s, o) => s + (o.subtotal || 0), 0)
      const revenueMTDSum = (revenueMTD.data || []).reduce((s, o) => s + (o.subtotal || 0), 0)

      // product lines
      const faux   = (productLines.data || []).find(p => p.product_line === 'Faux Wood Blinds') ?? {}
      const roller = (productLines.data || []).find(p => p.product_line === 'Roller Shades') ?? {}
      const totalMTD = (faux.units_mtd || 0) + (roller.units_mtd || 0)

      // inventory value calculation
      const invData = inventoryValue.data || []
      const fabricValue    = invData.filter(p => p.part_type === 'fabric')
        .reduce((s, p) => s + ((p.qty_on_hand / 1188) * p.unit_cost), 0)
      const componentValue = invData.filter(p => p.part_type === 'component')
        .reduce((s, p) => s + (p.qty_on_hand * p.unit_cost), 0)
      const totalInvValue  = fabricValue + componentValue

      // avg units per day (MTD)
      const dayOfMonth = new Date().getDate()
      const avgPerDay  = dayOfMonth > 0 ? Math.round((shippedMTD.count || 0) / dayOfMonth) : 0

      // daily chart
      const dayMap = {}
      ;(dailyShipped.data || []).forEach(r => {
        const d   = new Date(r.updated_at)
        const key = `${d.getMonth() + 1}/${d.getDate()}`
        dayMap[key] = (dayMap[key] || 0) + 1
      })
      const chartData = Array.from({ length: 15 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (14 - i))
        const key = `${d.getMonth() + 1}/${d.getDate()}`
        return { l: d.getDate().toString(), v: dayMap[key] || 0, highlight: i === 14 }
      })

      setData({
        shippedWTD:    shippedWTD.count || 0,
        shippedMTD:    shippedMTD.count || 0,
        shippedYTD:    shippedYTD.count || 0,
        revenueWTD:    revenueWTDSum,
        revenueMTD:    revenueMTDSum,
        inProd:        inProdRes.count || 0,
        printed:       printedRes.count || 0,
        submitted:     submittedRes.count || 0,
        avgPerDay,
        faux, roller, totalMTD,
        topFabrics:    topFabrics.data || [],
        topComponents: topComponents.data || [],
        fabricValue, componentValue, totalInvValue,
        chartData,
      })
    } catch (err) {
      console.error('ProductionDashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // fabric display: qty in inches → rolls
  const topFabricMax = Math.max(...(data.topFabrics || []).map(f => f.qty_on_hand), 1)
  const topCompMax   = Math.max(...(data.topComponents || []).map(c => c.qty_on_hand), 1)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/reports')} className="btn-ghost text-sm">← Reports</button>
        <h2 className="text-2xl font-display font-bold text-stone-800">Production Dashboard</h2>
      </div>
      <p className="text-stone-400 text-sm mb-6 ml-1">{today}</p>

      {/* Output KPIs */}
      <SectionLabel>Output</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard label="Units WTD"     value={data.shippedWTD} sub="Shipped this week"  accent="text-emerald-600" loading={loading} />
        <KpiCard label="Units MTD"     value={data.shippedMTD} sub="Shipped this month" accent="text-emerald-700" loading={loading} />
        <KpiCard label="Units YTD"     value={data.shippedYTD} sub="Year to date"       accent="text-stone-700"   loading={loading} />
        <KpiCard label="Revenue WTD"   value={fmt$(data.revenueWTD)} sub="This week"    accent="text-indigo-600"  loading={loading} />
        <KpiCard label="Revenue MTD"   value={fmt$(data.revenueMTD)} sub="This month"   accent="text-indigo-700"  loading={loading} />
      </div>

      {/* Product Line Breakdown */}
      <SectionLabel>Product line breakdown</SectionLabel>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <ProductLineCard
          title="Faux Wood Blinds"
          data={data.faux}
          total={data.totalMTD}
          color="#f59e0b"
          loading={loading}
          onClick={() => navigate('/orders?product=faux')}
        />
        <ProductLineCard
          title="Roller Shades"
          data={data.roller}
          total={data.totalMTD}
          color="#6366f1"
          loading={loading}
          onClick={() => navigate('/orders?product=roller')}
        />
      </div>

      {/* Trend + Pipeline */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <SectionLabel>Units shipped — last 15 days</SectionLabel>
          <MiniBar data={data.chartData || []} color="#a5b4fc" />
        </div>
        <div className="card p-5">
          <SectionLabel>Production pipeline</SectionLabel>
          <div className="space-y-2 mt-1">
            {[
              { label: 'Submitted',     value: data.submitted, color: 'bg-blue-400',    status: 'submitted'     },
              { label: 'Printed',       value: data.printed,   color: 'bg-amber-400',   status: 'printed'       },
              { label: 'In Production', value: data.inProd,    color: 'bg-purple-500',  status: 'in_production' },
            ].map(s => {
              const total = (data.submitted || 0) + (data.printed || 0) + (data.inProd || 0)
              const pct   = total > 0 ? Math.round(((s.value || 0) / total) * 100) : 0
              return (
                <button
                  key={s.status}
                  onClick={() => navigate(`/orders?status=${s.status}`)}
                  className="w-full text-left group"
                >
                  <div className="flex justify-between text-xs text-stone-500 mb-1">
                    <span>{s.label}</span>
                    <span className="font-semibold">{loading ? '—' : s.value}</span>
                  </div>
                  <div className="h-2 bg-stone-100 rounded-full">
                    <div
                      className={`h-2 rounded-full ${s.color} opacity-70 group-hover:opacity-100 transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Material Inventory */}
      <SectionLabel>Material inventory</SectionLabel>
      <div className="grid grid-cols-3 gap-4 mb-6">

        {/* Inventory value summary */}
        <div className="card p-5">
          <div className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase mb-4">Total inventory value</div>
          <div className="text-3xl font-display font-bold text-stone-800 mb-4">
            {loading ? '—' : fmt$(data.totalInvValue)}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-stone-500">Fabric</span>
              <span className="font-semibold text-stone-700">{loading ? '—' : fmt$(data.fabricValue)}</span>
            </div>
            <div className="h-px bg-stone-100" />
            <div className="flex justify-between text-xs">
              <span className="text-stone-500">Components</span>
              <span className="font-semibold text-stone-700">{loading ? '—' : fmt$(data.componentValue)}</span>
            </div>
            <div className="h-px bg-stone-100" />
            <div className="flex justify-between text-xs">
              <span className="text-stone-500">Blinds</span>
              <span className="text-stone-400">Pending count</span>
            </div>
          </div>
        </div>

        {/* Top fabrics */}
        <div className="card p-5">
          <div className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase mb-3">Top fabrics on hand</div>
          {(data.topFabrics || []).length === 0
            ? <p className="text-xs text-stone-400">No fabric data</p>
            : (data.topFabrics || []).map((f, i) => {
                const rolls = (f.qty_on_hand / 1188).toFixed(1)
                const pct   = Math.round((f.qty_on_hand / topFabricMax) * 100)
                return (
                  <div key={i} className="mb-2">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-stone-600 truncate max-w-[70%]">{f.name}</span>
                      <span className="text-stone-400 ml-1">{rolls} rolls</span>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full">
                      <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
          }
        </div>

        {/* Top components */}
        <div className="card p-5">
          <div className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase mb-3">Top components on hand</div>
          {(data.topComponents || []).length === 0
            ? <p className="text-xs text-stone-400">No component data</p>
            : (data.topComponents || []).map((c, i) => {
                const pct = Math.round((c.qty_on_hand / topCompMax) * 100)
                return (
                  <div key={i} className="mb-2">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-stone-600 truncate max-w-[70%]">{c.name}</span>
                      <span className="text-stone-400 ml-1">{c.qty_on_hand}</span>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full">
                      <div className="h-1.5 rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
          }
        </div>
      </div>
    </div>
  )
}
