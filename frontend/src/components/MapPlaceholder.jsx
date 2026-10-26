import { STATUS_EQUIP, TIPO_LABEL, fallback } from './statusConfig.js'

// Mesma bbox usada pelo backend (app/core/geo.py)
const BBOX = { latMin: -22.25, latMax: -22.18, lngMin: -49.98, lngMax: -49.91 }

const project = (lat, lng) => ({
  left: `${((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * 100}%`,
  top: `${((BBOX.latMax - lat) / (BBOX.latMax - BBOX.latMin)) * 100}%`,
})

/**
 * PLACEHOLDER DO MAPA.
 * Este container (#map-container) será substituído por Leaflet/Mapbox.
 * Por enquanto, projeta linearmente lat/lng dentro da bbox de Marília para
 * dar uma prévia tática da distribuição dos ativos.
 */
export default function MapPlaceholder({ equipamentos = [], agentes = [] }) {
  return (
    <section className="panel flex h-full min-h-[420px] flex-col overflow-hidden" aria-label="Mapa tático">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <h2 className="panel-title">Mapa Tático · Marília/SP</h2>
        <span className="rounded border border-ember-500/30 bg-ember-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-ember-400">
          Leaflet / Mapbox — em breve
        </span>
      </div>

      <div id="map-container" className="grid-bg relative flex-1 overflow-hidden bg-fogo-900">
        {/* Varredura de radar */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[140%] -translate-x-1/2 -translate-y-1/2">
          <div
            className="h-full w-full animate-sweep rounded-full"
            style={{ background: 'conic-gradient(from 0deg, rgba(34,229,255,.18), transparent 25%)' }}
          />
        </div>
        {/* Anéis concêntricos */}
        {[25, 50, 75].map((s) => (
          <div
            key={s}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neon-cyan/10"
            style={{ width: `${s}%`, aspectRatio: '1' }}
          />
        ))}
        {/* Scanline */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-transparent via-neon-cyan/5 to-transparent" />

        {/* Equipamentos */}
        {equipamentos.map((e) => {
          const st = STATUS_EQUIP[e.status] || fallback
          return (
            <span
              key={e.id}
              title={`${TIPO_LABEL[e.tipo] || e.tipo} · ${e.bairro ?? ''} · ${st.label}`}
              className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${st.dot} opacity-80 transition-transform hover:z-10 hover:scale-[3]`}
              style={project(e.latitude, e.longitude)}
            />
          )
        })}

        {/* Agentes */}
        {agentes
          .filter((a) => a.latitude != null)
          .map((a) => (
            <span
              key={a.id}
              title={`${a.nome} · ${TIPO_LABEL[a.tipo] || a.tipo}`}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-neon-magenta bg-neon-magenta/30 shadow-[0_0_10px_rgba(255,43,214,.7)]"
              style={project(a.latitude, a.longitude)}
            />
          ))}

        {equipamentos.length === 0 && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center font-mono text-xs text-slate-500">
              <div className="text-4xl text-neon-cyan/40">◎</div>
              <p className="mt-3">Nenhum ativo carregado.</p>
              <p className="mt-1 text-slate-600">
                Execute o <span className="text-ember-400">mock_generator.py</span> para popular o banco.
              </p>
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md bg-fogo-950/80 px-3 py-2 font-mono text-[10px] backdrop-blur">
          {Object.entries(STATUS_EQUIP).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-slate-400">
              <span className={`h-2 w-2 rounded-full ${v.dot}`} />
              {v.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2 w-2 rotate-45 bg-neon-magenta" /> Agente
          </span>
        </div>
        <div className="absolute right-3 top-3 font-mono text-[10px] text-slate-600">
          {BBOX.latMax}, {BBOX.lngMax}
        </div>
      </div>
    </section>
  )
}
