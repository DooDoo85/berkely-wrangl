import { useNavigate } from 'react-router-dom'

const REPORTS = [
  {
    to:    '/reports/production',
    icon:  '📦',
    title: 'Production Dashboard',
    desc:  'Orders shipped WTD / MTD, in production counts',
    color: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50',
  },
  {
    to:    '/reports/orders',
    icon:  '📊',
    title: 'Order Status',
    desc:  'Counts by status, bottleneck detection (5+ days)',
    color: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50',
  },
  {
    to:    '/reports/inventory',
    icon:  '📉',
    title: 'Inventory Health',
    desc:  'Out of stock, low stock, critical items list',
    color: 'border-red-200 hover:border-red-400 hover:bg-red-50',
  },
  {
    to:    '/reports/reps',
    icon:  '👤',
    title: 'Sales Rep Activity',
    desc:  'Orders by rep, activity counts, customer coverage',
    color: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
  },
]

export default function ReportsHub() {
  const navigate = useNavigate()
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-stone-800">Reports</h2>
        <p className="text-stone-400 text-sm mt-1">Daily operational visibility</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {REPORTS.map(r => (
          <button key={r.to} onClick={() => navigate(r.to)}
            className={`card p-6 text-left cursor-pointer border-2 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${r.color}`}>
            <div className="text-4xl mb-4">{r.icon}</div>
            <div className="text-lg font-display font-bold text-stone-800 mb-2">{r.title}</div>
            <div className="text-sm text-stone-500 leading-relaxed">{r.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
