import { useNavigate } from 'react-router-dom'

const PRODUCTION = [
  {
    to:    '/ops/production',
    icon:  '▶️',
    title: 'Start Production',
    desc:  'Look up an order, cut fabric, and start production',
    color: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50',
  },
  {
    to:    '/orders/on-hold',
    icon:  '⏸️',
    title: 'Orders on Hold',
    desc:  'View and manage orders waiting on parts or resolution',
    color: 'border-red-200 hover:border-red-400 hover:bg-red-50',
  },
]

const INVENTORY = [
  {
    to:    '/ops/receive',
    icon:  '📥',
    title: 'Receive Stock',
    desc:  'Log incoming parts from a container or PO',
    color: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50',
  },
  {
    to:    '/ops/adjust',
    icon:  '⚖️',
    title: 'Adjust Inventory',
    desc:  'Manual correction for damage, miscounts, returns',
    color: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
  },
  {
    to:    '/ops/transactions',
    icon:  '📋',
    title: 'Transaction Log',
    desc:  'Full history of all inventory movements',
    color: 'border-stone-200 hover:border-stone-400 hover:bg-stone-50',
  },
]

const SUPPLY_CHAIN = [
  {
    to:    '/purchasing',
    icon:  '🛒',
    title: 'Purchasing',
    desc:  'Reorder queue and purchase orders',
    color: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50',
  },
  {
    to:    '/inventory/containers',
    icon:  '🚢',
    title: 'Containers',
    desc:  'Track faux wood containers — pending, in transit, received',
    color: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50',
  },
  {
    to:    '/freight',
    icon:  '🚛',
    title: 'Freight',
    desc:  'Shipping and freight management — coming soon',
    color: 'border-stone-200 hover:border-stone-300 hover:bg-stone-50 opacity-60',
  },
]

function SectionHeader({ label }) {
  return (
    <div className="mb-3 mt-8 first:mt-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{label}</span>
    </div>
  )
}

function ActionCard({ action, navigate }) {
  return (
    <button
      onClick={() => navigate(action.to)}
      className={`card p-5 text-left cursor-pointer border-2 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${action.color}`}
    >
      <div className="text-3xl mb-3">{action.icon}</div>
      <div className="text-base font-display font-bold text-stone-800 mb-1">{action.title}</div>
      <div className="text-xs text-stone-500 leading-relaxed">{action.desc}</div>
    </button>
  )
}

export default function OpsHub() {
  const navigate = useNavigate()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-stone-800">Warehouse</h2>
        <p className="text-stone-400 text-sm mt-0.5">Production, inventory, and supply chain</p>
      </div>

      <SectionHeader label="Production" />
      <div className="grid grid-cols-2 gap-4">
        {PRODUCTION.map(a => <ActionCard key={a.to} action={a} navigate={navigate} />)}
      </div>

      <SectionHeader label="Inventory" />
      <div className="grid grid-cols-3 gap-4">
        {INVENTORY.map(a => <ActionCard key={a.to} action={a} navigate={navigate} />)}
      </div>

      <SectionHeader label="Supply Chain" />
      <div className="grid grid-cols-3 gap-4">
        {SUPPLY_CHAIN.map(a => <ActionCard key={a.to} action={a} navigate={navigate} />)}
      </div>
    </div>
  )
}
