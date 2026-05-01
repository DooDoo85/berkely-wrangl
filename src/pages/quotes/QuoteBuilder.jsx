import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

// ─── Product definitions ────────────────────────────────────────────────────
const PRODUCT_GROUPS = [
  {
    group: 'ANABELLE',
    label: 'Anabelle Roller Shades',
    icon: '🌿',
    products: [
      { code: '10100', name: 'Anabelle Cordless Roller Shade',   short: 'Cordless',  mechCode: 'CORDLESS' },
      { code: '10200', name: 'Anabelle Clutch Roller Shade',     short: 'Clutch',    mechCode: null       },
      { code: '10300', name: 'Anabelle Motorized Roller Shade',  short: 'Motorized', mechCode: 'MOTOR'    },
    ],
    fabrics: [
      { id: 'LF',  name: 'Light Filtering Decorative Fabric' },
      { id: 'BO',  name: 'Black Out Decorative Fabric'       },
      { id: 'SC1', name: 'Screen Fabric 1%'                  },
      { id: 'SC3', name: 'Screen Fabric 3%'                  },
      { id: 'SC5', name: 'Screen Fabric 5%'                  },
      { id: 'SC8', name: 'Screen Fabric 8%'                  },
      { id: 'SC10',name: 'Screen Fabric 10%'                 },
      { id: 'SC0', name: 'Screen Fabric 0%'                  },
    ],
    widths:  [12,18,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,78,84,90,96,102,108,114,118],
    heights: [36,42,48,54,60,66,72,78,84,90,96,102,108,114,120,126,132,138,144],
    pricingType: 'anabelle',
  },
  {
    group: 'BERKELY_DESIGNER',
    label: 'Berkely Designer Roller Shades',
    icon: '✨',
    products: [
      { code: '20100', name: 'Designer Cordless Roller Shade USA',   short: 'Cordless',  mechCode: 'CORDLESS' },
      { code: '20200', name: 'Designer Clutch Roller Shade USA',     short: 'Clutch',    mechCode: null       },
      { code: '20300', name: 'Designer Motorized Roller Shade USA',  short: 'Motorized', mechCode: 'MOTOR'    },
    ],
    fabrics: [
      { id: 'LF',  name: 'Light Filtering Decorative Fabric' },
      { id: 'BO',  name: 'Black Out Decorative Fabric'       },
      { id: 'SC1', name: 'Screen Fabric 1%'                  },
      { id: 'SC3', name: 'Screen Fabric 3%'                  },
      { id: 'SC5', name: 'Screen Fabric 5%'                  },
    ],
    widths:  [16,18,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,78,84,90,96],
    heights: [18,24,30,36,42,48,54,60,66,72,78,84,90,96],
    pricingType: 'anabelle', // same price tables as Anabelle
    hasChannel: true,
    hemBarOptions: ['INTERNAL HEM BAR'],
  },
  {
    group: 'BERKELY_EXPRESS',
    label: 'Berkely Express Roller Shades',
    icon: '⚡',
    products: [
      { code: '30100', name: 'Berkely Express Cordless Roller Shade',  short: 'Cordless',  mechCode: 'CORDLESS' },
      { code: '30200', name: 'Berkely Express Clutch Roller Shade',    short: 'Clutch',    mechCode: null       },
      { code: '30300', name: 'Berkely Express Motorized Roller Shade', short: 'Motorized', mechCode: 'MOTOR'    },
    ],
    fabrics: [
      { id: 'BX', name: 'Berkely Express' },
    ],
    widths:  [16,18,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,78,84,90,96,102,108,115,118],
    heights: [18,24,30,36,42,48,54,60,66,72,78,84,90,96,102,108,120],
    pricingType: 'express',
    hasExtensionPole: true,
    hemBarOptions: ['INTERNAL HEMBAR'],
  },
]

// Flat list for backward compat
const PRODUCTS = PRODUCT_GROUPS.flatMap(g => g.products.map(p => ({ ...p, group: g.group })))

