import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import { isManutencao } from './statusConfig.js'
import { ocorrenciasService } from '../services/api.js'
import DetalhesOcorrenciaModal from './DetalhesOcorrenciaModal.jsx'

const statusPriority = {
  APOIO_SOLICITADO: 0,
  PENDENTE: 1,
  DESPACHADA: 2,
  EM_ATENDIMENTO: 3,
  RESOLVIDA: 4,
}

const gravidadePriority = {
  CRITICA: 1,
  'Crítica': 1,
  Critica: 1,
  ALTA: 2,
  Alta: 2,
  MEDIA: 3,
  'Média': 3,
  Media: 3,
  BAIXA: 4,
  Baixa: 4,
}

const GRAVIDADE_BADGES = {
  CRITICA: {
    label: 'Crítica',
    cls: 'text-neon-red border-neon-red/40 bg-neon-red/10 ring-1 ring-neon-red/30',
    dot: 'bg-neon-red',
  },
  ALTA: {
    label: 'Alta',
    cls: 'text-ember-400 border-ember-500/40 bg-ember-500/10 ring-1 ring-ember-500/30',
    dot: 'bg-ember-500',
  },
  MEDIA: {
    label: 'Média',
    cls: 'text-neon-amber border-neon-amber/40 bg-neon-amber/10 ring-1 ring-neon-amber/30',
    dot: 'bg-neon-amber',
  },
  BAIXA: {
    label: 'Baixa',
    cls: 'text-neon-lime border-neon-lime/40 bg-neon-lime/10 ring-1 ring-neon-lime/30',
    dot: 'bg-neon-lime',
  },
}

const STATUS_BADGES = {
  APOIO_SOLICITADO: {
    label: 'Apoio Solicitado',
    cls: 'text-neon-red border-neon-red/60 bg-neon-red/20 ring-1 ring-neon-red/40 animate-pulse font-bold',
    dot: 'bg-neon-red animate-ping',
  },
  PENDENTE: {
    label: 'Pendente',
    cls: 'text-neon-amber border-neon-amber/40 bg-neon-amber/10 ring-1 ring-neon-amber/30',
    dot: 'bg-neon-amber',
  },
  DESPACHADA: {
    label: 'Despachada',
    cls: 'text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10 ring-1 ring-neon-cyan/30',
    dot: 'bg-neon-cyan',
  },
  EM_ATENDIMENTO: {
    label: 'Em Atendimento',
    cls: 'text-neon-magenta border-neon-magenta/40 bg-neon-magenta/10 ring-1 ring-neon-magenta/30',
    dot: 'bg-neon-magenta',
  },
  RESOLVIDA: {
    label: 'Resolvida',
    cls: 'text-neon-lime border-neon-lime/40 bg-neon-lime/10 ring-1 ring-neon-lime/30',
    dot: 'bg-neon-lime',
  },
}

const TIPO_LABELS = {
  ACIDENTE: 'Acidente de Trânsito',
  DEFESA_CIVIL: 'Defesa Civil',
  ALERTA_CAMPO: 'Alerta de Campo (Telegram)',
  MANUTENCAO: 'Manutenção Urbana',
  SEGURANCA: 'Segurança Pública',
  ILUMINACAO: 'Falha Elétrica / LED',
  TRANSITO: 'Interdição de Via',
  AMBIENTAL: 'Incidente Ambiental',
  SAUDE: 'Resgate / SAMU',
  OUTRO: 'Outro',
}

const fmtData = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—')

