import { STATUS_AGENTE, TIPO_LABEL, fallback } from './statusConfig.js'

export default function AgentList({ agentes = [], loading }) {
  return (
    <section className="panel flex flex-col overflow-hidden" aria-label="Agentes em campo">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <h2 className="panel-title">Agentes em Campo</h2>
        <span className="font-mono text-[10px] text-slate-500">{agentes.length}</span>
      </div>
      <ul className="max-h-80 divide-y divide-white/[0.04] overflow-auto">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="px-5 py-3">
              <div className="h-4 animate-pulse rounded bg-white/5" />
            </li>
          ))}
        {!loading && agentes.length === 0 && (
          <li className="px-5 py-8 text-center text-xs text-slate-500">Nenhum agente cadastrado.</li>
        )}
        {!loading &&
          agentes.map((a) => {
            const st = STATUS_AGENTE[a.status] || fallback
            return (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-fogo-700 font-display text-[11px] text-slate-300">
                  {a.nome
                    .split(' ')
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200">{a.nome}</div>
                  <div className="text-[11px] text-slate-500">{TIPO_LABEL[a.tipo] || a.tipo}</div>
                </div>
                <span className={`flex items-center gap-1.5 font-mono text-[10px] uppercase ${st.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              </li>
            )
          })}
      </ul>
    </section>
  )
}