const TOP_TREATMENTS = [
  { value: 'OPEN_ROLL',               label: 'Open Roll',                          pg: 'G1', addon: false },
  { value: '3_CURVED_CASSETTE',        label: '3" Curved Cassette',                 pg: 'G2', addon: false },
  { value: '3_CURVED_CASSETTE_FABRIC', label: '3" Curved Cassette w/ Fabric Insert',pg: 'G2', addon: true  },
  { value: '3_FLAT_FASCIA',            label: '3" Flat Fascia',                     pg: 'G2', addon: false },
  { value: '4_FLAT_FASCIA',            label: '4" Flat Fascia',                     pg: 'G2', addon: false },
  { value: '4_CURVED_CASSETTE',        label: '4" Curved Cassette',                 pg: 'G3', addon: false },
  { value: '3_SQUARE_CASSETTE',        label: '3" Square Cassette',                 pg: 'G3', addon: false },
  { value: '3_SQUARE_CASSETTE_FABRIC', label: '3" Square Cassette w/ Fabric Insert',pg: 'G3', addon: true  },
]

const MOTORS = [
  { value: 'MOTOR_BOFU_ELEGANCE',  label: 'Bofu Elegance Rechargeable Remote Motor',    price: 250 },
  { value: 'MOTOR_ROLLEASE_BASIC', label: 'Rollease Basic Rechargeable Remote Motor',   price: 220 },
  { value: 'MOTOR_ROLLEASE_DC',    label: 'Rollease 12V DC Remote Motor',               price: 400 },
]

const REMOTES = [
  { value: 'NONE',          label: 'None (Motor Included)' },
  { value: 'SINGLE_CH',     label: 'Single Channel Remote' },
  { value: 'MULTI_CH',      label: 'Multi-Channel Remote' },
]

const WIDTHS  = [12,18,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,78,84,90,96,102,108,114,120]
const HEIGHTS = [12,18,24,30,36,42,48,54,60,66,72,78,84,90,96,102,108]

const TREATMENT_COLORS = ['WHITE','IVORY','BRONZE','BLACK','SILVER']
const HEM_COLORS       = ['WHITE','IVORY','BRONZE','BLACK','SILVER']

