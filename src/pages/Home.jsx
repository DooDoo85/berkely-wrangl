import { useAuth } from '../components/AuthProvider'

function StatCard({ label, value, sub, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`card p-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150' : ''}`}
    >
      <div className="text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase mb-3">
        {label}
      </div>
      <div className={`text-3xl font-display font-bold mb-1.5 ${accent || 'text-stone-800'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-stone-400">{sub}</div>}
    </div>
  )
}

function ComingSoonCard({ icon, title, description }) {
  return (
    <div className="card p-5 border-dashed opacity-60">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm font-semibold text-stone-600 mb-1">{title}</div>
      <div className="text-xs text-stone-400">{description}</div>
    </div>
  )
}

export default function Home() {
  const { profile } = useAuth()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = profile?.full_name?.split(' ')[0] || profile?.email?.split('@')[0] || 'there'
  const emoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙'

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Greeting */}
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-stone-800">
          {greeting}, {name} {emoji}
        </h2>
        <p className="text-stone-400 text-sm mt-1">
          Here's what's happening at Berkely Distribution today.
        </p>
      </div>

      {/* KPI Row — placeholder until data is wired */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Customers"
          value="—"
          sub="Loading..."
          accent="text-stone-800"
        />
        <StatCard
          label="Open Orders"
          value="—"
          sub="Loading..."
          accent="text-stone-800"
        />
        <StatCard
          label="Low Stock"
          value="—"
          sub="Loading..."
          accent="text-amber-600"
        />
        <StatCard
          label="In Production"
          value="—"
          sub="Loading..."
          accent="text-brand-light"
        />
      </div>

      {/* Coming soon modules */}
      <div className="mb-6">
        <h3 className="text-xs font-bold tracking-widest text-stone-400 uppercase mb-3">
          Building Now
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <ComingSoonCard
            icon="◎"
            title="Customers"
            description="Customer accounts, contacts, and history — Phase 1"
          />
          <ComingSoonCard
            icon="≡"
            title="Orders"
            description="Full order management with line items — Phase 2"
          />
          <ComingSoonCard
            icon="◈"
            title="Activities"
            description="Calls, notes, and follow-ups — Phase 3"
          />
          <ComingSoonCard
            icon="▦"
            title="Inventory"
            description="Parts, rolls, and stock tracking — Phase 4"
          />
          <ComingSoonCard
            icon="▤"
            title="Pipeline"
            description="Sales pipeline and rep KPIs — Phase 5"
          />
          <ComingSoonCard
            icon="▣"
            title="Reports"
            description="Dashboards and executive reporting — Phase 6"
          />
        </div>
      </div>

      {/* App info */}
      <div className="card p-5 bg-brand-dark border-brand-dark">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand-gold/20 border border-brand-gold/30
                          flex items-center justify-center flex-shrink-0">
            <span className="text-brand-gold font-display font-bold">W</span>
          </div>
          <div>
            <div className="text-white font-semibold text-sm mb-1">Berkely Wrangl — Phase 0</div>
            <div className="text-stone-400 text-xs leading-relaxed">
              Foundation is live. Auth, navigation, and infrastructure are ready.
              Customer management, orders, and inventory are being built now.
              This app will replace ShadeFlow and ShadeTrack over the coming weeks.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
