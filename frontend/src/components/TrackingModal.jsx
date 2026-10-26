import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { STATUS_AGENTE, TIPO_LABEL, fallback } from './statusConfig.js'

export default function TrackingModal({ isOpen, onClose, agente }) {
  if (!isOpen || !agente) return null

  const temGps = agente.latitude != null && agente.longitude != null
  const pos = temGps ? [parseFloat(agente.latitude), parseFloat(agente.longitude)] : null
  const st = STATUS_AGENTE[agente.status] || fallback

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-2xl rounded-xl border border-white/10 bg-fogo-800 p-6 shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="min-w-0 pr-4">
            <h3 className="flex items-center gap-2 font-display text-base font-bold tracking-wider text-white truncate">
              <span>📡 Radar de Rastreio:</span>
              <span className="text-neon-cyan truncate">{agente.nome}</span>
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs text-slate-400">
              <span>{TIPO_LABEL[agente.tipo] || agente.tipo}</span>
              <span>·</span>
              <span className={`inline-flex items-center gap-1.5 ${st.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                {st.label}
              </span>
              {temGps && (
                <>
                  <span>·</span>
                  <span className="text-slate-300">
                    GPS: {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-colors shrink-0"
            aria-label="Fechar radar"
          >
            ✕
          </button>
        </div>

        {/* Corpo com Mapa Tático */}
        <div className="mt-5">
          {temGps ? (
            <div className="relative overflow-hidden rounded-lg border border-white/10 shadow-inner">
              <MapContainer
                key={`${agente.id}-${agente.latitude}-${agente.longitude}`}
                center={pos}
                zoom={16}
                scrollWheelZoom
                style={{ height: '320px', width: '100%', background: '#0b0f14' }}
              >
                <TileLayer
                  url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  maxZoom={20}
                />

                {/* Anel de radar externo */}
                <CircleMarker
                  center={pos}
                  radius={18}
                  color="#ff2bd6"
                  weight={1}
                  fillColor="#ff2bd6"
                  fillOpacity={0.12}
                />

                {/* Marcador principal do Agente */}
                <CircleMarker
                  center={pos}
                  radius={8}
                  color="#ff2bd6"
                  weight={2.5}
                  fillColor="#ff2bd6"
                  fillOpacity={0.5}
                >
                  <Popup className="popup-agente">
                    <div className="font-mono text-xs leading-relaxed">
                      <div className="font-semibold text-neon-magenta">{agente.nome}</div>
                      <div>{TIPO_LABEL[agente.tipo] || agente.tipo}</div>
                      <div className="mt-1 text-[11px] text-slate-300">
                        Status: <span className={st.text}>{st.label}</span>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              </MapContainer>
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-white/5 bg-fogo-900/50 p-6 text-center font-mono text-sm text-slate-400">
              <span className="text-3xl text-slate-600 mb-2">⚠</span>
              <p>Sinal GPS não disponível para este operador no momento.</p>
              <p className="mt-1 text-xs text-slate-500">
                O agente pode estar offline ou fora da área de transmissão telemétrica.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="font-mono text-[11px] text-slate-500">
            F.O.G.O. · Telemetria em tempo real
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-700 px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-slate-200 hover:bg-slate-600 transition-colors"
          >
            Fechar Radar
          </button>
        </div>
      </div>
    </div>
  )
}