const DEFAULT_CONFIG = {
  quantity: 1,
  color: '',
  color_number: '',
  room_location: '',
  width: '',
  height: '',
  mount: 'INSIDE MOUNT',
  shade_style: 'SINGLE',
  top_treatment: 'OPEN_ROLL',
  top_treatment_color: 'WHITE',
  fabric_roll_direction: 'STANDARD ROLL',
  control_type: 'REMOTE CONTROL',
  control_location: 'RIGHT',
  motor_type: '',
  remote_needed: 'NONE',
  hem_bar_style: 'UNWRAPPED HEM BAR',
  hem_bar_color: 'WHITE',
  light_block: 'NO',
  wall_switch: false,
  wall_switch_qty: 1,
  power_panel: false,
  power_panel_qty: 1,
  connection_harnesses: false,
  harness_qty: 1,
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = n => n != null ? `$${Number(n).toFixed(2)}` : '—'

export default function QuoteBuilder() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [step, setStep]           = useState(1)  // 1=group 2=product 3=fabric 4=config 5=review
  const [productGroup, setProductGroup] = useState(null)
  const [product, setProduct]     = useState(null)
  const [fabrics, setFabrics]     = useState([])
  const [fabric, setFabric]       = useState(null)
  const [colors, setColors]       = useState([])
  const [config, setConfig]       = useState(DEFAULT_CONFIG)
  const [lineItems, setLineItems] = useState([])
  const [header, setHeader]     = useState({ customer_name: '', customer_email: '', sales_rep: profile?.email || '', notes: '' })
  const [price, setPrice]       = useState({ msrp: null, mechanism: null, addons: [], total: null, loading: false, noData: false })
  const [saving, setSaving]     = useState(false)
  const [errors, setErrors]     = useState([])

  // Load fabrics when product changes
  useEffect(() => {
    if (!product) return
    loadFabrics()
  }, [product])

  // Load colors when fabric changes
  useEffect(() => {
    if (!fabric) return
    loadColors()
  }, [fabric])

  // Recalc price when config/product changes
  useEffect(() => {
    if (step === 3 && product && config.width && config.height) {
      calcPrice()
    }
  }, [config.width, config.height, config.top_treatment, config.motor_type,
      config.light_block, config.wall_switch, config.wall_switch_qty,
      config.power_panel, config.power_panel_qty, config.connection_harnesses,
      config.harness_qty, config.quantity, step])

  const loadColors = async () => {
    const { data } = await supabase
      .from('fabric_colors')
      .select('color_name')
      .eq('product_group', productGroup?.group || 'ANABELLE')
      .eq('fabric_type', fabric.name.toUpperCase())
      .eq('active', true)
      .order('sort_order')
    setColors(data?.map(d => d.color_name) || [])
    setConfig(c => ({ ...c, color: '' }))
  }

  const loadFabrics = async () => {
    if (productGroup) {
      setFabrics(productGroup.fabrics)
    }
  }

  const calcPrice = useCallback(async () => {
    setPrice(p => ({ ...p, loading: true }))
    try {
      const treatment = TOP_TREATMENTS.find(t => t.value === config.top_treatment)
      const w = parseFloat(config.width)
      const h = parseFloat(config.height)
      const qty = parseInt(config.quantity) || 1
      const isExpress = productGroup?.pricingType === 'express'

      let msrp = null
      const addons = []

      if (isExpress) {
        // Express: base price from BERKELY_RS_MSRP_A (width x height)
        const { data: baseRows } = await supabase
          .from('price_matrix')
          .select('price')
          .eq('table_name', 'BERKELY_RS_MSRP_A')
          .gte('width', w).gte('height', h)
          .order('width', { ascending: true }).order('height', { ascending: true })
          .limit(1)
        if (!baseRows?.length) {
          setPrice({ msrp: null, mechanism: null, addons: [], total: null, loading: false, noData: true })
          return
        }
        msrp = baseRows[0].price

        // Top treatment add-on for Express cassettes
        if (config.top_treatment !== 'OPEN_ROLL') {
          const { data: tt } = await supabase.from('price_matrix').select('price')
            .eq('table_name', 'ANAB_DESIGN_TOP_TRMTS_2026')
            .gte('width', w).order('width', { ascending: true }).limit(1)
          if (tt?.[0]) addons.push({ label: 'Top Treatment', amount: tt[0].price })
        }

        // Extension pole
        if (config.extension_pole) addons.push({ label: 'Extension Pole', amount: 60 })

      } else {
        // Anabelle / Designer: base price from G1/G2/G3
        const baseTable = `ANAB_DESIGN_${treatment?.pg || 'G1'}_2026`
        const { data: baseRows } = await supabase
          .from('price_matrix').select('price')
          .eq('table_name', baseTable)
          .gte('width', w).gte('height', h)
          .order('width', { ascending: true }).order('height', { ascending: true })
          .limit(1)
        if (!baseRows?.length) {
          setPrice({ msrp: null, mechanism: null, addons: [], total: null, loading: false, noData: true })
          return
        }
        msrp = baseRows[0].price

        // Fabric insert addon
        if (treatment?.addon) {
          const { data: ai } = await supabase.from('price_matrix').select('price')
            .eq('table_name', 'ANAB_DESIGN_TOP_TRMTS_2026')
            .gte('width', w).order('width', { ascending: true }).limit(1)
          if (ai?.[0]) addons.push({ label: 'Fabric Insert', amount: ai[0].price })
        }
      }

      // Side channels (both product lines)
      if (config.light_block === 'SIDE_CHANNELS') {
        const { data: si } = await supabase.from('price_matrix').select('price')
          .eq('table_name', 'ANAB_SIDE_CH_2026')
          .gte('height', h).order('height', { ascending: true }).limit(1)
        if (si?.[0]) addons.push({ label: 'Side Channels', amount: si[0].price })
      }

      // Sill (both product lines)
      if (config.light_block === 'SILL') {
        const { data: sl } = await supabase.from('price_matrix').select('price')
          .eq('table_name', 'ANAB_SILL_2026')
          .gte('width', w).order('width', { ascending: true }).limit(1)
        if (sl?.[0]) addons.push({ label: 'Sill Light Block', amount: sl[0].price })
      }

      // Mechanism
      let mech = null
      const pCode = product?.code
      if (['10100','20100','30100'].includes(pCode)) {
        mech = { label: 'Cordless Mechanism', amount: 135 }
      } else if (['10300','20300','30300'].includes(pCode) && config.motor_type) {
        const m = MOTORS.find(x => x.value === config.motor_type)
        if (m) {
          mech = { label: m.label, amount: m.price }
          if (config.motor_type === 'MOTOR_ROLLEASE_DC') {
            if (config.wall_switch && config.wall_switch_qty > 0)
              addons.push({ label: `Wall RF Switch ×${config.wall_switch_qty}`, amount: 115 * config.wall_switch_qty })
            if (config.power_panel && config.power_panel_qty > 0)
              addons.push({ label: `DC Power Panel ×${config.power_panel_qty}`, amount: 700 * config.power_panel_qty })
            if (config.connection_harnesses && config.harness_qty > 0)
              addons.push({ label: `DC Harness ×${config.harness_qty}`, amount: 35 * config.harness_qty })
          }
        }
      }

      const unitPrice = msrp + (mech?.amount || 0) + addons.reduce((s, a) => s + a.amount, 0)
      setPrice({ msrp, mechanism: mech, addons, total: unitPrice * qty, loading: false, noData: false })
    } catch (e) {
      console.error(e)
      setPrice({ msrp: null, mechanism: null, addons: [], total: null, loading: false, noData: true })
    }
  }, [config, product, productGroup])

  const cfg = (field, val) => setConfig(c => ({ ...c, [field]: val }))

  const validateConfig = () => {
    const errs = []
    if (!config.width)   errs.push('Width is required')
    if (!config.height)  errs.push('Height is required')
    if (!config.color)   errs.push('Color is required')
    if (product?.code === '10300' && !config.motor_type) errs.push('Motor Type is required')
    return errs
  }

  const addLine = () => {
    const errs = validateConfig()
    if (errs.length) { setErrors(errs); return }
    setErrors([])
    setLineItems(prev => [...prev, {
      id: Date.now(),
      product_code: product.code,
      product_name: product.name,
      product_group: productGroup?.group,
      fabric_name: fabric?.name || '',
      ...config,
      price_detail: { ...price },
      line_total: price.total || 0,
    }])
    // Reset for next item
    setStep(1); setProductGroup(null); setProduct(null); setFabric(null); setConfig(DEFAULT_CONFIG)
    setPrice({ msrp: null, mechanism: null, addons: [], total: null, loading: false, noData: false })
  }

  const removeLine = (id) => setLineItems(prev => prev.filter(i => i.id !== id))

  const subtotal = lineItems.reduce((s, i) => s + (i.line_total || 0), 0)

  const saveQuote = async () => {
    if (!lineItems.length) return
    setSaving(true)
    const { data, error } = await supabase.from('quotes').insert({
      customer_name:  header.customer_name,
      customer_email: header.customer_email,
      sales_rep:      header.sales_rep || profile?.email,
      notes:          header.notes,
      line_items:     lineItems,
      subtotal,
      status: 'draft',
    }).select().single()
    setSaving(false)
    if (!error && data) navigate(`/quotes/${data.id}`)
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-6">
      {['Product','Fabric','Configure','Review'].map((s, i) => {
        const n = i + 1
        const active  = step === n || (n === 4 && step === 5)
        const done    = step > n
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2
                ${active ? 'border-blue-600 bg-blue-50 text-blue-600'
                  : done  ? 'border-green-500 bg-green-50 text-green-600'
                  : 'border-gray-300 text-gray-400'}`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'}`}>{s}</span>
            </div>
            {i < 3 && <div className={`w-6 h-px ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </div>
        )
      })}
    </div>
  )

  const PricePanel = () => (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm sticky top-4">
      <div className="bg-green-700 text-white text-xs font-bold px-3 py-2">Price Detail</div>
      <div className="p-3 space-y-1 text-sm">
        {price.noData ? (
          <div className="text-amber-600 text-xs py-2">
            ⚠️ Price tables not imported yet.<br />
            Go to <a href="/inventory/price-grids" className="underline">Inventory → Price Grids</a> to import.
          </div>
        ) : price.loading ? (
          <div className="text-gray-400 text-xs py-2">Calculating…</div>
        ) : !config.width || !config.height ? (
          <div className="text-gray-400 text-xs py-2">Enter width & height to see pricing.</div>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-gray-600">MSRP PG1</span>
              <span className="font-medium">{fmt(price.msrp)}</span>
            </div>
            {price.mechanism && (
              <div className="flex justify-between">
                <span className="text-gray-600 truncate pr-2 max-w-[160px]" title={price.mechanism.label}>{price.mechanism.label}</span>
                <span className="font-medium">{fmt(price.mechanism.amount)}</span>
              </div>
            )}
            {price.addons.map((a, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-600 truncate pr-2 max-w-[160px]" title={a.label}>{a.label}</span>
                <span className="font-medium">{fmt(a.amount)}</span>
              </div>
            ))}
            {config.quantity > 1 && (
              <div className="text-xs text-gray-400 pt-1 border-t">Qty: {config.quantity}</div>
            )}
            <div className="flex justify-between font-bold pt-2 border-t border-gray-200 text-base">
              <span>Total</span>
              <span>{fmt(price.total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // ─── Steps ──────────────────────────────────────────────────────────────────

  // Step 1: Select product group + product
  if (step === 1) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">New Quote</h1>
        <p className="text-sm text-gray-500">Select a product line to get started.</p>
      </div>

      {lineItems.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
          <span className="font-medium text-blue-800">{lineItems.length} line{lineItems.length > 1 ? 's' : ''} added.</span>
          <span className="text-blue-600"> Add more or </span>
          <button onClick={() => setStep(5)} className="text-blue-700 font-medium underline">review & save →</button>
        </div>
      )}

      <StepIndicator />

      <div className="space-y-4">
        {PRODUCT_GROUPS.map(pg => (
          <div key={pg.group} className="border-2 border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 flex items-center gap-2 border-b border-gray-200">
              <span className="text-xl">{pg.icon}</span>
              <span className="font-bold text-gray-800">{pg.label}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 p-3">
              {pg.products.map(p => (
                <button key={p.code}
                  onClick={() => { setProductGroup(pg); setProduct(p); setStep(2) }}
                  className="border-2 border-gray-200 rounded-lg p-3 text-left hover:border-blue-400 hover:bg-blue-50 transition-all group">
                  <div className="font-semibold text-sm text-gray-900 group-hover:text-blue-700">{p.short}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{p.name}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // Step 2: Select fabric
  if (step === 2) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <button onClick={() => setStep(1)} className="text-sm text-blue-600 hover:underline mb-2">← Back</button>
        <h1 className="text-xl font-bold text-gray-900">{product.name}</h1>
        <p className="text-sm text-gray-500">Select a fabric / pattern</p>
      </div>
      <StepIndicator />
      <div className="grid grid-cols-1 gap-2">
        {(productGroup?.fabrics || []).map(f => (
          <button
            key={f.id}
            onClick={() => { setFabric(f); setStep(3) }}
            className={`border-2 rounded-lg px-4 py-3 text-left text-sm flex justify-between items-center transition-all
              ${fabric?.id === f.id ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
          >
            <span className="font-medium">{f.name}</span>
          </button>
        ))}
      </div>
    </div>
  )

  // Step 3: Configuration
  if (step === 3) return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <button onClick={() => setStep(2)} className="text-sm text-blue-600 hover:underline mb-1">← Back</button>
        <h1 className="text-lg font-bold text-gray-900">{product.name}</h1>
        <p className="text-sm text-gray-500">{fabric?.name}</p>
      </div>
      <StepIndicator />

      {errors.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="text-red-700 text-xs font-bold mb-1">Errors</div>
          {errors.map((e, i) => <div key={i} className="text-red-600 text-xs">• {e}</div>)}
        </div>
      )}

      <div className="flex gap-5">
        <div className="flex-1 space-y-4">

          {/* Quantity + Color */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <Row label="Quantity">
              <input type="number" min="1" value={config.quantity}
                onChange={e => cfg('quantity', e.target.value)}
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm" />
            </Row>
            <Row label="Color">
              {colors.length > 0 ? (
                <select value={config.color} onChange={e => cfg('color', e.target.value)}
                  className={`flex-1 border rounded px-2 py-1 text-sm ${!config.color ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
                  <option value="">Select color…</option>
                  {colors.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input type="text" placeholder="Color name"
                  value={config.color} onChange={e => cfg('color', e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm" />
              )}
            </Row>
            <Row label="Color Number">
              <input type="text" placeholder="e.g. BD-10110"
                value={config.color_number} onChange={e => cfg('color_number', e.target.value)}
                className="w-32 border border-gray-300 rounded px-2 py-1 text-sm" />
            </Row>
            <Row label="Room Location">
              <input type="text" placeholder="Optional"
                value={config.room_location} onChange={e => cfg('room_location', e.target.value)}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm" />
            </Row>
          </div>

          {/* Dimensions */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Dimensions</div>
            <Row label="Width">
              <select value={config.width} onChange={e => cfg('width', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm w-24">
                <option value="">Select</option>
                {(productGroup?.widths || []).map(w => <option key={w} value={w}>{w}"</option>)}
              </select>
            </Row>
            <Row label="Height">
              <select value={config.height} onChange={e => cfg('height', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm w-24">
                <option value="">Select</option>
                {(productGroup?.heights || []).map(h => <option key={h} value={h}>{h}"</option>)}
              </select>
            </Row>
            <Row label="Mount">
              <select value={config.mount} onChange={e => cfg('mount', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm">
                <option>INSIDE MOUNT</option>
                <option>OUTSIDE MOUNT</option>
              </select>
            </Row>
            <Row label="Shade Style">
              <select value={config.shade_style} onChange={e => cfg('shade_style', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm">
                <option>SINGLE</option>
              </select>
            </Row>
          </div>

          {/* Top Treatment */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Top Treatment</div>
            <Row label="Top Treatment">
              <select value={config.top_treatment} onChange={e => cfg('top_treatment', e.target.value)}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm">
                {TOP_TREATMENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Row>
            <Row label="Treatment Color">
              <select value={config.top_treatment_color} onChange={e => cfg('top_treatment_color', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm">
                {TREATMENT_COLORS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Row>
            <Row label="Fabric Roll Direction">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="frd" value="STANDARD ROLL"
                  checked={config.fabric_roll_direction === 'STANDARD ROLL'}
                  onChange={() => cfg('fabric_roll_direction', 'STANDARD ROLL')} />
                Standard Roll
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer ml-4">
                <input type="radio" name="frd" value="REVERSE ROLL"
                  checked={config.fabric_roll_direction === 'REVERSE ROLL'}
                  onChange={() => cfg('fabric_roll_direction', 'REVERSE ROLL')} />
                Reverse Roll
              </label>
            </Row>
          </div>

          {/* Motor options */}
          {['10300','20300','30300'].includes(product.code) && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Motor Options</div>
              <Row label="Control Type">
                <select value={config.control_type} onChange={e => cfg('control_type', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm">
                  <option>REMOTE CONTROL</option>
                </select>
              </Row>
              <Row label="Control Location">
                <select value={config.control_location} onChange={e => cfg('control_location', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm">
                  <option>RIGHT</option><option>LEFT</option>
                </select>
              </Row>
              <Row label="Motor Type">
                <select value={config.motor_type} onChange={e => cfg('motor_type', e.target.value)}
                  className={`flex-1 border rounded px-2 py-1 text-sm ${!config.motor_type ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}>
                  <option value="">PLEASE SELECT</option>
                  {MOTORS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Row>
              <Row label="Remote Needed">
                <select value={config.remote_needed} onChange={e => cfg('remote_needed', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm">
                  {REMOTES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Row>
              {config.motor_type === 'MOTOR_ROLLEASE_DC' && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-medium text-gray-600">DC Accessories</div>
                  <Row label="Wall RF Switch (5 CH)?">
                    <input type="checkbox" checked={config.wall_switch} onChange={e => cfg('wall_switch', e.target.checked)} />
                    {config.wall_switch && (
                      <div className="flex items-center gap-1 ml-3">
                        <span className="text-xs text-gray-500">Qty</span>
                        <input type="number" min="1" value={config.wall_switch_qty}
                          onChange={e => cfg('wall_switch_qty', parseInt(e.target.value) || 1)}
                          className="w-14 border border-gray-300 rounded px-2 py-0.5 text-sm" />
                      </div>
                    )}
                  </Row>
                  <Row label="DC Power Panel (18CH)?">
                    <input type="checkbox" checked={config.power_panel} onChange={e => cfg('power_panel', e.target.checked)} />
                    {config.power_panel && (
                      <div className="flex items-center gap-1 ml-3">
                        <span className="text-xs text-gray-500">Qty</span>
                        <input type="number" min="1" value={config.power_panel_qty}
                          onChange={e => cfg('power_panel_qty', parseInt(e.target.value) || 1)}
                          className="w-14 border border-gray-300 rounded px-2 py-0.5 text-sm" />
                      </div>
                    )}
                  </Row>
                  <Row label="DC Harnesses?">
                    <input type="checkbox" checked={config.connection_harnesses} onChange={e => cfg('connection_harnesses', e.target.checked)} />
                    {config.connection_harnesses && (
                      <div className="flex items-center gap-1 ml-3">
                        <span className="text-xs text-gray-500">Qty</span>
                        <input type="number" min="1" value={config.harness_qty}
                          onChange={e => cfg('harness_qty', parseInt(e.target.value) || 1)}
                          className="w-14 border border-gray-300 rounded px-2 py-0.5 text-sm" />
                      </div>
                    )}
                  </Row>
                </div>
              )}
            </div>
          )}

          {/* Finishing */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Finishing</div>
            <Row label="Hem Bar Style">
              <select value={config.hem_bar_style} onChange={e => cfg('hem_bar_style', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm">
                {(productGroup?.hemBarOptions || ['UNWRAPPED HEM BAR','WRAPPED HEM BAR']).map(o => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Row>
            <Row label="Hem Bar Color">
              <select value={config.hem_bar_color} onChange={e => cfg('hem_bar_color', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm">
                {HEM_COLORS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Row>
            <Row label="Light Block">
              <select value={config.light_block} onChange={e => cfg('light_block', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm">
                <option value="NO">No</option>
                <option value="SIDE_CHANNELS">Side Channels</option>
                <option value="SILL">Sill</option>
                <option value="BOTH">Both</option>
              </select>
            </Row>
            {productGroup?.hasChannel && (
              <Row label="Channel">
                <select value={config.channel || 'NO'} onChange={e => cfg('channel', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm">
                  <option>NO</option><option>YES</option>
                </select>
              </Row>
            )}
            {productGroup?.hasExtensionPole && (
              <Row label="Extension Pole?">
                <input type="checkbox" checked={!!config.extension_pole}
                  onChange={e => cfg('extension_pole', e.target.checked)} />
                <span className="text-xs text-gray-500 ml-2">+$60.00</span>
              </Row>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={addLine}
              className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 text-sm">
              Add to Quote →
            </button>
            {lineItems.length > 0 && (
              <button onClick={() => setStep(5)}
                className="px-4 bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-700 text-sm">
                Review ({lineItems.length}) →
              </button>
            )}
          </div>
        </div>

        <div className="w-52 flex-shrink-0">
          <PricePanel />
        </div>
      </div>
    </div>
  )

  // Step 5: Review & Save
  if (step === 5) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <button onClick={() => setStep(1)} className="text-sm text-blue-600 hover:underline mb-1">← Add more items</button>
        <h1 className="text-xl font-bold text-gray-900">Review Quote</h1>
      </div>

      {/* Quote header */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name</label>
          <input value={header.customer_name} onChange={e => setHeader(h => ({ ...h, customer_name: e.target.value }))}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="Customer / Company" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Customer Email</label>
          <input value={header.customer_email} onChange={e => setHeader(h => ({ ...h, customer_email: e.target.value }))}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="customer@email.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sales Rep</label>
          <input value={header.sales_rep} onChange={e => setHeader(h => ({ ...h, sales_rep: e.target.value }))}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <input value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="Optional notes" />
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Fabric</th>
              <th className="px-3 py-2 text-left">Size</th>
              <th className="px-3 py-2 text-left">Treatment</th>
              <th className="px-3 py-2 text-center">Qty</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, i) => {
              const t = TOP_TREATMENTS.find(x => x.value === item.top_treatment)
              return (
                <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {PRODUCTS.find(p => p.code === item.product_code)?.short}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{item.fabric_name}</td>
                  <td className="px-3 py-2 text-gray-600">{item.width}" × {item.height}"</td>
                  <td className="px-3 py-2 text-gray-600">{t?.label || item.top_treatment}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(item.line_total)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeLine(item.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right font-bold text-gray-700">Subtotal</td>
              <td className="px-3 py-2 text-right font-bold text-lg">{fmt(subtotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex gap-3">
        <button onClick={saveQuote} disabled={saving || !lineItems.length}
          className="bg-green-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">
          {saving ? 'Saving…' : '💾 Save Quote'}
        </button>
        <button onClick={() => setStep(1)}
          className="border border-gray-300 text-gray-700 font-medium px-5 py-2.5 rounded-lg hover:bg-gray-50 text-sm">
          + Add Item
        </button>
      </div>
    </div>
  )

  return null
}

// ─── Layout helper ─────────────────────────────────────────────────────────
function Row({ label, children }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-40 text-xs font-medium text-gray-600 pt-1.5 flex-shrink-0">{label}</label>
      <div className="flex items-center gap-2 flex-1">{children}</div>
    </div>
  )
}
