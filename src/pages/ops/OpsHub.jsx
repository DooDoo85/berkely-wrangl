import { useNavigate } from 'react-router-dom'

const ACTIONS = [
  {
    to:    '/ops/receive',
    icon:  '📥',
    title: 'Receive Stock',
    desc:  'Log incoming parts from a container or PO',
    color: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50',
    badge: 'emerald',
  },
  {
    to:    '/ops/commit',
    icon:  '✂️',
    title: 'Commit Material',
    desc:  'Log fabric or parts used for an order',
    color: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50',
    badge: 'amber',
  },
  {
    to:    '/ops/adjust',
    icon:  '⚖️',
    title: 'Adjust Inventory',
    desc:  'Manual correction for damage, miscounts, returns',
    color: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
    badge: 'blue',
  },
  {
    to:    '/ops/log',
    icon:  '📋',
    title: 'Transaction Log',
    desc:  'Full history of all inventory movements',
    color: 'border-stone-200 hover:border-stone-400 hover:bg-stone-50',
    badge: 'stone',
  },
]

export default function OpsHub() {
  const navigate = useNavigate()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-stone-800">Operations</h2>
        <p className="text-stone-400 text-sm mt-1">Inventory management — receive, commit, and adjust stock</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {ACTIONS.map(action => (
          <button
            key={action.to}
            onClick={() => navigate(action.to)}
            className={`card p-6 text-left cursor-pointer border-2 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${action.color}`}
          >
            <div className="text-4xl mb-4">{action.icon}</div>
            <div className="text-lg font-display font-bold text-stone-800 mb-2">{action.title}</div>
            <div className="text-sm text-stone-500 leading-relaxed">{action.desc}</div>
          </button>
        ))}
      </div>

      {/* Quick tip */}
      <div className="mt-6 card p-4 bg-stone-50 border-dashed">
        <div className="flex items-start gap-3">
          <span className="text-lg">💡</span>
          <div className="text-sm text-stone-500 leading-relaxed">
            <strong className="text-stone-700">Keyboard tip:</strong> Use Tab to move between fields and Enter to submit.
            All forms are designed for fast keyboard entry.
          </div>
        </div>
      </div>
    </div>
  )
}