export default function FilaDespacho({
  ocorrencias = [],
  agentes = [],
  loading = false,
  onDespachar,
  onConcluir: propOnConcluir,
  concluindoId: propConcluindoId,
  onVerDetalhes,
  onEditar,
  setOcorrenciaSelecionada,
  setModalEditarAberto,
  sortConfig: propSortConfig,
  onSort: propOnSort,
}) {
  const [internalConcluindoId, setInternalConcluindoId] = useState(null)
  const concluindoId = propConcluindoId !== undefined ? propConcluindoId : internalConcluindoId

  const [internalSortConfig, setInternalSortConfig] = useState({ key: null, direction: 'ascending' })
  const sortConfig = propSortConfig !== undefined ? propSortConfig : internalSortConfig
  const handleSort = propOnSort || ((key) => {
    setInternalSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending',
    }))
  })

  // Estado para filtros rápidos: padrão SEMPRE 'pendentes' (Emergências Públicas)
  const [filtroAtual, setFiltroAtual] = useState('pendentes')

  // Estado para filtro específico por data (YYYY-MM-DD)
  const [filtroData, setFiltroData] = useState('')

  // Estado para modal de detalhes integrais da ocorrência
  const [detalhesModal, setDetalhesModal] = useState(null)

  // Contadores dinâmicos independentes para os filtros rápidos
  const totalApoioSolicitado = useMemo(
    () =>
      (ocorrencias || []).filter(
        (o) => o?.necessita_apoio || o?.status === 'APOIO_SOLICITADO',
      ).length,
    [ocorrencias],
  )

  const totalEmergencias = useMemo(
    () =>
      (ocorrencias || []).filter(
        (o) =>
          o?.necessita_apoio ||
          o?.status === 'APOIO_SOLICITADO' ||
          (o?.status === 'PENDENTE' && !isManutencao(o?.tipo, o?.titulo)),
      ).length,
    [ocorrencias],
  )

  const totalManutencoes = useMemo(
    () =>
      (ocorrencias || []).filter(
        (o) => o?.status === 'PENDENTE' && isManutencao(o?.tipo, o?.titulo),
      ).length,
    [ocorrencias],
  )

  const totalEmAndamento = useMemo(
    () =>
      (ocorrencias || []).filter(
        (o) =>
          o?.necessita_apoio ||
          o?.status === 'APOIO_SOLICITADO' ||
          o?.status === 'DESPACHADA' ||
          o?.status === 'EM_ATENDIMENTO',
      ).length,
    [ocorrencias],
  )

  const totalResolvidas = useMemo(
    () =>
      (ocorrencias || []).filter((o) => o?.status === 'RESOLVIDA').length,
    [ocorrencias],
  )

  // 1. Filtragem e Ordenação Tática
  const ocorrenciasFiltradasEOrdenadas = useMemo(() => {
    let lista = [...(ocorrencias || [])]

    // Filtragem de acordo com o pill selecionado
    if (filtroAtual === 'pendentes') {
      lista = lista.filter(
        (oc) =>
          oc?.necessita_apoio ||
          oc?.status === 'APOIO_SOLICITADO' ||
          (oc?.status === 'PENDENTE' && !isManutencao(oc?.tipo, oc?.titulo)),
      )
    } else if (filtroAtual === 'manutencoes') {
      lista = lista.filter(
        (oc) => oc?.status === 'PENDENTE' && isManutencao(oc?.tipo, oc?.titulo),
      )
    } else if (filtroAtual === 'em_andamento') {
      lista = lista.filter(
        (oc) =>
          oc?.necessita_apoio ||
          oc?.status === 'APOIO_SOLICITADO' ||
          oc?.status === 'DESPACHADA' ||
          oc?.status === 'EM_ATENDIMENTO',
      )
    } else if (filtroAtual === 'resolvidas') {
      lista = lista.filter((oc) => oc?.status === 'RESOLVIDA')
    }

    // Filtragem por data específica (se informada pelo operador)
    if (filtroData) {
      lista = lista.filter((oc) => {
        if (!oc?.criado_em) return false
        try {
          const d = new Date(oc.criado_em)
          if (isNaN(d.getTime())) return false
          const ano = d.getFullYear()
          const mes = String(d.getMonth() + 1).padStart(2, '0')
          const dia = String(d.getDate()).padStart(2, '0')
          return `${ano}-${mes}-${dia}` === filtroData
        } catch {
          return false
        }
      })
    }

    if (sortConfig.key) {
      return lista.sort((a, b) => {
        let comp = 0
        if (sortConfig.key === 'data' || sortConfig.key === 'criado_em') {
          const timeA = a?.criado_em ? new Date(a.criado_em).getTime() : 0
          const timeB = b?.criado_em ? new Date(b.criado_em).getTime() : 0
          comp = timeA - timeB
        } else if (sortConfig.key === 'titulo') {
          comp = (a?.titulo || '').localeCompare(b?.titulo || '', 'pt-BR')
        } else if (sortConfig.key === 'tipo') {
          const valA = TIPO_LABELS[a?.tipo] || a?.tipo || ''
          const valB = TIPO_LABELS[b?.tipo] || b?.tipo || ''
          comp = valA.localeCompare(valB, 'pt-BR')
        } else if (sortConfig.key === 'gravidade') {
          const valA = GRAVIDADE_BADGES[a?.gravidade]?.label || a?.gravidade || ''
          const valB = GRAVIDADE_BADGES[b?.gravidade]?.label || b?.gravidade || ''
          comp = valA.localeCompare(valB, 'pt-BR')
        } else if (sortConfig.key === 'status') {
          const valA = STATUS_BADGES[a?.status]?.label || a?.status || ''
          const valB = STATUS_BADGES[b?.status]?.label || b?.status || ''
          comp = valA.localeCompare(valB, 'pt-BR')
        } else {
          const valA = String(a?.[sortConfig.key] || '')
          const valB = String(b?.[sortConfig.key] || '')
          comp = valA.localeCompare(valB, 'pt-BR')
        }

        return sortConfig.direction === 'ascending' ? comp : -comp
      })
    }

    // Algoritmo de Ordenação em Cascata (Multi-level Sort):
    // 0º Nível: TOPO ABSOLUTO para Ocorrências Solicitando Apoio
    // 1º Nível: Status (statusPriority crescente: APOIO_SOLICITADO=0, PENDENTE=1, DESPACHADA=2, EM_ATENDIMENTO=3, RESOLVIDA=4)
    // 2º Nível: Se o Status for igual, ordena pela Gravidade (gravidadePriority crescente: CRITICA=1, ALTA=2, MEDIA=3, BAIXA=4)
    // 3º Nível: Se a Gravidade for igual, ordena pela Data/Hora mais recente (decrescente, os mais novos no topo)
    return lista.sort((a, b) => {
      // 0º Nível: TOPO ABSOLUTO para Ocorrências Solicitando Apoio
      const apoioA = Boolean(a?.necessita_apoio || a?.status === 'APOIO_SOLICITADO')
      const apoioB = Boolean(b?.necessita_apoio || b?.status === 'APOIO_SOLICITADO')
      if (apoioA !== apoioB) {
        return apoioA ? -1 : 1
      }

      // 1º Nível: Status
      const stA = statusPriority[a?.status] ?? 99
      const stB = statusPriority[b?.status] ?? 99
      if (stA !== stB) {
        return stA - stB
      }

      // 2º Nível: Gravidade
      const gravA = gravidadePriority[a?.gravidade] ?? 99
      const gravB = gravidadePriority[b?.gravidade] ?? 99
      if (gravA !== gravB) {
        return gravA - gravB
      }

      // 3º Nível: Data/Hora mais recente
      const dataA = a?.criado_em ? new Date(a.criado_em).getTime() : 0
      const dataB = b?.criado_em ? new Date(b.criado_em).getTime() : 0
      return dataB - dataA
    })
  }, [ocorrencias, filtroAtual, filtroData, sortConfig])

  const getNomeAgente = (agenteId) => {
    if (!agenteId) return 'Operador'
    const found = (agentes || []).find((a) => String(a?.id) === String(agenteId))
    return found ? found.nome : `Agente #${String(agenteId).slice(0, 8)}`
  }

  const handleConcluir = async (id) => {
    if (propOnConcluir) {
      await propOnConcluir(id)
      return
    }

    try {
      setInternalConcluindoId(id)
      await ocorrenciasService.concluirOcorrencia(id)
      window.dispatchEvent(new CustomEvent('fogo:data-updated'))
    } catch (err) {
      console.error('Falha ao concluir ocorrência:', err)
      alert(err?.friendlyMessage || err?.message || 'Erro ao concluir ocorrência.')
    } finally {
      setInternalConcluindoId(null)
    }
  }

  return (
    <section className="panel overflow-hidden" aria-label="Fila de Despacho & Atendimento">
      {/* Cabeçalho com Título, Filtro de Data e Filtros Rápidos (Quick Filter Pills) */}
      <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="panel-title">Fila de Despacho & Atendimento</h3>
          <span className="font-mono text-[10px] text-slate-500">
            {ocorrenciasFiltradasEOrdenadas.length}
            {filtroAtual !== 'todas' || filtroData ? ` de ${(ocorrencias || []).length}` : ''} registros
          </span>
          {filtroData && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-cyan/40 bg-neon-cyan/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-neon-cyan">
              <span>📅 Data:</span>
              <span>{filtroData.split('-').reverse().join('/')}</span>
              <button
                type="button"
                onClick={() => setFiltroData('')}
                className="hover:text-white ml-0.5 font-bold"
                title="Limpar filtro de data"
              >
                ✕
              </button>
            </span>
          )}
          {totalApoioSolicitado > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-red/70 bg-neon-red/20 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-neon-red animate-pulse shadow-[0_0_15px_rgba(255,42,85,0.4)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-red opacity-80" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon-red" />
              </span>
              {totalApoioSolicitado} Reforço(s) Solicitado(s)
            </span>
          )}
        </div>

        {/* Grupo de controles: Filtro de Data + Pills de Status */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 📅 Input de Filtro por Data */}
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-fogo-900/90 px-2.5 py-1 shadow-inner">
            <span className="text-xs text-slate-400">📅</span>
            <input
              type="date"
              id="filtro-data-registro"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
              className="bg-transparent font-mono text-xs text-slate-200 outline-none cursor-pointer [color-scheme:dark]"
              title="Filtrar ocorrências por dia específico"
            />
            {filtroData && (
              <button
                type="button"
                onClick={() => setFiltroData('')}
                className="rounded p-0.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Remover filtro de data"
              >
                ✕
              </button>
            )}
          </div>

          {/* Grupo de botões (Pills) para filtragem visual rápida */}
          <div
            className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/5 bg-fogo-900/80 p-1"
            role="toolbar"
            aria-label="Filtros rápidos de ocorrências"
          >
            {/* Guia: Emergências Pendentes (Triagem prioritária de chamados públicos) */}
            <button
              type="button"
              id="filtro-pendentes"
              onClick={() => setFiltroAtual('pendentes')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                filtroAtual === 'pendentes'
                  ? 'border border-neon-red/40 bg-neon-red/20 text-neon-red shadow-[0_0_10px_rgba(255,42,85,0.25)]'
                  : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span>🚨</span>
              <span>Emergências Pendentes</span>
              <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                {totalEmergencias}
              </span>
            </button>

            {/* Guia: Manutenção de Ativos (Ordens de serviço de hardware / equipamentos) */}
            <button
              type="button"
              id="filtro-manutencoes"
              onClick={() => setFiltroAtual('manutencoes')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                filtroAtual === 'manutencoes'
                  ? 'border border-amber-500/40 bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                  : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span>🔧</span>
              <span>Manutenção de Ativos</span>
              <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                {totalManutencoes}
              </span>
            </button>

            {/* Guia: Em Andamento (Despachadas & Em Atendimento) */}
            <button
              type="button"
              id="filtro-em-andamento"
              onClick={() => setFiltroAtual('em_andamento')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                filtroAtual === 'em_andamento'
                  ? 'border border-neon-cyan/40 bg-neon-cyan/20 text-neon-cyan shadow-[0_0_10px_rgba(34,229,255,0.25)]'
                  : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span>🚓</span>
              <span>Em Andamento</span>
              <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                {totalEmAndamento}
              </span>
            </button>

            {/* Guia: Resolvidas */}
            <button
              type="button"
              id="filtro-resolvidas"
              onClick={() => setFiltroAtual('resolvidas')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                filtroAtual === 'resolvidas'
                  ? 'border border-neon-lime/40 bg-neon-lime/20 text-neon-lime shadow-[0_0_10px_rgba(163,230,53,0.25)]'
                  : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span>✅</span>
              <span>Resolvidas</span>
              <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                {totalResolvidas}
              </span>
            </button>

            {/* Guia: Todas */}
            <button
              type="button"
              id="filtro-todas"
              onClick={() => setFiltroAtual('todas')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                filtroAtual === 'todas'
                  ? 'border border-white/20 bg-white/10 text-slate-200 shadow-[0_0_10px_rgba(255,255,255,0.15)]'
                  : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span>📋</span>
              <span>Todas</span>
              <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                {(ocorrencias || []).length}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-fogo-800 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th
                onClick={() => handleSort('data')}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-orange-400 transition-colors group select-none whitespace-nowrap w-44"
              >
                <div className="flex items-center gap-1.5">
                  <span>Registro / Data</span>
                  {(sortConfig.key === 'data' || sortConfig.key === 'criado_em') &&
                    (sortConfig.direction === 'ascending' ? (
                      <ChevronUp className="w-4 h-4 text-orange-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-orange-400" />
                    ))}
                </div>
              </th>
              <th
                onClick={() => handleSort('titulo')}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-orange-400 transition-colors group select-none min-w-[320px]"
              >
                <div className="flex items-center gap-1.5">
                  <span>Título / Descrição Completa</span>
                  {sortConfig.key === 'titulo' &&
                    (sortConfig.direction === 'ascending' ? (
                      <ChevronUp className="w-4 h-4 text-orange-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-orange-400" />
                    ))}
                </div>
              </th>
              <th
                onClick={() => handleSort('tipo')}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-orange-400 transition-colors group select-none whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  <span>Tipo</span>
                  {sortConfig.key === 'tipo' &&
                    (sortConfig.direction === 'ascending' ? (
                      <ChevronUp className="w-4 h-4 text-orange-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-orange-400" />
                    ))}
                </div>
              </th>
              <th
                onClick={() => handleSort('gravidade')}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-orange-400 transition-colors group select-none whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  <span>Gravidade</span>
                  {sortConfig.key === 'gravidade' &&
                    (sortConfig.direction === 'ascending' ? (
                      <ChevronUp className="w-4 h-4 text-orange-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-orange-400" />
                    ))}
                </div>
              </th>
              <th
                onClick={() => handleSort('status')}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-orange-400 transition-colors group select-none whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  <span>Status</span>
                  {sortConfig.key === 'status' &&
                    (sortConfig.direction === 'ascending' ? (
                      <ChevronUp className="w-4 h-4 text-orange-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-orange-400" />
                    ))}
                </div>
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-5 py-3.5">
                    <div className="h-4 animate-pulse rounded bg-white/5" />
                  </td>
                </tr>
              ))}

            {!loading && ocorrenciasFiltradasEOrdenadas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center font-mono text-xs text-slate-500">
                  {(ocorrencias || []).length === 0
                    ? 'Nenhuma ocorrência registrada no momento.'
                    : filtroData
                    ? `Nenhuma ocorrência localizada para a data ${filtroData.split('-').reverse().join('/')}.`
                    : filtroAtual === 'pendentes'
                    ? 'Nenhuma emergência pública pendente no momento. Todos os incidentes prioritários foram despachados!'
                    : filtroAtual === 'manutencoes'
                    ? 'Nenhuma ordem de manutenção de ativos pendente. Toda a infraestrutura urbana está em dia!'
                    : filtroAtual === 'em_andamento'
                    ? 'Nenhuma ocorrência em andamento no momento.'
                    : filtroAtual === 'resolvidas'
                    ? 'Nenhuma ocorrência resolvida no histórico.'
                    : 'Nenhuma ocorrência encontrada.'}
                </td>
              </tr>
            )}

            {!loading &&
              ocorrenciasFiltradasEOrdenadas.map((ocorrencia) => {
                const oc = ocorrencia
                const precisaApoio = Boolean(oc?.necessita_apoio || oc?.status === 'APOIO_SOLICITADO')
                const grav = GRAVIDADE_BADGES[oc?.gravidade] || GRAVIDADE_BADGES.MEDIA
                const st = STATUS_BADGES[oc?.status] || (precisaApoio ? STATUS_BADGES.APOIO_SOLICITADO : STATUS_BADGES.PENDENTE)
                const isResolvida = oc?.status === 'RESOLVIDA'
                const isDespachada = oc?.status === 'DESPACHADA' || oc?.status === 'EM_ATENDIMENTO'
                const isPendente = oc?.status === 'PENDENTE'
                const podeEncerrar = isDespachada || isPendente || precisaApoio

                return (
                  <tr
                    key={oc?.id}
                    className={`transition-colors ${
                      precisaApoio
                        ? 'bg-neon-red/10 border-l-4 border-l-neon-red shadow-[inset_0_0_25px_rgba(255,42,85,0.18)] hover:bg-neon-red/15'
                        : isResolvida
                        ? 'bg-neon-lime/[0.03] hover:bg-neon-lime/[0.06]'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    {/* 1. REGISTRO / DATA / GPS */}
                    <td className="px-4 py-3.5 align-top whitespace-nowrap">
                      <div className="font-mono text-xs font-semibold text-slate-200">
                        {fmtData(oc?.criado_em)}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-slate-500">
                        GPS: {oc?.latitude ? Number(oc.latitude).toFixed(4) : '—'},{' '}
                        {oc?.longitude ? Number(oc.longitude).toFixed(4) : '—'}
                      </div>
                      <div className="mt-1">
                        <span className="font-mono text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                          #{String(oc?.id || '').slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                    </td>

                    {/* 2. TÍTULO E DESCRIÇÃO INTEGRAL (Sem cortes/truncamento) */}
                    <td className="px-5 py-3.5 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-bold text-white text-sm tracking-wide">
                          {oc?.titulo}
                        </span>
                        {precisaApoio && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-red/80 bg-neon-red/25 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-neon-red shadow-[0_0_15px_rgba(255,42,85,0.7)] animate-pulse">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-red opacity-90" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-red" />
                            </span>
                            <span>🚨 SOLICITANDO APOIO</span>
                          </span>
                        )}
                      </div>

                      {/* Descrição integral com quebra de linha natural sem truncamento */}
                      <div className="mt-1.5 text-xs text-slate-300 whitespace-normal break-words leading-relaxed font-sans">
                        {oc?.descricao || 'Sem descrição detalhada'}
                      </div>

                      {/* Ação rápida para ver detalhes integrais */}
                      <div className="mt-2.5">
                        <button
                          type="button"
                          id={`btn-detalhes-${oc?.id}`}
                          onClick={() => {
                            if (onVerDetalhes) {
                              onVerDetalhes(oc)
                            } else {
                              setDetalhesModal(oc)
                            }
                          }}
                          className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-neon-cyan hover:text-white transition-colors group"
                        >
                          <span>👁️</span>
                          <span className="group-hover:underline underline-offset-2">Ver Detalhes</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-300">
                      <span
                        className={`rounded px-2 py-1 font-mono text-[11px] ${
                          oc?.tipo === 'ALERTA_CAMPO' || oc?.tipo === 'DEFESA_CIVIL'
                            ? 'border border-neon-amber/40 bg-neon-amber/15 text-neon-amber shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                            : 'bg-white/5 text-slate-300'
                        }`}
                      >
                        {TIPO_LABELS[oc?.tipo] || oc?.tipo || 'Outro'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ${grav.cls}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${grav.dot}`} />
                        {grav.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {precisaApoio ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-red/60 bg-neon-red/20 px-2.5 py-0.5 text-[11px] font-bold text-neon-red ring-1 ring-neon-red/40 animate-pulse shadow-[0_0_12px_rgba(255,42,85,0.4)]">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-red opacity-80" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon-red" />
                          </span>
                          <span>Apoio Solicitado</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ${st.cls}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {/* Se o agente em campo pediu apoio: botão tático 1:N com destaque visual chamativo */}
                        {precisaApoio && onDespachar && (
                          <button
                            type="button"
                            id={`btn-despachar-apoio-${oc?.id}`}
                            onClick={() => onDespachar(oc)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-neon-red bg-neon-red/30 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-neon-red shadow-[0_0_18px_rgba(255,42,85,0.5)] hover:bg-neon-red/45 hover:shadow-[0_0_24px_rgba(255,42,85,0.8)] transition-all animate-pulse"
                            title="Responder à solicitação de apoio: despachar viatura / reforço adicional (Despacho 1:N)"
                          >
                            <span>🚨</span>
                            <span>Despachar Reforço (1:N)</span>
                          </button>
                        )}

                        {/* Se pendente normal (sem pedido de apoio ainda): despacho padrão */}
                        {isPendente && !precisaApoio && onDespachar && (
                          <button
                            type="button"
                            id={`btn-despachar-${oc?.id}`}
                            onClick={() => onDespachar(oc)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-neon-cyan/50 bg-neon-cyan/20 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-neon-cyan shadow-[0_0_12px_rgba(34,229,255,0.25)] hover:bg-neon-cyan/30 hover:shadow-[0_0_18px_rgba(34,229,255,0.4)] transition-all"
                          >
                            <span>⚡</span>
                            <span>Despachar Unidade</span>
                          </button>
                        )}

                        {/* Se despachada/em atendimento: mostra viatura titular */}
                        {(isDespachada || precisaApoio) && oc?.agente_id && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-cyan/30 bg-neon-cyan/10 px-2.5 py-1 text-neon-cyan text-[11px] font-semibold">
                            <span>👮‍♂️</span>
                            <span>{getNomeAgente(oc?.agente_id)}</span>
                          </span>
                        )}

                        {/* Botão para adicionar viatura adicional (Fluxo 1:N contínuo) */}
                        {isDespachada && !precisaApoio && onDespachar && (
                          <button
                            type="button"
                            id={`btn-adicionar-viatura-${oc?.id}`}
                            onClick={() => onDespachar(oc)}
                            className="inline-flex items-center gap-1 rounded border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-1 font-display text-[11px] font-bold text-neon-cyan hover:bg-neon-cyan/25 hover:border-neon-cyan transition-all shadow-[0_0_10px_rgba(34,229,255,0.2)]"
                            title="Despachar viatura / agente adicional para esta ocorrência (Despacho 1:N)"
                          >
                            <span>+</span>
                            <span>Viatura</span>
                          </button>
                        )}

                        {podeEncerrar && (
                          <button
                            type="button"
                            id={`btn-encerrar-${oc?.id}`}
                            disabled={concluindoId === oc?.id}
                            onClick={() => handleConcluir(oc?.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-neon-lime/50 bg-neon-lime/15 px-2.5 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-neon-lime shadow-[0_0_12px_rgba(163,230,53,0.2)] hover:bg-neon-lime/25 hover:border-neon-lime/80 hover:shadow-[0_0_16px_rgba(163,230,53,0.35)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Encerrar ocorrência e liberar todos os agentes vinculados de volta para prontidão"
                          >
                            {concluindoId === oc?.id ? (
                              <span className="animate-spin text-xs">⌛</span>
                            ) : (
                              <span>✓</span>
                            )}
                            <span>Encerrar e Liberar</span>
                          </button>
                        )}

                        {isResolvida && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-lime/40 bg-neon-lime/15 px-2.5 py-1 text-neon-lime text-[11px] font-semibold shadow-[0_0_8px_rgba(163,230,53,0.15)]">
                            <span>✓</span>
                            <span>Resolvida</span>
                          </span>
                        )}

                        {/* Botão de Edição Tática Cyberpunk */}
                        <button
                          type="button"
                          id={`btn-editar-${ocorrencia?.id}`}
                          title="Editar Ocorrência"
                          className="p-2 ml-2 border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_12px_rgba(34,211,238,0.3)] rounded-md transition-all flex items-center justify-center"
                          onClick={() => {
                            if (onEditar) {
                              onEditar(ocorrencia)
                            } else if (setOcorrenciaSelecionada && setModalEditarAberto) {
                              setOcorrenciaSelecionada(ocorrencia)
                              setModalEditarAberto(true)
                            }
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Fallback de Modal Tático caso o componente seja utilizado sem elevação de estado */}
      {!onVerDetalhes && detalhesModal && (
        <DetalhesOcorrenciaModal
          isOpen={Boolean(detalhesModal)}
          onClose={() => setDetalhesModal(null)}
          ocorrencia={detalhesModal}
          agentes={agentes}
          onDespachar={onDespachar}
        />
      )}

    </section>
  )
}
