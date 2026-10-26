import { Link, useLocation } from 'react-router-dom'

const NAV = [
  { id: 'nav-dashboard', label: 'Dashboard', icon: '◈', active: true, path: '/' },
  { id: 'nav-equipamentos', label: 'Equipamentos', icon: '⌬', active: true, path: '/equipamentos' },
  { id: 'nav-agentes', label: 'Agentes', icon: '◉', active: true, path: '/agentes' },
  { id: 'nav-ocorrencias', label: 'Ocorrências', icon: '⚠', active: true, path: '/ocorrencias' },
  { id: 'nav-relatorios', label: 'Relatórios', icon: '▤', active: true, path: '/relatorios' },
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-white/5 bg-fogo-900/60 px-4 py-6 lg:flex print:hidden">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-ember-400 to-ember-600 text-xl shadow-ember">
          🔥
        </div>
        <div className="font-display text-xs font-bold tracking-[0.3em] text-slate-300">SMART CITY</div>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Navegação principal">
        {NAV.map((item) => {
          const isCurrent = location.pathname === item.path

          if (item.active && item.path) {
            return (
              <Link
                key={item.id}
                id={item.id}
                to={item.path}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                  isCurrent
                    ? 'bg-ember-500/10 text-ember-400 ring-1 ring-ember-500/30'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <span className="w-4 text-center">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
              </Link>
            )
          }

          return (
            <button
              key={item.id}
              id={item.id}
              disabled
              className="group flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-500 hover:bg-white/[0.03] hover:text-slate-300"
            >
              <span className="w-4 text-center">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-500">
                em breve
              </span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-white/5 bg-fogo-800/60 p-3 font-mono text-[10px] leading-relaxed text-slate-500">
        <div className="text-slate-400">MVP v0.1.0</div>
        <div>LAT −22.25 → −22.18</div>
        <div>LNG −49.98 → −49.91</div>
      </div>
    </aside>
  )
}
