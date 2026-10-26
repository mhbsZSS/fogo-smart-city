import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import Header from '../components/Header.jsx'
import Sidebar from '../components/Sidebar.jsx'
import AgenteModal from '../components/AgenteModal.jsx'
import ModalNovoAgente from '../components/ModalNovoAgente.jsx'
import TrackingModal from '../components/TrackingModal.jsx'
import { STATUS_AGENTE, TIPO_LABEL, fallback } from '../components/statusConfig.js'
import { agentesService, checkHealth } from '../services/api.js'

const STATUS_AGENTE_PRIORITY = {
  DISPONIVEL: 1,
  EM_DESLOCAMENTO: 2,
  EM_ATENDIMENTO: 3,
  OFFLINE: 4,
}

export default function Agentes() {
  const [apiOnline, setApiOnline] = useState(null)
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' })
  const [isNovoModalOpen, setIsNovoModalOpen] = useState(false)
  const [isTrackingOpen, setIsTrackingOpen] = useState(false)
  const [agenteSelecionado, setAgenteSelecionado] = useState(null)
  const [detalhesAgenteId, setDetalhesAgenteId] = useState(null)
  const [agenteParaDesligar, setAgenteParaDesligar] = useState(null)
  const [removendoId, setRemovendoId] = useState(null)
  const [atualizandoStatusId, setAtualizandoStatusId] = useState(null)

  const handleConfirmarDesligamento = async () => {
    if (!agenteParaDesligar) return

    setRemovendoId(agenteParaDesligar.id)
    try {
      await agentesService.remover(agenteParaDesligar.id)
      setAgenteParaDesligar(null)
      await carregar(true)
    } catch (err) {
      alert(err?.friendlyMessage || err?.response?.data?.detail || 'Erro ao desligar agente.')
    } finally {
      setRemovendoId(null)
    }
  }

  const handleAlterarStatus = async (agenteId, novoStatus) => {
    if (!novoStatus) return
    setAtualizandoStatusId(agenteId)
    try {
      // Atualização otimista local imediata
      setAgentes((prev) =>
        prev.map((a) => (a.id === agenteId ? { ...a, status: novoStatus } : a))
      )
      await agentesService.atualizarStatus(agenteId, novoStatus)
      await carregar(true)
    } catch (err) {
      alert(err?.friendlyMessage || err?.response?.data?.detail || 'Erro ao alterar status do agente.')
      await carregar(true)
    } finally {
      setAtualizandoStatusId(null)
    }
  }

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    try {
      const [health, ags] = await Promise.allSettled([
        checkHealth(),
        agentesService.listar({ limit: 500 }),
      ])
      setApiOnline(health.status === 'fulfilled')
      if (ags.status === 'fulfilled') {
        setAgentes(ags.value)
      } else {
        setErro(ags.reason?.friendlyMessage || 'Erro ao carregar agentes')
      }
    } catch (err) {
      setErro(err.message || 'Erro inesperado')
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar(false)
    // Atualização em tempo real a cada 10 segundos
    const intervalo = setInterval(() => {
      carregar(true)
    }, 10_000)
    return () => clearInterval(intervalo)
  }, [carregar])

  const [filtroAgente, setFiltroAgente] = useState('disponiveis')

  // Contadores para os filtros rápidos
  const totalDisponiveis = useMemo(
    () => agentes.filter((a) => a.status === 'DISPONIVEL').length,
    [agentes],
  )
  const totalEmDeslocamento = useMemo(
    () => agentes.filter((a) => a.status === 'EM_DESLOCAMENTO').length,
    [agentes],
  )
  const totalEmAtendimento = useMemo(
    () => agentes.filter((a) => a.status === 'EM_ATENDIMENTO').length,
    [agentes],
  )
  const totalOffline = useMemo(
    () => agentes.filter((a) => a.status === 'OFFLINE').length,
    [agentes],
  )

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'ascending' ? 'descending' : 'ascending',
        }
      }
      return {
        key,
        direction: 'ascending',
      }
    })
  }

  // 1. Filtragem e 2. Ordenação Tática
  const agentesFiltradosEOrdenados = useMemo(() => {
    let lista = [...agentes]

    // Filtragem de acordo com o pill selecionado
    if (filtroAgente === 'disponiveis') {
      lista = lista.filter((a) => a.status === 'DISPONIVEL')
    } else if (filtroAgente === 'deslocamento') {
      lista = lista.filter((a) => a.status === 'EM_DESLOCAMENTO')
    } else if (filtroAgente === 'atendimento') {
      lista = lista.filter((a) => a.status === 'EM_ATENDIMENTO')
    } else if (filtroAgente === 'offline') {
      lista = lista.filter((a) => a.status === 'OFFLINE')
    }

    if (sortConfig.key) {
      return lista.sort((a, b) => {
        let comp = 0
        if (sortConfig.key === 'nome') {
          comp = (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
        } else if (sortConfig.key === 'tipo') {
          const valA = TIPO_LABEL[a.tipo] || a.tipo || ''
          const valB = TIPO_LABEL[b.tipo] || b.tipo || ''
          comp = valA.localeCompare(valB, 'pt-BR')
        } else if (sortConfig.key === 'status') {
          const valA = STATUS_AGENTE[a.status]?.label || a.status || ''
          const valB = STATUS_AGENTE[b.status]?.label || b.status || ''
          comp = valA.localeCompare(valB, 'pt-BR')
        } else {
          const valA = String(a[sortConfig.key] || '')
          const valB = String(b[sortConfig.key] || '')
          comp = valA.localeCompare(valB, 'pt-BR')
        }

        return sortConfig.direction === 'ascending' ? comp : -comp
      })
    }

    // Ordenação Tática:
    // Regra 1: Status (Primeiro DISPONIVEL [1], depois EM_DESLOCAMENTO [2], EM_ATENDIMENTO [3], OFFLINE [4])
    // Regra 2: Desempate alfabético pelo nome do agente (localeCompare)
    return lista.sort((a, b) => {
      const prioridadeA = STATUS_AGENTE_PRIORITY[a.status] ?? 99
      const prioridadeB = STATUS_AGENTE_PRIORITY[b.status] ?? 99

      if (prioridadeA !== prioridadeB) {
        return prioridadeA - prioridadeB
      }

      return (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
    })
  }, [agentes, filtroAgente, sortConfig])

  const agentesAtivos = agentes.filter((a) => a.status !== 'OFFLINE').length

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header apiOnline={apiOnline} />

        <main className="flex-1 space-y-6 overflow-auto p-6">
          {erro && (
            <div
              role="alert"
              className="rounded-lg border border-neon-red/30 bg-neon-red/10 px-4 py-3 font-mono text-xs text-neon-red"
            >
              ⚠ {erro} — verifique se o backend está rodando em{' '}
              <span className="underline">{import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'}</span>
            </div>
          )}

          {/* Cabeçalho da Seção */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-display text-xl font-bold tracking-wider text-white">
                  Efetivo em Campo
                </h2>
                <span className="flex items-center gap-1.5 rounded-full border border-neon-lime/30 bg-neon-lime/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neon-lime">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-lime opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon-lime" />
                  </span>
                  Live (10s)
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-slate-400">
                {loading
                  ? 'Carregando efetivo...'
                  : `${agentes.length} agentes cadastrados · ${agentesAtivos} ativos em operação`}
              </p>
            </div>

            <button
              type="button"
              id="btn-novo-agente"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neon-magenta/50 bg-neon-magenta/20 px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-neon-magenta shadow-[0_0_15px_rgba(255,43,214,0.25)] transition-all hover:border-neon-magenta hover:bg-neon-magenta/30 hover:shadow-[0_0_20px_rgba(255,43,214,0.4)] focus:outline-none focus:ring-2 focus:ring-neon-magenta/50"
              onClick={() => setIsNovoModalOpen(true)}
            >
              <span>+</span>
              <span>NOVO AGENTE</span>
            </button>
          </div>

          {/* Tabela de Agentes com Filtros Rápidos (Pills) */}
          <section className="panel overflow-hidden" aria-label="Lista de Agentes">
            {/* Cabeçalho com Título e Filtros Rápidos (Quick Filter Pills) */}
            <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h3 className="panel-title">Quadro Operacional de Agentes</h3>
                <span className="font-mono text-[10px] text-slate-500">
                  {agentesFiltradosEOrdenados.length}
                  {filtroAgente !== 'todos' ? ` de ${agentes.length}` : ''} agentes listados
                </span>
              </div>

              {/* Grupo de botões (Pills) para filtragem visual rápida */}
              <div
                className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/5 bg-fogo-900/80 p-1"
                role="toolbar"
                aria-label="Filtros rápidos de agentes"
              >
                <button
                  type="button"
                  id="filtro-agente-disponiveis"
                  onClick={() => setFiltroAgente('disponiveis')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                    filtroAgente === 'disponiveis'
                      ? 'border border-neon-lime/40 bg-neon-lime/20 text-neon-lime shadow-[0_0_10px_rgba(163,230,53,0.25)]'
                      : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span>🟢</span>
                  <span>Disponíveis</span>
                  <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                    {totalDisponiveis}
                  </span>
                </button>

                <button
                  type="button"
                  id="filtro-agente-deslocamento"
                  onClick={() => setFiltroAgente('deslocamento')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                    filtroAgente === 'deslocamento'
                      ? 'border border-neon-cyan/40 bg-neon-cyan/20 text-neon-cyan shadow-[0_0_10px_rgba(34,229,255,0.25)]'
                      : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span>🔵</span>
                  <span>Em Deslocamento</span>
                  <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                    {totalEmDeslocamento}
                  </span>
                </button>

                <button
                  type="button"
                  id="filtro-agente-atendimento"
                  onClick={() => setFiltroAgente('atendimento')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                    filtroAgente === 'atendimento'
                      ? 'border border-neon-amber/40 bg-neon-amber/20 text-neon-amber shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                      : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span>🟠</span>
                  <span>Em Atendimento</span>
                  <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                    {totalEmAtendimento}
                  </span>
                </button>

                <button
                  type="button"
                  id="filtro-agente-offline"
                  onClick={() => setFiltroAgente('offline')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                    filtroAgente === 'offline'
                      ? 'border border-slate-500/40 bg-slate-700/40 text-slate-300 shadow-[0_0_10px_rgba(148,163,184,0.2)]'
                      : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span>⚪</span>
                  <span>Offline</span>
                  <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                    {totalOffline}
                  </span>
                </button>

                <button
                  type="button"
                  id="filtro-agente-todos"
                  onClick={() => setFiltroAgente('todos')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                    filtroAgente === 'todos'
                      ? 'border border-white/20 bg-white/10 text-slate-200 shadow-[0_0_10px_rgba(255,255,255,0.15)]'
                      : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span>📋</span>
                  <span>Todos</span>
                  <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                    {agentes.length}
                  </span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-fogo-800 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th
                      onClick={() => handleSort('nome')}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-neon-magenta hover:text-pink-400 transition-colors group select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Nome</span>
                        {sortConfig.key === 'nome' &&
                          (sortConfig.direction === 'ascending' ? (
                            <ChevronUp className="w-4 h-4 text-neon-magenta" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-neon-magenta" />
                          ))}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('tipo')}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-neon-magenta hover:text-pink-400 transition-colors group select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tipo</span>
                        {sortConfig.key === 'tipo' &&
                          (sortConfig.direction === 'ascending' ? (
                            <ChevronUp className="w-4 h-4 text-neon-magenta" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-neon-magenta" />
                          ))}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('status')}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-neon-magenta hover:text-pink-400 transition-colors group select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Status</span>
                        {sortConfig.key === 'status' &&
                          (sortConfig.direction === 'ascending' ? (
                            <ChevronUp className="w-4 h-4 text-neon-magenta" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-neon-magenta" />
                          ))}
                      </div>
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Posição (GPS)
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {loading &&
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-5 py-3.5">
                          <div className="h-4 animate-pulse rounded bg-white/5" />
                        </td>
                      </tr>
                    ))}

                  {!loading && agentesFiltradosEOrdenados.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center font-mono text-xs text-slate-500">
                        {agentes.length === 0
                          ? 'Nenhum agente cadastrado.'
                          : filtroAgente === 'disponiveis'
                          ? 'Nenhum agente disponível no momento. Todo o efetivo está em missão ou deslocamento.'
                          : filtroAgente === 'deslocamento'
                          ? 'Nenhum agente em deslocamento no momento.'
                          : filtroAgente === 'atendimento'
                          ? 'Nenhum agente em atendimento no momento.'
                          : filtroAgente === 'offline'
                          ? 'Nenhum agente offline no momento. Todo o efetivo está conectado.'
                          : 'Nenhum agente encontrado.'}
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    agentesFiltradosEOrdenados.map((a) => {
                      const st = STATUS_AGENTE[a.status] || fallback
                      const temGps = a.latitude != null && a.longitude != null
                      const emTransmissaoAtiva =
                        a.status === 'EM_DESLOCAMENTO' || a.status === 'EM_ATENDIMENTO'

                      return (
                        <tr key={a.id} className="transition-colors hover:bg-white/[0.03]">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setDetalhesAgenteId(a.id)}
                                title="Visualizar parecer de RH e telemetria"
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-fogo-700 font-display text-[11px] font-bold text-slate-300 transition-all hover:bg-neon-magenta/20 hover:text-neon-magenta hover:shadow-[0_0_10px_rgba(255,43,214,0.3)]"
                              >
                                {a.nome
                                  .split(' ')
                                  .slice(0, 2)
                                  .map((n) => n[0])
                                  .join('')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetalhesAgenteId(a.id)}
                                title="Visualizar parecer de RH e telemetria"
                                className="font-medium text-slate-200 hover:text-neon-cyan transition-colors text-left"
                              >
                                {a.nome}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {TIPO_LABEL[a.tipo] || a.tipo}
                          </td>
                          <td className="px-4 py-3">
                            <div
                              className="relative inline-flex items-center group"
                              title="Override Tático: Clique para alterar o status operacional deste agente"
                            >
                              <select
                                value={a.status}
                                disabled={atualizandoStatusId === a.id}
                                onChange={(e) => handleAlterarStatus(a.id, e.target.value)}
                                className={`appearance-none cursor-pointer rounded-full pl-6 pr-6 py-0.5 text-[11px] font-mono font-medium ring-1 transition-all focus:outline-none focus:ring-2 focus:ring-neon-magenta/60 ${
                                  a.status === 'DISPONIVEL'
                                    ? 'bg-neon-lime/10 ring-neon-lime/30 text-neon-lime hover:bg-neon-lime/20 hover:ring-neon-lime/60'
                                    : a.status === 'EM_DESLOCAMENTO'
                                    ? 'bg-neon-cyan/10 ring-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 hover:ring-neon-cyan/60'
                                    : a.status === 'EM_ATENDIMENTO'
                                    ? 'bg-neon-amber/10 ring-neon-amber/30 text-neon-amber hover:bg-neon-amber/20 hover:ring-neon-amber/60'
                                    : 'bg-slate-800/60 ring-slate-700 text-slate-400 hover:bg-slate-800 hover:ring-slate-500'
                                } ${atualizandoStatusId === a.id ? 'opacity-50 cursor-wait' : ''}`}
                              >
                                <option value="DISPONIVEL" className="bg-fogo-900 text-neon-lime">
                                  🟢 Disponível
                                </option>
                                <option value="EM_DESLOCAMENTO" className="bg-fogo-900 text-neon-cyan">
                                  🔵 Em Deslocamento
                                </option>
                                <option value="EM_ATENDIMENTO" className="bg-fogo-900 text-neon-amber">
                                  🟠 Em Atendimento
                                </option>
                                <option value="OFFLINE" className="bg-fogo-900 text-slate-400">
                                  ⚪ Offline
                                </option>
                              </select>

                              {/* Indicador de status posicionado à esquerda */}
                              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 flex items-center">
                                {atualizandoStatusId === a.id ? (
                                  <span className="h-1.5 w-1.5 animate-spin rounded-full border border-white border-t-transparent" />
                                ) : (
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      a.status === 'DISPONIVEL'
                                        ? 'bg-neon-lime'
                                        : a.status === 'EM_DESLOCAMENTO'
                                        ? 'bg-neon-cyan'
                                        : a.status === 'EM_ATENDIMENTO'
                                        ? 'bg-neon-amber'
                                        : 'bg-slate-500'
                                    }`}
                                  />
                                )}
                              </span>

                              {/* Indicador de edição (lápis) exibido no hover à direita */}
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] text-slate-400 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all">
                                ✏️
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs">
                            {temGps ? (
                              <div className="flex items-center gap-2.5 text-neon-cyan">
                                {emTransmissaoAtiva ? (
                                  <span
                                    className="relative flex h-2 w-2"
                                    title="Transmissão ao Vivo (Radar Ativo)"
                                  >
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-lime opacity-80" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-lime" />
                                  </span>
                                ) : (
                                  <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan" />
                                )}
                                <span>
                                  {Number(a.latitude).toFixed(4)}, {Number(a.longitude).toFixed(4)}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-slate-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                                Offline
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {a.status !== 'OFFLINE' && a.latitude != null && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAgenteSelecionado(a)
                                    setIsTrackingOpen(true)
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded border border-neon-cyan/40 bg-neon-cyan/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan transition-all shadow-[0_0_10px_rgba(34,229,255,0.15)]"
                                  title="Abrir radar de rastreamento deste agente"
                                >
                                  <span>📍</span>
                                  <span>Rastrear</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setAgenteParaDesligar(a)}
                                disabled={removendoId === a.id}
                                className="inline-flex items-center gap-1 rounded border border-neon-red/40 bg-neon-red/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-neon-red hover:bg-neon-red/20 hover:border-neon-red transition-all shadow-[0_0_10px_rgba(255,43,43,0.15)] disabled:opacity-50"
                                title="Desligar / arquivar agente do efetivo"
                              >
                                {removendoId === a.id ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border border-neon-red border-t-transparent" />
                                ) : (
                                  <span>🗑️</span>
                                )}
                                <span>Desligar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      <ModalNovoAgente
        isOpen={isNovoModalOpen}
        onClose={() => setIsNovoModalOpen(false)}
        onSuccess={() => carregar(false)}
      />

      <AgenteModal
        isOpen={Boolean(detalhesAgenteId)}
        id={detalhesAgenteId}
        onClose={() => setDetalhesAgenteId(null)}
        onSuccess={() => carregar(false)}
      />

      <TrackingModal
        isOpen={isTrackingOpen}
        onClose={() => {
          setIsTrackingOpen(false)
          setAgenteSelecionado(null)
        }}
        agente={agenteSelecionado}
      />

      {/* Modal de Confirmação Customizado (Estilo F.O.G.O.) */}
      {agenteParaDesligar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-desligamento-title"
        >
          {/* Backdrop escuro com blur */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => !removendoId && setAgenteParaDesligar(null)}
          />

          {/* Card do Modal */}
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-neon-red/40 bg-fogo-900/95 p-6 shadow-[0_0_40px_rgba(255,42,85,0.25)] backdrop-blur-xl text-white">
            {/* Header */}
            <div className="flex items-start gap-3.5 border-b border-white/10 pb-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-neon-red/40 bg-neon-red/10 text-neon-red shadow-[0_0_15px_rgba(255,42,85,0.3)]">
                <span className="text-xl">⚠️</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id="modal-desligamento-title"
                  className="font-display text-base font-bold tracking-wider text-neon-red drop-shadow-[0_0_10px_rgba(255,42,85,0.3)]"
                >
                  ⚠️ Confirmação de Desligamento Operacional
                </h3>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                  Procedimento de inativação e off-boarding
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAgenteParaDesligar(null)}
                disabled={removendoId != null}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Corpo */}
            <div className="my-5 space-y-3 font-mono text-xs">
              <p className="text-slate-300 leading-relaxed">
                Tem a certeza que deseja desligar o agente{' '}
                <span className="font-bold text-white bg-white/10 px-1.5 py-0.5 rounded border border-white/15">
                  {agenteParaDesligar.nome}
                </span>{' '}
                do efetivo? Esta ação irá inativá-lo no sistema.
              </p>

              <div className="rounded-lg border border-neon-red/20 bg-neon-red/5 p-3 text-[11px] text-slate-400">
                <span className="text-neon-red font-semibold">Nota Operacional:</span> O agente será desvinculado de quaisquer ocorrências ativas, a telemetria GPS será encerrada e ele não constará mais nas listas de despacho em campo.
              </div>
            </div>

            {/* Botões */}
            <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setAgenteParaDesligar(null)}
                disabled={removendoId != null}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-slate-300 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                CANCELAR
              </button>
              <button
                type="button"
                id="btn-confirmar-desligamento"
                onClick={handleConfirmarDesligamento}
                disabled={removendoId != null}
                className="inline-flex items-center gap-2 rounded-lg border border-neon-red/80 bg-neon-red/20 px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-neon-red shadow-[0_0_15px_rgba(255,42,85,0.3)] transition-all hover:bg-neon-red/35 hover:border-neon-red hover:shadow-[0_0_25px_rgba(255,42,85,0.5)] disabled:opacity-50"
              >
                {removendoId ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-neon-red border-t-transparent" />
                    <span>DESLIGANDO...</span>
                  </>
                ) : (
                  <>
                    <span>🗑️</span>
                    <span>DESLIGAR AGENTE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
