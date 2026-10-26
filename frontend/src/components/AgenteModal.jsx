import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import html2pdf from 'html2pdf.js'
import { relatoriosService } from '../services/api.js'
import { STATUS_AGENTE, TIPO_LABEL } from './statusConfig.js'

const fmtData = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
  } catch {
    return '—'
  }
}

export default function AgenteModal({ isOpen, onClose, id }) {
  // Isolamento estrito de alvo para exportação de PDF
  const contentRef = useRef(null)
  const printRef = useRef(null)

  // Estado dos Dados Frios (Telemetria do Efetivo)
  const [dadosFrios, setDadosFrios] = useState(null)
  const [loadingDadosFrios, setLoadingDadosFrios] = useState(false)
  const [erroFrios, setErroFrios] = useState(null)

  // Estado dos Insights de RH do Oráculo (Gemini)
  const [relatorioIa, setRelatorioIa] = useState(null)
  const [loadingIa, setLoadingIa] = useState(false)
  const [erroIa, setErroIa] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const exportarPDF = async () => {
    if (!printRef.current) return

    setGerandoPdf(true)
    const rawName = dadosFrios?.nome || 'Agente'
    const nomeSanitizado = String(rawName)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30)

    const filename = `FOGO_Auditoria_Agente_${nomeSanitizado}.pdf`

    const opt = {
      margin: 15,
      filename: filename || 'FOGO_Auditoria_Agente.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }

    try {
      await html2pdf().set(opt).from(printRef.current).save()
    } catch (err) {
      console.error('Erro ao gerar PDF do agente:', err)
    } finally {
      setGerandoPdf(false)
    }
  }

  const carregarDadosFrios = async () => {
    if (!id) return
    setLoadingDadosFrios(true)
    setErroFrios(null)
    setDadosFrios(null)
    try {
      const data = await relatoriosService.detalhesAgente(id)
      setDadosFrios(data || null)
    } catch (err) {
      console.error('Falha ao carregar telemetria do agente:', err)
      setErroFrios(
        err?.friendlyMessage ||
          err?.response?.data?.detail ||
          'Erro ao carregar dados operacionais do agente.',
      )
    } finally {
      setLoadingDadosFrios(false)
    }
  }

  useEffect(() => {
    if (isOpen && id) {
      setDadosFrios(null)
      setRelatorioIa(null)
      setErroIa(null)
      carregarDadosFrios()
    } else {
      setDadosFrios(null)
      setErroFrios(null)
      setRelatorioIa(null)
      setErroIa(null)
    }
  }, [isOpen, id])

  const handleGerarIa = async () => {
    if (!id) return
    setLoadingIa(true)
    setErroIa(null)
    try {
      const res = await relatoriosService.parecerAgente(id)
      setRelatorioIa(res?.relatorio_markdown || res?.parecer || 'Nenhum parecer retornado.')
    } catch (err) {
      console.error('Falha ao acionar IA de RH:', err)
      const detail = err?.response?.data?.detail || err?.friendlyMessage || err?.message
      setErroIa(detail || 'Falha ao consultar a inteligência de RH.')
    } finally {
      setLoadingIa(false)
    }
  }

  const handleCopiar = () => {
    if (!relatorioIa) return
    try {
      navigator.clipboard.writeText(relatorioIa)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch (e) {
      console.warn('Erro ao copiar relatório', e)
    }
  }

  if (!isOpen) return null

  const stCfg = STATUS_AGENTE[dadosFrios?.status] || {
    label: dadosFrios?.status || '—',
    dot: 'bg-slate-500',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-agente-titulo"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Container Principal */}
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-amber-400/30 bg-fogo-900/95 shadow-[0_0_50px_rgba(251,191,36,0.25)] overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-400/40 bg-amber-400/15 font-mono text-lg text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
              👮‍♂️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  FICHA DE DESEMPENHO DO EFETIVO
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  Telemetria Real + Oráculo de RH
                </span>
              </div>
              <h2
                id="modal-agente-titulo"
                className="mt-0.5 font-display text-base font-bold tracking-wide text-white"
              >
                {dadosFrios?.nome || 'Carregando Agente...'}
                {dadosFrios?.id && (
                  <span className="ml-2 font-mono text-xs font-normal text-slate-400">
                    #{dadosFrios.id.slice(0, 8).toUpperCase()}
                  </span>
                )}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportarPDF}
              disabled={gerandoPdf || loadingDadosFrios || (!dadosFrios && !relatorioIa)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 py-1.5 font-mono text-xs font-semibold text-amber-300 transition-all hover:bg-amber-400/25 hover:border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.2)] disabled:opacity-50"
              title="Exportar ficha de desempenho do agente para PDF A4"
            >
              <span>{gerandoPdf ? '⏳' : '📄'}</span>
              <span className="hidden sm:inline">{gerandoPdf ? 'Exportando...' : 'Exportar PDF'}</span>
            </button>

            {relatorioIa && (
              <button
                type="button"
                onClick={handleCopiar}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                title="Copiar relatório em Markdown"
              >
                <span>{copiado ? '✓' : '📋'}</span>
                <span>{copiado ? 'Copiado!' : 'Copiar IA'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 font-mono text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Fechar ficha do agente"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar">
          <div id="conteudo-agente-modal" ref={contentRef} className="w-[1000px] max-w-none bg-[#0f172a] text-slate-100 p-8 space-y-6 font-sans">
          {/* ========================================================================= */}
          {/* 1. SEÇÃO DE TELEMETRIA DO AGENTE (KPIs)                                  */}
          {/* ========================================================================= */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-4 break-inside-avoid">
            <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-2">
              <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                <span className="text-amber-300">📊</span> DADOS OPERACIONAIS DO EFETIVO
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                Auditado em tempo real
              </span>
            </div>

            {loadingDadosFrios && (
              <div className="space-y-4 py-3 animate-pulse">
                <div className="flex items-center gap-2 text-xs font-mono text-amber-300">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
                  <span>Carregando telemetria operacional do agente...</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 rounded-lg border border-white/5 bg-white/5 p-3">
                      <div className="h-2.5 w-16 bg-white/10 rounded mb-2" />
                      <div className="h-5 w-20 bg-white/20 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {erroFrios && !loadingDadosFrios && (
              <div className="rounded-lg border border-neon-red/30 bg-neon-red/10 p-3 font-mono text-xs text-neon-red">
                ⚠ {erroFrios}
              </div>
            )}

            {!loadingDadosFrios && dadosFrios && (
              <div className="space-y-4">
                {/* 4 Cards de Métricas */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Total Despachos</div>
                    <div className="mt-1 font-mono text-xl font-bold text-white">
                      {dadosFrios?.total_despachos ?? 0}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      Chamados atribuídos
                    </div>
                  </div>

                  <div className="rounded-lg border border-neon-lime/20 bg-neon-lime/5 p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Concluídas</div>
                    <div className="mt-1 font-mono text-xl font-bold text-neon-lime">
                      {dadosFrios?.concluidas ?? 0}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      Resoluções registradas
                    </div>
                  </div>

                  <div className="rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Tempo Médio Atendimento</div>
                    <div className="mt-1 font-mono text-xl font-bold text-neon-cyan">
                      {dadosFrios?.tempo_medio_minutos !== null && dadosFrios?.tempo_medio_minutos !== undefined
                        ? `${dadosFrios?.tempo_medio_minutos} min`
                        : '—'}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      Despacho até conclusão
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Status & Força</div>
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300">
                      <span className={`h-2 w-2 rounded-full ${stCfg.dot}`} />
                      <span>{stCfg.label}</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400 truncate">
                      {TIPO_LABEL[dadosFrios?.tipo] || dadosFrios?.tipo || 'Operacional'}
                    </div>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* ÁREA ROLÁVEL: HISTÓRICO DE OPERAÇÕES EM CAMPO                           */}
                {/* ========================================================================= */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Histórico de Operações em Campo ({(dadosFrios?.historico_atendimentos || []).length}):
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      Registro temporal individual
                    </span>
                  </div>

                  {(dadosFrios?.historico_atendimentos || []).length > 0 ? (
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-white/5 bg-black/30 divide-y divide-white/[0.04]">
                      {dadosFrios.historico_atendimentos.map((atend) => (
                        <div
                          key={atend.ocorrencia_id}
                          className="flex flex-col gap-2 p-3 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-xs text-slate-200 truncate">
                                {atend.titulo}
                              </span>
                              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                                {atend.tipo}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 font-mono text-[11px] text-slate-400">
                              <span>
                                🕒 {atend.data_despacho ? fmtData(atend.data_despacho) : 'Sem timestamp'}
                              </span>
                              <span>·</span>
                              <span className={atend.status === 'RESOLVIDA' ? 'text-neon-lime' : 'text-neon-cyan'}>
                                {atend.status}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 font-mono text-xs">
                            <div className="text-right">
                              <div className="text-[10px] uppercase text-slate-500">Duração:</div>
                              <div className="font-bold text-white">
                                {atend.tempo_duracao_minutos !== null && atend.tempo_duracao_minutos !== undefined
                                  ? `${atend.tempo_duracao_minutos} min`
                                  : atend.situacao || 'Em andamento'}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-white/5 bg-black/20 p-6 text-center font-mono text-xs text-slate-500">
                      Nenhum histórico de ocorrência registrado para este agente até o momento.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* 2. SEÇÃO DO ORÁCULO DE IA DE RH (AVALIAÇÃO DE DESEMPENHO DO GEMINI)       */}
          {/* ========================================================================= */}
          <div className="rounded-xl border border-amber-400/30 bg-gradient-to-b from-amber-400/[0.04] to-transparent p-5 break-inside-avoid">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-300 text-base">🧠</span>
                <span className="font-display text-sm font-bold tracking-wider text-white">
                  DIAGNÓSTICO DO ORÁCULO DE RH (IA)
                </span>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                Google Gemini 1.5 Flash
              </span>
            </div>

            {/* Banner inicial quando ainda não foi gerado */}
            {!relatorioIa && !loadingIa && !erroIa && (
              <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                <p className="max-w-md font-sans text-xs text-slate-300">
                  Submeta o histórico operacional e tempos de resposta deste profissional ao Oráculo de IA para avaliar a carga de trabalho, produtividade de turno e recomendações de escala.
                </p>
                <button
                  type="button"
                  id="btn-avaliar-desempenho-ia"
                  onClick={handleGerarIa}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-400/20 px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.3)] transition-all hover:bg-amber-400/30 hover:shadow-[0_0_30px_rgba(251,191,36,0.5)] focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                >
                  <span>🧠</span>
                  <span>Avaliar Desempenho (IA)</span>
                </button>
              </div>
            )}

            {/* Estado de Carregamento da IA */}
            {loadingIa && (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 py-6 text-center">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-amber-400/20 border-t-amber-400" />
                <p className="font-display text-xs font-bold uppercase tracking-wider text-amber-300">
                  Processando Diagnóstico de RH com Google Gemini...
                </p>
                <p className="font-mono text-[11px] text-slate-400">
                  Avaliando tempos médios de resposta, histórico de campo e carga operacional (fail-fast 12s)
                </p>
              </div>
            )}

            {/* Erro da IA */}
            {erroIa && !loadingIa && (
              <div className="rounded-lg border border-neon-red/30 bg-neon-red/10 p-4 text-center">
                <span className="text-xl">⚠️</span>
                <p className="mt-1 font-mono text-xs text-neon-red font-semibold">
                  {erroIa}
                </p>
                <button
                  type="button"
                  onClick={handleGerarIa}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-neon-red/40 bg-neon-red/20 px-3 py-1.5 font-display text-xs font-bold uppercase text-white hover:bg-neon-red/30"
                >
                  Tentar Novamente
                </button>
              </div>
            )}

            {/* Relatório de IA Gerado com Sucesso */}
            {!loadingIa && relatorioIa && (
              <div>
                <div className="prose prose-invert max-w-none prose-headings:font-display prose-headings:font-bold prose-headings:tracking-wide prose-h1:text-base prose-h1:text-white prose-h2:text-sm prose-h2:text-amber-300 prose-h3:text-xs prose-h3:text-slate-200 prose-p:text-xs prose-p:leading-relaxed prose-p:text-slate-300 prose-li:text-xs prose-li:text-slate-300 prose-table:text-xs prose-th:border-b prose-th:border-white/10 prose-th:font-mono prose-th:text-slate-400 prose-td:border-b prose-td:border-white/5 prose-hr:border-white/10">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{relatorioIa}</ReactMarkdown>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleGerarIa}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <span>🔄</span>
                    <span>Atualizar Diagnóstico</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 font-mono text-[11px] text-slate-500">
          <span>Sistema F.O.G.O. · Gestão Estratégica de Pessoas e Efetivo</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 bg-white/5 px-4 py-1.5 font-display text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            Fechar Ficha
          </button>
        </div>
      </div>

      {/* Wrapper invisível que não quebra o html2canvas */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div
          ref={printRef}
          className="w-[680px] bg-white text-black p-8 font-sans break-words whitespace-pre-wrap"
        >
          {/* Cabeçalho Oficial */}
        <div className="text-center border-b border-gray-300 pb-4 mb-6">
          <h1 className="text-xl font-bold uppercase tracking-wide text-black break-inside-avoid">
            F.O.G.O. - SISTEMA ONISCIENTE DE GESTÃO E OPERAÇÕES
          </h1>
          <p className="text-sm font-semibold text-gray-700 mt-1">
            AVALIAÇÃO DE DESEMPENHO E REGISTRO OPERACIONAL DO EFETIVO
          </p>
          <div className="text-xs text-gray-500 mt-2 flex justify-between">
            <span>Agente: {dadosFrios?.nome || '—'} · Matrícula: #{id ? String(id).slice(0, 8).toUpperCase() : '—'}</span>
            <span>Emitido em: {new Date().toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {/* 1. Indicadores do Agente */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-1 mb-3 break-inside-avoid">
            1. Indicadores Operacionais e Cadastrais
          </h2>
          <table className="w-full text-xs border border-gray-300 border-collapse mb-4 table-fixed">
            <tbody>
              <tr className="border-b border-gray-300 break-inside-avoid">
                <td className="p-2 font-bold bg-gray-100 w-1/3">Nome do Profissional:</td>
                <td className="p-2 font-bold break-words">{dadosFrios?.nome || '—'}</td>
              </tr>
              <tr className="border-b border-gray-300 break-inside-avoid">
                <td className="p-2 font-bold bg-gray-100">Especialidade / Força:</td>
                <td className="p-2 break-words">{TIPO_LABEL[dadosFrios?.tipo] || dadosFrios?.tipo || 'Operacional'}</td>
              </tr>
              <tr className="border-b border-gray-300 break-inside-avoid">
                <td className="p-2 font-bold bg-gray-100">Status Atual:</td>
                <td className="p-2 font-semibold break-words">{dadosFrios?.status || '—'}</td>
              </tr>
              <tr className="border-b border-gray-300 break-inside-avoid">
                <td className="p-2 font-bold bg-gray-100">Total de Despachos Atribuídos:</td>
                <td className="p-2 break-words">{dadosFrios?.total_despachos ?? 0} chamado(s)</td>
              </tr>
              <tr className="border-b border-gray-300 break-inside-avoid">
                <td className="p-2 font-bold bg-gray-100">Ocorrências Concluídas:</td>
                <td className="p-2 font-semibold text-green-700 break-words">{dadosFrios?.concluidas ?? 0} resolvida(s)</td>
              </tr>
              <tr className="break-inside-avoid">
                <td className="p-2 font-bold bg-gray-100">Tempo Médio de Atendimento (TMA):</td>
                <td className="p-2 font-semibold break-words">
                  {dadosFrios?.tempo_medio_minutos !== null && dadosFrios?.tempo_medio_minutos !== undefined
                    ? `${dadosFrios.tempo_medio_minutos} min`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 2. Histórico de Atendimentos em Campo */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-1 mb-3 break-inside-avoid">
            2. Histórico Recente de Operações em Campo
          </h2>
          <table className="w-full text-xs border border-gray-300 border-collapse table-fixed">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300 break-inside-avoid">
                <th className="p-2 text-left">Ocorrência</th>
                <th className="p-2 text-left w-24">Tipo</th>
                <th className="p-2 text-left w-36">Timestamp Despacho</th>
                <th className="p-2 text-left w-20">Duração</th>
                <th className="p-2 text-left w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {(dadosFrios?.historico_atendimentos || []).slice(0, 15).map((atend) => (
                <tr key={atend.ocorrencia_id} className="border-b border-gray-200 break-inside-avoid">
                  <td className="p-2 font-medium break-words">{atend.titulo}</td>
                  <td className="p-2 break-words">{atend.tipo}</td>
                  <td className="p-2 break-words">{atend.data_despacho ? fmtData(atend.data_despacho) : '—'}</td>
                  <td className="p-2 break-words">
                    {atend.tempo_duracao_minutos !== null && atend.tempo_duracao_minutos !== undefined
                      ? `${atend.tempo_duracao_minutos} min`
                      : atend.situacao || 'Em andamento'}
                  </td>
                  <td className="p-2 font-semibold break-words">{atend.status}</td>
                </tr>
              ))}
              {(!dadosFrios?.historico_atendimentos || dadosFrios.historico_atendimentos.length === 0) && (
                <tr className="break-inside-avoid">
                  <td colSpan="5" className="p-2 text-center text-gray-500">
                    Nenhum histórico de ocorrência registrado para este agente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 3. Diagnóstico do Oráculo de RH (IA) - Quebra natural de página */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-1 mb-3 break-inside-avoid">
            3. Parecer e Diagnóstico de Desempenho (Oráculo de RH)
          </h2>
          {relatorioIa ? (
            <div className="text-xs text-gray-800 leading-relaxed mb-3 break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ node, ...props }) => <h1 className="text-sm font-bold text-gray-900 mt-3 mb-1 border-b border-gray-200 pb-0.5 break-inside-avoid" {...props} />,
                  h2: ({ node, ...props }) => <h2 className="text-xs font-bold text-gray-900 mt-2 mb-1 border-b border-gray-100 pb-0.5 break-inside-avoid" {...props} />,
                  h3: ({ node, ...props }) => <h3 className="text-xs font-semibold text-gray-800 mt-2 mb-1 break-inside-avoid" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1 text-xs text-gray-800" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1 text-xs text-gray-800" {...props} />,
                  li: ({ node, ...props }) => <li className="text-xs text-gray-800 break-words" {...props} />,
                  table: ({ node, ...props }) => (
                    <table className="w-full table-fixed border-collapse my-4" {...props} />
                  ),
                  thead: ({ node, ...props }) => (
                    <thead className="bg-gray-100 break-inside-avoid" {...props} />
                  ),
                  tr: ({ node, ...props }) => (
                    <tr className="border-b border-gray-200 break-inside-avoid" {...props} />
                  ),
                  th: ({ node, ...props }) => (
                    <th className="border border-gray-300 p-2 text-left text-sm font-bold break-words whitespace-normal" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td className="border border-gray-300 p-2 text-sm break-words whitespace-normal align-top" {...props} />
                  ),
                  p: ({ node, ...props }) => (
                    <p className="mb-2 whitespace-pre-wrap break-words text-justify" {...props} />
                  ),
                }}
              >
                {typeof relatorioIa === 'string'
                  ? relatorioIa
                  : relatorioIa?.parecer || relatorioIa?.relatorio_markdown || JSON.stringify(relatorioIa, null, 2)}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">
              Nenhuma avaliação neural de RH gerada para este agente até o momento.
            </p>
          )}
        </div>

        {/* Rodapé Oficial */}
        <div className="border-t border-gray-300 mt-8 pt-3 text-center text-xs text-gray-500 font-sans break-inside-avoid">
          Documento gerado por: Admin CICC (Comando de Operações)
        </div>
      </div>
    </div>
    </div>
  )
}
