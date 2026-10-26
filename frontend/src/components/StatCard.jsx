const ACCENTS = {
  ember: 'from-ember-500/20 text-ember-400',
  cyan: 'from-neon-cyan/15 text-neon-cyan',
  lime: 'from-neon-lime/15 text-neon-lime',
  red: 'from-neon-red/15 text-neon-red',
  magenta: 'from-neon-magenta/15 text-neon-magenta',
  amber: 'from-neon-amber/15 text-neon-amber',
}

export default function StatCard({ id, label, value, hint, accent = 'cyan', loading, delay = 0, onClick }) {
  return (
    <div
      id={id}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick(e) : undefined}
      className={`panel group animate-fade-up overflow-hidden p-5 transition-all duration-300 break-inside-avoid ${
        onClick
          ? 'cursor-pointer hover:scale-105 hover:border-white/20 hover:-translate-y-1 hover:ring-1 hover:ring-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]'
          : 'hover:-translate-y-0.5'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-60 transition-opacity group-hover:opacity-100 ${ACCENTS[accent]}`}
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="panel-title">{label}</div>
          {onClick && (
            <span className="font-mono text-[10px] text-slate-500 transition-colors group-hover:text-neon-red">
              VER ↗
            </span>
          )}
        </div>
        <div className={`mt-3 font-display text-4xl font-bold ${ACCENTS[accent].split(' ')[1]}`}>
          {loading ? <span className="inline-block h-9 w-20 animate-pulse rounded bg-white/10" /> : value}
        </div>
        {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  )
}
