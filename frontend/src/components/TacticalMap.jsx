import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { STATUS_EQUIP, TIPO_LABEL } from './statusConfig.js'

const CENTRO = [-22.2139, -49.9458]
const ZOOM = 13

const COR_STATUS = {
  OPERANTE: '#a3ff12',
  ALERTA: '#ffc531',
  EM_MANUTENCAO: '#22e5ff',
  INOPERANTE: '#ff3b5c',
}
const corPorStatus = (status) => COR_STATUS[status] ?? '#ffffff'

const GRAVIDADE_COLOR = {
  CRITICA: 'text-neon-red',
  ALTA: 'text-ember-400',
  MEDIA: 'text-neon-amber',
  BAIXA: 'text-neon-lime',
}

// DivIcon customizado com alerta visual (ping/pulse) para equipamentos inoperantes
const inoperanteDivIcon = L.divIcon({
  className: 'custom-inoperante-pin',
  html: `
    <div class="relative flex items-center justify-center w-6 h-6">
      <span class="absolute inline-flex h-full w-full rounded-full bg-neon-red opacity-80 animate-ping"></span>
      <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-neon-red shadow-[0_0_12px_#ff3b5c] border-2 border-white"></span>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
})

// DivIcon customizado com triângulo de alerta para ocorrências ativas
const ocorrenciaDivIcon = L.divIcon({
  className: 'custom-ocorrencia-pin',
  html: `
    <div class="relative flex items-center justify-center w-7 h-7">
      <span class="absolute inline-flex h-full w-full rounded-full bg-neon-amber opacity-60 animate-ping"></span>
      <div class="relative flex items-center justify-center w-6 h-6 rounded-md bg-fogo-950 border border-neon-amber text-neon-amber shadow-[0_0_12px_rgba(255,197,49,0.5)] text-xs font-bold">
        ⚠️
      </div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
})

/**
 * Componente interno para recalcular dimensões do Leaflet ao alternar Fullscreen
 */
function MapInvalidator({ isFullscreen }) {
  const map = useMap()
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 150)
    return () => clearTimeout(timer)
  }, [isFullscreen, map])
  return null
}

/**
 * Mapa tático real (Leaflet + tiles escuros do CartoDB).
 * Suporte a Fullscreen nativo, marcadores pulsantes para inoperantes e alertas de ocorrências.
 * Suporta filtros de camada interativos para equipamentos, apenas críticos, agentes e ocorrências.
 */
