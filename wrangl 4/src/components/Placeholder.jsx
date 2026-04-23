export default function Placeholder({ title, description, icon }) {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4">{icon || '◌'}</div>
        <h2 className="text-xl font-display font-bold text-stone-700 mb-2">{title}</h2>
        <p className="text-stone-400 text-sm max-w-sm mx-auto">{description}</p>
        <div className="mt-6 inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/20
                        text-brand-gold text-xs font-semibold px-4 py-2 rounded-full">
          Coming in the next phase
        </div>
      </div>
    </div>
  )
}
