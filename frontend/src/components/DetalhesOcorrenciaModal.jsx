import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ErrorBoundary from './ErrorBoundary.jsx'
import { ocorrenciasService, relatoriosService } from '../services/api.js'

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

const fmtData = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString('pt-BR')
  } catch {
    return '—'
  }
}

function DetalhesOcorrenciaContent({
  ocorrencia,
  id,
  agentes = [],
  onClose,
  onDespachar,
}) {
  const [dados, setDados] = useState(ocorrencia || null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)
  const [copiado, setCopiado] = useState(false)

  const ocorrenciaId = id || ocorrencia?.id

  // Carrega ou complementa os dados da ocorrência se necessário
  useEffect(() => {
    let ativo = true

    if (ocorrencia) {
      setDados(ocorrencia)
    }

    if (ocorrenciaId && (!ocorrencia || !ocorrencia.descricao)) {
      setLoading(true)
      setErro(null)

      // Tenta obter os dados mais completos possíveis
      Promise.any([
        relatoriosService.detalhesOcorrencia(ocorrenciaId),
        ocorrenciasService.obter(ocorrenciaId),
      ])
        .then((res) => {
          if (ativo && res) {
            setDados((prev) => ({ ...(prev || {}), ...res }))
          }
        })
        .catch((err) => {
          console.warn('[DetalhesOcorrenciaModal] Falha ao sincronizar dados remotos:', err)
          if (ativo && !ocorrencia) {
            setErro(err?.message || 'Não foi possível carregar os detalhes do incidente.')
          }
        })
        .finally(() => {
          if (ativo) setLoading(false)
        })
    }

    return () => {
      ativo = false
    }
  }, [ocorrenciaId, ocorrencia])

  const handleCopiar = () => {
    if (dados?.descricao && navigator.clipboard) {
      navigator.clipboard.writeText(dados.descricao)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }
  }

  // Resolução segura do nome do agente com optional chaining estrito
  const getNomeAgente = () => {
    // 1. Se veio objeto agente aninhado (ex: ocorrencia.agente.nome)
    if (dados?.agente?.nome) {
      return dados.agente.nome
    }

    // 2. Se veio lista de agentes envolvidos (1:N)
    if (Array.isArray(dados?.agentes_envolvidos) && dados.agentes_envolvidos.length > 0) {
      return dados.agentes_envolvidos.map((a) => a?.nome || 'Agente').join(', ')
    }

    // 3. Se veio lista de agentes (1:N)
    if (Array.isArray(dados?.agentes) && dados.agentes.length > 0) {
      return dados.agentes.map((a) => a?.nome || 'Agente').join(', ')
    }

    // 4. Se veio agente_id, busca no array de agentes fornecido
    const agId = dados?.agente_id
    if (agId) {
      const found = (agentes || []).find((a) => String(a?.id) === String(agId))
      if (found?.nome) return found.nome
      return `Agente #${String(agId).slice(0, 8)}`
    }

    return 'Não atribuído'
  }

  // Status e Gravidade com fallback seguro contra erros de chave
  const statusKey = String(dados?.status || '').toUpperCase()
  const gravidadeKey = String(dados?.gravidade || '').toUpperCase()

  const stBadge = STATUS_BADGES[statusKey] || {
    label: dados?.status || 'Pendente',
    cls: 'text-slate-300 border-slate-700 bg-slate-800/40',
    dot: 'bg-slate-400',
  }

  const gravBadge = GRAVIDADE_BADGES[gravidadeKey] || {
    label: dados?.gravidade || 'Média',
    cls: 'text-slate-300 border-slate-700 bg-slate-800/40',
    dot: 'bg-slate-400',
  }

  const tipoFormatado = TIPO_LABELS[dados?.tipo] || dados?.tipo || 'Não especificado'

  // Coordenadas com verificação estrita de NaN/null
  const latVal =
    dados?.latitude != null && !isNaN(Number(dados.latitude))
      ? Number(dados.latitude).toFixed(4)
      : null
  const lngVal =
    dados?.longitude != null && !isNaN(Number(dados.longitude))
      ? Number(dados.longitude).toFixed(4)
      : null

  const dataRegistro = dados?.criado_em || dados?.data_criacao

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-neon-cyan/40 bg-navy-950/95 p-6 shadow-[0_0_50px_rgba(34,229,255,0.25)] text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="flex items-start justify-between border-b border-navy-800 pb-4 mb-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-neon-cyan/80 uppercase tracking-widest">
                Dossiê do Incidente #{String(dados?.id || ocorrenciaId || '—').slice(0, 8)}
              </span>
              {dados?.protocolo && (
                <span className="font-mono text-[11px] rounded bg-navy-800 border border-slate-700 px-2 py-0.5 text-slate-300 font-semibold">
                  Prot: {dados.protocolo}
                </span>
              )}
              {Boolean(dados?.necessita_apoio || dados?.status === 'APOIO_SOLICITADO') && (
                <span className="inline-flex items-center gap-1 rounded-full bg-neon-red/20 border border-neon-red/50 px-2.5 py-0.5 text-[10px] font-bold text-neon-red animate-pulse">
                  🚨 Apoio Solicitado
                </span>
              )}
            </div>
            <h3 className="font-display text-xl font-bold text-white tracking-wide">
              {dados?.titulo || (loading ? 'Carregando detalhes...' : 'Incidente Operacional')}
            </h3>
          </div>
          <button
            type="button"
            id="btn-fechar-detalhes-modal"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-navy-800/80 transition-all font-mono text-sm"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Estado de Carregamento */}
        {loading && !dados && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 font-mono text-xs text-neon-cyan">
            <span className="animate-spin text-2xl">⏳</span>
            <span>Carregando dados completos da telemetria...</span>
          </div>
        )}

        {/* Mensagem de Erro com Fallback */}
        {erro && !dados && (
          <div className="rounded-lg border border-neon-red/40 bg-neon-red/10 p-4 font-mono text-xs text-neon-red mb-5">
            ⚠ {erro}
          </div>
        )}

        {/* Conteúdo Principal (Renderizado com segurança) */}
        {dados && (
          <>
            {/* Badges de Metadados */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5 font-mono text-xs">
              <div className="rounded-lg border border-navy-800 bg-navy-900/60 p-2.5">
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Status</span>
                <span className={`inline-flex items-center gap-1.5 font-semibold ${stBadge.cls} px-2 py-0.5 rounded text-[11px]`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${stBadge.dot}`} />
                  {stBadge.label}
                </span>
              </div>

              <div className="rounded-lg border border-navy-800 bg-navy-900/60 p-2.5">
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Gravidade</span>
                <span className={`inline-flex items-center gap-1.5 font-semibold ${gravBadge.cls} px-2 py-0.5 rounded text-[11px]`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${gravBadge.dot}`} />
                  {gravBadge.label}
                </span>
              </div>

              <div className="rounded-lg border border-navy-800 bg-navy-900/60 p-2.5">
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Tipo</span>
                <span className="font-semibold text-slate-200 truncate block" title={tipoFormatado}>
                  {tipoFormatado}
                </span>
              </div>

              <div className="rounded-lg border border-navy-800 bg-navy-900/60 p-2.5">
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Registro</span>
                <span className="font-semibold text-neon-cyan text-[11px]">
                  {fmtData(dataRegistro)}
                </span>
              </div>
            </div>

            {/* Descrição Integral */}
            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-bold uppercase tracking-wider text-neon-cyan">
                  Descrição Integral (Relato de Campo / Telegram)
                </span>
                {dados?.descricao && (
                  <button
                    type="button"
                    onClick={handleCopiar}
                    className="font-mono text-[11px] text-slate-400 hover:text-neon-cyan transition-colors"
                    title="Copiar descrição"
                  >
                    {copiado ? '✓ Copiado!' : '📋 Copiar Texto'}
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-navy-800 bg-navy-900/80 p-4 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap break-words font-sans">
                {dados?.descricao ? (
                  dados.descricao
                ) : (
                  <span className="italic text-slate-400">Sem descrição detalhada registrada no chamado.</span>
                )}
              </div>
            </div>

            {/* Localização e Unidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 font-mono text-xs">
              <div className="rounded-xl border border-navy-800 bg-navy-900/60 p-3.5 space-y-1.5">
                <span className="text-[10px] uppercase text-slate-400 tracking-wider block">
                  Coordenadas & Localização
                </span>
                {latVal && lngVal ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">
                      📍 {latVal}, {lngVal}
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${dados.latitude},${dados.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neon-cyan hover:underline text-[11px]"
                    >
                      Abrir Mapa ↗
                    </a>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">Coordenadas não capturadas</span>
                )}
              </div>

              <div className="rounded-xl border border-navy-800 bg-navy-900/60 p-3.5 space-y-1.5">
                <span className="text-[10px] uppercase text-slate-400 tracking-wider block">
                  Agente / Efetivo Vinculado
                </span>
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <span>👮‍♂️</span>
                  <span>{getNomeAgente()}</span>
                </span>
              </div>
            </div>

            {/* Timestamps de Despacho e SLA quando disponíveis */}
            {(dados?.data_despacho || dados?.data_conclusao) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 font-mono text-xs">
                {dados?.data_despacho && (
                  <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-2.5">
                    <span className="text-[10px] text-slate-400 uppercase block">Despachado em:</span>
                    <span className="text-amber-300 font-semibold">{fmtData(dados.data_despacho)}</span>
                  </div>
                )}
                {dados?.data_conclusao && (
                  <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-2.5">
                    <span className="text-[10px] text-slate-400 uppercase block">Concluído em:</span>
                    <span className="text-neon-lime font-semibold">{fmtData(dados.data_conclusao)}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Rodapé com Ações */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-navy-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-navy-900 px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:text-white transition-all"
          >
            Fechar
          </button>
          {onDespachar && dados && (
            <button
              type="button"
              onClick={() => {
                const target = dados
                onClose()
                onDespachar(target)
              }}
              className="rounded-lg border border-neon-cyan bg-neon-cyan/20 px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-neon-cyan hover:bg-neon-cyan/35 shadow-[0_0_15px_rgba(34,229,255,0.3)] transition-all"
            >
              ⚡ Despachar Unidade / Reforço
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Componente exportado protegido por ErrorBoundary.
 * Garante que qualquer anomalia de rendering não derrube a aplicação.
 */
export default function DetalhesOcorrenciaModal(props) {
  // Suporta tanto isOpen={Boolean(...)} quanto renderização condicional direta {ocorrencia && <Modal ... />}
  if (props.isOpen === false) return null
  if (!props.isOpen && !props.ocorrencia && !props.id) return null

  const modalNode = (
    <ErrorBoundary
      title="Falha ao Exibir Detalhes da Ocorrência"
      onClose={props.onClose}
      onReset={props.onClose}
    >
      <DetalhesOcorrenciaContent {...props} />
    </ErrorBoundary>
  )

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body)
  }

  return modalNode
}