export default function TacticalMap({
  equipamentos = [],
  agentes = [],
  ocorrencias = [],
  mostrarEquipamentos: propMostrarEq,
  setMostrarEquipamentos: propSetMostrarEq,
  mostrarAgentes: propMostrarAg,
  setMostrarAgentes: propSetMostrarAg,
  mostrarOcorrencias: propMostrarOc,
  setMostrarOcorrencias: propSetMostrarOc,
  apenasCriticos: propApenasCriticos,
  setApenasCriticos: propSetApenasCriticos,
}) {
  const mapWrapperRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Fallbacks de estados locais caso o componente seja usado de forma autônoma
  const [internalMostrarEq, setInternalMostrarEq] = useState(true)
  const [internalMostrarAg, setInternalMostrarAg] = useState(true)
  const [internalMostrarOc, setInternalMostrarOc] = useState(true)
  const [internalApenasCriticos, setInternalApenasCriticos] = useState(false)

  const mostrarEquipamentos = propMostrarEq !== undefined ? propMostrarEq : internalMostrarEq
  const setMostrarEquipamentos = propSetMostrarEq || setInternalMostrarEq

  const mostrarAgentes = propMostrarAg !== undefined ? propMostrarAg : internalMostrarAg
  const setMostrarAgentes = propSetMostrarAg || setInternalMostrarAg

  const mostrarOcorrencias = propMostrarOc !== undefined ? propMostrarOc : internalMostrarOc
  const setMostrarOcorrencias = propSetMostrarOc || setInternalMostrarOc

  const apenasCriticos = propApenasCriticos !== undefined ? propApenasCriticos : internalApenasCriticos
  const setApenasCriticos = propSetApenasCriticos || setInternalApenasCriticos

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (mapWrapperRef.current?.requestFullscreen) {
        mapWrapperRef.current.requestFullscreen().catch((err) => {
          console.warn('Erro ao solicitar fullscreen:', err)
        })
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.warn('Erro ao sair do fullscreen:', err)
        })
      }
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  // Filtragem dos equipamentos para o mapa de acordo com os filtros de camada
  const equipamentosFiltrados = useMemo(() => {
    if (!mostrarEquipamentos) return []
    return equipamentos.filter((e) => {
      if (e.latitude == null || e.longitude == null) return false
      if (apenasCriticos) {
        return (
          e.status === 'INOPERANTE' ||
          e.status === 'ALERTA' ||
          e.status === 'EM_MANUTENCAO' ||
          e.status === 'MANUTENCAO'
        )
      }
      return true
    })
  }, [equipamentos, mostrarEquipamentos, apenasCriticos])

  // Filtragem das ocorrências para o mapa
  const ocorrenciasFiltradas = useMemo(() => {
    if (!mostrarOcorrencias) return []
    return ocorrencias.filter(
      (o) => o.latitude != null && o.longitude != null && o.status !== 'RESOLVIDA',
    )
  }, [ocorrencias, mostrarOcorrencias])

  // Filtragem dos agentes para o mapa
  const agentesFiltrados = useMemo(() => {
    if (!mostrarAgentes) return []
    return agentes.filter((a) => a.latitude != null)
  }, [agentes, mostrarAgentes])

  const totalCriticos = useMemo(
    () =>
      equipamentos.filter((e) =>
        ['INOPERANTE', 'ALERTA', 'EM_MANUTENCAO', 'MANUTENCAO'].includes(e.status),
      ).length,
    [equipamentos],
  )

  return (
    <div
      ref={mapWrapperRef}
      className={`flex flex-col overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? 'h-screen w-screen bg-fogo-900 p-4'
          : 'panel h-full min-h-[420px]'
      }`}
      aria-label="Mapa tático"
    >
      {/* Cabeçalho do Mapa Tático */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="panel-title">MAPA TÁTICO · MARÍLIA/SP</h2>
          <span className="font-mono text-[10px] uppercase text-slate-500">
            {equipamentosFiltrados.length}/{equipamentos.length} ativos · {agentesFiltrados.length} agentes · {ocorrenciasFiltradas.length} ocorrências
          </span>
        </div>

        {/* Botão de Fullscreen */}
        <button
          type="button"
          id="btn-toggle-fullscreen"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-400 transition-colors hover:border-neon-cyan/40 hover:bg-neon-cyan/10 hover:text-neon-cyan focus:outline-none focus:ring-1 focus:ring-neon-cyan/50"
          title={isFullscreen ? 'Sair da tela cheia' : 'Modo tela cheia para videowall'}
        >
          <span>{isFullscreen ? '✖' : '⛶'}</span>
          <span>{isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}</span>
        </button>
      </div>

      {/* Container do Mapa Leaflet */}
      <div
        style={{
          height: isFullscreen ? 'calc(100vh - 4rem)' : '100%',
          minHeight: isFullscreen ? undefined : '360px',
        }}
        className="relative flex-1 overflow-hidden"
      >
        <MapContainer
          id="tactical-map"
          center={CENTRO}
          zoom={ZOOM}
          preferCanvas
          scrollWheelZoom
          style={{ height: '100%', width: '100%', zIndex: 0, background: '#0b0f14' }}
        >
          <MapInvalidator isFullscreen={isFullscreen} />

          {/* Stadia Maps: sem chave em localhost; em produção, registrar o domínio em stadiamaps.com */}
          <TileLayer
            url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={20}
          />

          {/* 1. Equipamentos: Inoperantes usam DivIcon pulsante; outros usam CircleMarker */}
          {equipamentosFiltrados.map((e) => {
            if (e.status === 'INOPERANTE') {
              return (
                <Marker
                  key={`eq-inoperante-${e.id}`}
                  position={[e.latitude, e.longitude]}
                  icon={inoperanteDivIcon}
                >
                  <Popup>
                    <div className="font-mono text-xs leading-relaxed">
                      <div className="flex items-center gap-1.5 font-semibold text-neon-red">
                        <span className="h-2 w-2 animate-ping rounded-full bg-neon-red" />
                        <span>{TIPO_LABEL[e.tipo] || e.tipo}</span>
                      </div>
                      <div>Série: {e.numero_serie}</div>
                      <div>
                        Status: <span className="font-bold text-neon-red">INOPERANTE (ALERTA)</span>
                      </div>
                      {e.bairro && <div className="text-[11px] text-slate-400">Local: {e.bairro}</div>}
                    </div>
                  </Popup>
                </Marker>
              )
            }

            const cor = corPorStatus(e.status)
            return (
              <CircleMarker
                key={`eq-${e.id}`}
                center={[e.latitude, e.longitude]}
                radius={5}
                color="transparent"
                fillColor={cor}
                fillOpacity={0.85}
              >
                <Popup>
                  <div className="font-mono text-xs leading-relaxed">
                    <div className="font-semibold">{TIPO_LABEL[e.tipo] || e.tipo}</div>
                    <div>Série: {e.numero_serie}</div>
                    <div>
                      Status: <span style={{ color: cor === '#ffffff' ? undefined : cor }}>{STATUS_EQUIP[e.status]?.label || e.status}</span>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}

          {/* 2. Ocorrências ativas (não resolvidas) com DivIcon de triângulo de alerta */}
          {ocorrenciasFiltradas.map((oc) => (
            <Marker
              key={`oc-${oc.id}`}
              position={[oc.latitude, oc.longitude]}
              icon={ocorrenciaDivIcon}
            >
              <Popup>
                <div className="font-mono text-xs leading-relaxed">
                  <div className="flex items-center gap-1.5 font-semibold text-neon-amber">
                    <span>⚠️</span>
                    <span>{oc.titulo}</span>
                  </div>
                  <div className="text-slate-400">{TIPO_LABEL[oc.tipo] || oc.tipo}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                    <span>
                      Gravidade:{' '}
                      <strong className={GRAVIDADE_COLOR[oc.gravidade] || 'text-neon-amber'}>
                        {oc.gravidade}
                      </strong>
                    </span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                      {oc.status}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* 3. Agentes em campo */}
          {agentesFiltrados.map((a) => (
            <CircleMarker
              key={`ag-${a.id}`}
              center={[a.latitude, a.longitude]}
              radius={6}
              color="#ff2bd6"
              weight={2}
              fillColor="#ff2bd6"
              fillOpacity={0.4}
            >
              <Popup className="popup-agente">
                <div className="font-mono text-xs leading-relaxed">
                  <div className="font-semibold">{a.nome}</div>
                  <div>{TIPO_LABEL[a.tipo] || a.tipo}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {/* Painel de Filtros de Camada sobreposto no canto inferior direito */}
        <div
          id="map-layer-filters"
          className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-1.5 rounded-lg border border-white/10 bg-fogo-900/80 p-2.5 shadow-2xl backdrop-blur"
          aria-label="Filtros de Camada do Mapa"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan animate-pulse" />
              Camadas
            </span>
            <span className="text-[9px] text-slate-500">TÁTICO</span>
          </div>

          <div className="flex flex-col gap-1.5 pt-0.5">
            {/* Toggle Equipamentos */}
            <button
              type="button"
              id="toggle-equipamentos"
              onClick={() => setMostrarEquipamentos(!mostrarEquipamentos)}
              className={`flex items-center justify-between gap-3 rounded border px-2 py-1 font-mono text-[11px] transition-all ${
                mostrarEquipamentos
                  ? 'border-neon-cyan/40 bg-neon-cyan/15 text-neon-cyan shadow-[0_0_8px_rgba(34,229,255,0.2)]'
                  : 'border-white/5 bg-white/5 text-slate-500 hover:text-slate-300'
              }`}
              title="Alternar exibição de equipamentos"
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${mostrarEquipamentos ? 'bg-neon-cyan' : 'bg-slate-600'}`} />
                <span>Equipamentos</span>
              </div>
              <span className="text-[10px] opacity-75">{equipamentos.length}</span>
            </button>

            {/* Toggle Apenas Críticos */}
            <button
              type="button"
              id="toggle-criticos"
              onClick={() => {
                if (!mostrarEquipamentos && !apenasCriticos) {
                  setMostrarEquipamentos(true)
                }
                setApenasCriticos(!apenasCriticos)
              }}
              className={`flex items-center justify-between gap-3 rounded border px-2 py-1 font-mono text-[11px] transition-all ${
                apenasCriticos
                  ? 'border-neon-red/60 bg-neon-red/25 text-neon-red font-semibold shadow-[0_0_10px_rgba(255,59,92,0.3)]'
                  : 'border-white/5 bg-white/5 text-slate-400 hover:text-slate-200'
              }`}
              title="Filtrar mapa para apenas equipamentos em ALERTA, INOPERANTE ou MANUTENÇÃO"
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${apenasCriticos ? 'bg-neon-red animate-ping' : 'bg-slate-600'}`} />
                <span>Apenas Críticos</span>
              </div>
              <span className={`text-[10px] rounded px-1 ${apenasCriticos ? 'bg-neon-red/30 text-neon-red' : 'text-slate-500'}`}>
                {totalCriticos}
              </span>
            </button>

            {/* Toggle Agentes */}
            <button
              type="button"
              id="toggle-agentes"
              onClick={() => setMostrarAgentes(!mostrarAgentes)}
              className={`flex items-center justify-between gap-3 rounded border px-2 py-1 font-mono text-[11px] transition-all ${
                mostrarAgentes
                  ? 'border-neon-magenta/40 bg-neon-magenta/15 text-neon-magenta shadow-[0_0_8px_rgba(255,43,214,0.2)]'
                  : 'border-white/5 bg-white/5 text-slate-500 hover:text-slate-300'
              }`}
              title="Alternar exibição de agentes"
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${mostrarAgentes ? 'bg-[#ff2bd6]' : 'bg-slate-600'}`} />
                <span>Agentes</span>
              </div>
              <span className="text-[10px] opacity-75">{agentes.filter((a) => a.latitude != null).length}</span>
            </button>

            {/* Toggle Ocorrências */}
            <button
              type="button"
              id="toggle-ocorrencias"
              onClick={() => setMostrarOcorrencias(!mostrarOcorrencias)}
              className={`flex items-center justify-between gap-3 rounded border px-2 py-1 font-mono text-[11px] transition-all ${
                mostrarOcorrencias
                  ? 'border-neon-amber/40 bg-neon-amber/15 text-neon-amber shadow-[0_0_8px_rgba(255,197,49,0.2)]'
                  : 'border-white/5 bg-white/5 text-slate-500 hover:text-slate-300'
              }`}
              title="Alternar exibição de ocorrências"
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${mostrarOcorrencias ? 'bg-neon-amber' : 'bg-slate-600'}`} />
                <span>Ocorrências</span>
              </div>
              <span className="text-[10px] opacity-75">{ocorrencias.filter((o) => o.latitude != null && o.status !== 'RESOLVIDA').length}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
