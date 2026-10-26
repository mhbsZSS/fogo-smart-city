import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import html2pdf from 'html2pdf.js'
import { relatoriosService } from '../services/api.js'
import { TIPO_LABEL } from './statusConfig.js'
import ErrorBoundary from './ErrorBoundary.jsx'

// Formatação segura de datas com validação rigorosa
const fmtData = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
  } catch {
    return '—'
  }
}

function ParecerIaModalContent({
  isOpen,
  onClose,
  id,
  tipo = 'ocorrencia', // 'ocorrencia' | 'equipamento'
  titulo: propTitulo,
}) {
  // Isolamento estrito de alvo para renderização anti-branco do PDF
  const contentRef = useRef(null)
  const printRef = useRef(null)

  // Estado dos Dados Frios (Telemetria Tradicional)
  const [dadosFrios, setDadosFrios] = useState(null)
  const [loadingDadosFrios, setLoadingDadosFrios] = useState(false)
  const [erroFrios, setErroFrios] = useState(null)

  // Estado dos Insights de IA (Oráculo Gemini)
  const [relatorioIa, setRelatorioIa] = useState(null)
  const [loadingIa, setLoadingIa] = useState(false)
  const [erroIa, setErroIa] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const isEquip = tipo === 'equipamento'

  const exportarPDF = async () => {
    if (!printRef.current) return

    setGerandoPdf(true)
    const rawName = isEquip
      ? (dadosFrios?.tipo || dadosFrios?.numero_serie || 'Ativo')
      : (dadosFrios?.titulo || 'Ocorrencia')
    const nomeSanitizado = String(rawName)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30)

    const prefixo = isEquip ? 'FOGO_Auditoria_Ativo' : 'FOGO_Auditoria_SLA'
    const filename = nomeSanitizado
      ? `${prefixo}_${nomeSanitizado}.pdf`
      : 'FOGO_Auditoria_Gerencial.pdf'

    const opt = {
      margin: 15,
      filename: filename || 'FOGO_Auditoria.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }

    try {
      await html2pdf().set(opt).from(printRef.current).save()
    } catch (err) {
      console.error('Erro ao gerar PDF de auditoria:', err)
    } finally {
      setGerandoPdf(false)
    }
  }

  // Carrega os Dados Frios imediatamente ao abrir o modal
  const carregarDadosFrios = async () => {
    if (!id) return
    setLoadingDadosFrios(true)
    setErroFrios(null)
    try {
      if (isEquip) {
        const data = await relatoriosService.detalhesEquipamento(id)
        setDadosFrios(data || null)
      } else {
        const data = await relatoriosService.detalhesOcorrencia(id)
        setDadosFrios(data || null)
      }
    } catch (err) {
      console.error('Falha ao carregar dados frios de auditoria:', err)
      setErroFrios(
        err?.friendlyMessage ||
          err?.response?.data?.detail ||
          'Erro ao carregar telemetrias operacionais.',
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
  }, [isOpen, id, tipo])

  // Aciona o Oráculo de IA sob demanda
  const handleGerarIa = async () => {
    if (!id) return
    setLoadingIa(true)
    setErroIa(null)
    try {
      if (isEquip) {
        const res = await relatoriosService.parecerEquipamento(id)
        setRelatorioIa(res?.relatorio_markdown || res?.parecer || 'Nenhum parecer retornado.')
      } else {
        const res = await relatoriosService.auditoriaOcorrencia(id)
        setRelatorioIa(res?.relatorio_markdown || res?.parecer || 'Nenhuma auditoria retornada.')
      }
    } catch (err) {
      console.error('Falha ao acionar IA do Oráculo:', err)
      const detail = err?.response?.data?.detail || err?.friendlyMessage || err?.message
      setErroIa(detail || 'Falha ao consultar a API do Gemini.')
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
      console.warn('Não foi possível copiar para a área de transferência', e)
    }
  }

  if (!isOpen) return null

  const tituloModal =
    propTitulo ||
    (isEquip
      ? dadosFrios
        ? `Auditoria do Ativo: ${dadosFrios?.tipo || 'Equipamento'} [${dadosFrios?.numero_serie || 'S/N'}]`
        : 'Auditoria de Equipamento'
      : dadosFrios
      ? `Auditoria de SLA: ${dadosFrios?.titulo || 'Ocorrência'}`
      : 'Auditoria Operacional de SLA')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-auditoria-titulo"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Container Principal */}
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-fogo-900/95 shadow-[0_0_50px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`grid h-10 w-10 place-items-center rounded-xl border font-mono text-lg shadow-lg ${
                isEquip
                  ? 'border-neon-magenta/40 bg-neon-magenta/15 text-neon-magenta shadow-[0_0_15px_rgba(255,42,229,0.3)]'
                  : 'border-neon-cyan/40 bg-neon-cyan/15 text-neon-cyan shadow-[0_0_15px_rgba(34,229,255,0.3)]'
              }`}
            >
              {isEquip ? '📡' : '⚡'}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-neon-cyan">
                  PAINEL DE AUDITORIA MISTO
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  Telemetria Real + Oráculo IA
                </span>
              </div>
              <h2
                id="modal-auditoria-titulo"
                className="mt-0.5 font-display text-base font-bold tracking-wide text-white"
              >
                {tituloModal}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportarPDF}
              disabled={gerandoPdf || loadingDadosFrios || (!dadosFrios && !relatorioIa)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neon-cyan/40 bg-neon-cyan/15 px-3 py-1.5 font-mono text-xs font-semibold text-neon-cyan transition-all hover:bg-neon-cyan/25 hover:border-neon-cyan shadow-[0_0_10px_rgba(34,229,255,0.2)] disabled:opacity-50"
              title="Exportar dossiê de auditoria para documento PDF A4"
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
              aria-label="Fechar modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar">
          <div id="conteudo-auditoria-modal" ref={contentRef} className="w-[1000px] max-w-none bg-[#0f172a] text-slate-100 p-8 space-y-6 font-sans">
          {/* ========================================================================= */}
          {/* 1. SEÇÃO DE DADOS FRIOS (TELEMETRIA TRADICIONAL & SLA MATEMÁTICO)         */}
          {/* ========================================================================= */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-4 break-inside-avoid">
            <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-2">
              <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                <span className="text-neon-cyan">📊</span> DADOS FRIOS DE TELEMETRIA (REGISTROS OFICIAIS)
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                Auditado em tempo real
              </span>
            </div>

            {/* Skeleton Loading enquanto loadingDadosFrios for true */}
            {loadingDadosFrios && (
              <div className="space-y-4 py-2 animate-pulse">
                <div className="flex items-center gap-2 text-xs font-mono text-neon-cyan">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
                  <span>Carregando registros frios do banco de dados...</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 rounded-lg border border-white/5 bg-white/5 p-3">
                      <div className="h-2.5 w-16 bg-white/10 rounded mb-2" />
                      <div className="h-5 w-20 bg-white/20 rounded" />
                    </div>
                  ))}
                </div>
                <div className="h-12 rounded-lg border border-white/5 bg-white/5" />
              </div>
            )}

            {/* Mensagem de Erro dos Dados Frios */}
            {erroFrios && !loadingDadosFrios && (
              <div className="rounded-lg border border-neon-red/30 bg-neon-red/10 p-3 font-mono text-xs text-neon-red">
                ⚠ {erroFrios}
              </div>
            )}

            {/* Dados Frios de Ocorrência (Renderizado ESTRITAMENTE quando disponível) */}
            {!loadingDadosFrios && dadosFrios && !isEquip && (
              <div className="space-y-4">
                {/* Dossiê Descritivo Integral do Incidente (PDF & Auditoria) */}
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <div className="font-display text-sm font-bold text-white tracking-wide">
                      {dadosFrios?.titulo || 'Ocorrência Registrada'}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">
                      PROTOCOLO:{' '}
                      <span className="font-bold text-neon-cyan">
                        #{id ? String(id).slice(0, 8).toUpperCase() : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words font-sans">
                    {dadosFrios?.descricao || 'Sem descrição detalhada registrada no sistema.'}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-[10px] text-slate-500">
                    <span>
                      📍 GPS: {dadosFrios?.latitude !== null && dadosFrios?.latitude !== undefined ? Number(dadosFrios.latitude).toFixed(4) : '—'},{' '}
                      {dadosFrios?.longitude !== null && dadosFrios?.longitude !== undefined ? Number(dadosFrios.longitude).toFixed(4) : '—'}
                    </span>
                    {dadosFrios?.equipamento_id && (
                      <span>
                        · Ativo Vinculado: #{String(dadosFrios.equipamento_id).slice(0, 8).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* 4 Cards de Métricas Principais com Optional Chaining */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Tempo de Resposta (SLA)</div>
                    <div className="mt-1 font-mono text-xl font-bold text-neon-cyan">
                      {dadosFrios?.tempo_resposta_minutos !== null && dadosFrios?.tempo_resposta_minutos !== undefined
                        ? `${dadosFrios?.tempo_resposta_minutos} min`
                        : '—'}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      {dadosFrios?.situacao_sla || 'Não calculada'}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Status Operacional</div>
                    <div className="mt-1 font-mono text-base font-bold text-white">
                      {dadosFrios?.status || '—'}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      {dadosFrios?.tipo || '—'}
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Gravidade</div>
                    <div className="mt-1 font-mono text-base font-bold text-amber-300">
                      {dadosFrios?.gravidade || '—'}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      Impacto Municipal
                    </div>
                  </div>

                  <div className="rounded-lg border border-neon-lime/20 bg-neon-lime/5 p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Efetivo Vinculado</div>
                    <div className="mt-1 font-mono text-xl font-bold text-neon-lime">
                      {(dadosFrios?.agentes_envolvidos || []).length}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      Agente(s) empenhado(s)
                    </div>
                  </div>
                </div>

                {/* Linha do Tempo e Timestamps Reais com Proteção de Nulos */}
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-white/5 bg-white/[0.01] p-3 sm:grid-cols-3">
                  <div>
                    <span className="font-mono text-[10px] text-slate-500 uppercase">1. Abertura do Chamado:</span>
                    <div className="font-mono text-xs text-slate-300 font-semibold">
                      {dadosFrios?.data_criacao ? fmtData(dadosFrios?.data_criacao) : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-500 uppercase">2. Despacho da Viatura:</span>
                    <div className="font-mono text-xs text-amber-300 font-semibold">
                      {dadosFrios?.data_despacho ? fmtData(dadosFrios?.data_despacho) : 'Pendente de despacho'}
                    </div>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-500 uppercase">3. Conclusão do Atendimento:</span>
                    <div className="font-mono text-xs text-neon-lime font-semibold">
                      {dadosFrios?.data_conclusao ? fmtData(dadosFrios?.data_conclusao) : 'Em andamento'}
                    </div>
                  </div>
                </div>

                {/* Lista de Agentes Envolvidos com Proteção em Loops */}
                <div>
                  <div className="font-mono text-[11px] text-slate-400 font-semibold mb-2 flex items-center justify-between">
                    <span>Efetivo Designado para o Atendimento (Equipe Tática 1:N):</span>
                    {(dadosFrios?.agentes_envolvidos || []).length > 0 && (
                      <span className="text-[10px] text-neon-cyan font-mono">
                        {(dadosFrios?.agentes_envolvidos || []).length} agente(s) empenhado(s)
                      </span>
                    )}
                  </div>
                  {(dadosFrios?.agentes_envolvidos || []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(dadosFrios?.agentes_envolvidos || []).map((ag) => (
                        <div
                          key={ag?.id || Math.random()}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
                            ag?.titular
                              ? 'border-neon-cyan/40 bg-neon-cyan/10'
                              : 'border-white/10 bg-white/5'
                          }`}
                        >
                          <span>👮‍♂️</span>
                          <div>
                            <div className="font-medium text-xs text-white flex items-center gap-1.5">
                              <span>{ag?.nome || 'Agente'}</span>
                              {ag?.titular ? (
                                <span className="rounded bg-neon-cyan/20 px-1 py-0.2 text-[9px] font-mono text-neon-cyan font-bold">
                                  TITULAR
                                </span>
                              ) : (
                                <span className="rounded bg-neon-magenta/20 px-1 py-0.2 text-[9px] font-mono text-neon-magenta font-semibold">
                                  APOIO
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400">
                              {TIPO_LABEL[ag?.tipo] || ag?.tipo || 'Operacional'} · {ag?.status || 'DISPONIVEL'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="font-mono text-xs text-slate-500 italic">
                      Nenhum agente despachado para esta ocorrência até o momento.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dados Frios de Equipamento (Renderizado ESTRITAMENTE quando disponível) */}
            {!loadingDadosFrios && dadosFrios && isEquip && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-neon-magenta/20 bg-neon-magenta/5 p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Histórico de Falhas</div>
                    <div className="mt-1 font-mono text-xl font-bold text-neon-magenta">
                      {dadosFrios?.qtd_falhas ?? 0} quebras
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      Ordens de manutenção
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Status do Ativo</div>
                    <div className="mt-1 font-mono text-base font-bold text-white">
                      {dadosFrios?.status || '—'}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      {dadosFrios?.tipo || '—'}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Número de Série</div>
                    <div className="mt-1 font-mono text-xs font-bold text-slate-200 truncate">
                      {dadosFrios?.numero_serie || '—'}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      {dadosFrios?.marca || 'Marca'} {dadosFrios?.modelo || ''}
                    </div>
                  </div>

                  <div className="rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 p-3">
                    <div className="font-mono text-[10px] uppercase text-slate-400">Localização Urbana</div>
                    <div className="mt-1 font-mono text-xs font-bold text-neon-cyan truncate">
                      {dadosFrios?.logradouro || 'Marília/SP'}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      {dadosFrios?.bairro || 'Perímetro urbano'}
                    </div>
                  </div>
                </div>

                {/* Histórico Resumido de Falhas com Loop Protegido */}
                <div>
                  <div className="font-mono text-[11px] text-slate-400 font-semibold mb-2">
                    Ordens de Serviço do Ativo ({dadosFrios?.qtd_falhas ?? 0}):
                  </div>
                  {(dadosFrios?.historico_manutencoes || []).length > 0 ? (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {(dadosFrios?.historico_manutencoes || []).map((m) => (
                        <div
                          key={m?.id || Math.random()}
                          className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-1 text-xs"
                        >
                          <span className="text-slate-300">{m?.titulo || 'Manutenção'}</span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {m?.criado_em ? fmtData(m?.criado_em) : '—'} · {m?.status || 'CONCLUIDO'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="font-mono text-xs text-slate-500 italic">
                      Nenhuma falha ou ordem de serviço registrada para este equipamento. Ativo 100% íntegro.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* 2. SEÇÃO DO ORÁCULO DE IA (ANÁLISE COGNITIVA & INSIGHTS DO GEMINI)        */}
          {/* ========================================================================= */}
          <div className="rounded-xl border border-neon-cyan/20 bg-gradient-to-b from-neon-cyan/[0.04] to-transparent p-5 break-inside-avoid">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-neon-cyan text-base">🧠</span>
                <span className="font-display text-sm font-bold tracking-wider text-white">
                  PARECER DO ORÁCULO PREDITIVO (AI)
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
                  {isEquip
                    ? 'Submeta os dados telemétricos deste ativo ao Oráculo Preditivo para obter a análise de TCO, MTBF e prescrição financeira de manutenção vs. substituição.'
                    : 'Submeta a telemetria deste atendimento ao Oráculo de IA para avaliar a conformidade matemática do SLA, identificar gargalos de rota e medir a eficiência da equipe.'}
                </p>
                <button
                  type="button"
                  id="btn-acionar-oraculo-ia"
                  onClick={handleGerarIa}
                  className="inline-flex items-center gap-2 rounded-lg border border-neon-cyan/50 bg-neon-cyan/20 px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-neon-cyan shadow-[0_0_20px_rgba(34,229,255,0.3)] transition-all hover:bg-neon-cyan/30 hover:shadow-[0_0_30px_rgba(34,229,255,0.5)] focus:outline-none focus:ring-2 focus:ring-neon-cyan/50"
                >
                  <span>🧠</span>
                  <span>Gerar Análise de IA</span>
                </button>
              </div>
            )}

            {/* Estado de Carregamento da IA */}
            {loadingIa && (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 py-6 text-center">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-neon-cyan/20 border-t-neon-cyan" />
                <p className="font-display text-xs font-bold uppercase tracking-wider text-neon-cyan">
                  Processando com Google Gemini...
                </p>
                <p className="font-mono text-[11px] text-slate-400">
                  Cruzando tempos de resposta e histórico operacional (fail-fast 12s)
                </p>
              </div>
            )}

            {/* Erro da IA (Fail-Fast visível sem travar os Dados Frios) */}
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
                <div className="prose prose-invert max-w-none prose-headings:font-display prose-headings:font-bold prose-headings:tracking-wide prose-h1:text-base prose-h1:text-white prose-h2:text-sm prose-h2:text-neon-cyan prose-h3:text-xs prose-h3:text-slate-200 prose-p:text-xs prose-p:leading-relaxed prose-p:text-slate-300 prose-li:text-xs prose-li:text-slate-300 prose-table:text-xs prose-th:border-b prose-th:border-white/10 prose-th:font-mono prose-th:text-slate-400 prose-td:border-b prose-td:border-white/5 prose-hr:border-white/10">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{relatorioIa}</ReactMarkdown>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleGerarIa}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <span>🔄</span>
                    <span>Atualizar Parecer</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 font-mono text-[11px] text-slate-500">
          <span>Sistema F.O.G.O. · Centro Integrado de Comando e Controle</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 bg-white/5 px-4 py-1.5 font-display text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            Fechar Painel
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
            {isEquip ? 'AUDITORIA DE ATIVO E CONFIABILIDADE OPERACIONAL' : 'AUDITORIA DE SLA E CONFORMIDADE DE INCIDENTE'}
          </p>
          <div className="text-xs text-gray-500 mt-2 flex justify-between">
            <span>Identificador: #{id ? String(id).slice(0, 8).toUpperCase() : '—'}</span>
            <span>Emitido em: {new Date().toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {/* Seção 1: Dados Oficiais do Registro */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-1 mb-3 break-inside-avoid">
            1. Registros Oficiais de Telemetria e Cadastro
          </h2>
          {isEquip ? (
            <table className="w-full text-xs border border-gray-300 border-collapse mb-4 table-fixed">
              <tbody>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100 w-1/3">Número de Série / Ativo:</td>
                  <td className="p-2 font-mono font-bold break-words">{dadosFrios?.numero_serie || '—'}</td>
                </tr>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Tipo / Categoria:</td>
                  <td className="p-2 break-words">{dadosFrios?.tipo || '—'}</td>
                </tr>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Status Operacional:</td>
                  <td className="p-2 font-semibold break-words">{dadosFrios?.status || '—'}</td>
                </tr>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Necessidade de Manutenção:</td>
                  <td className="p-2 font-semibold break-words">{dadosFrios?.necessidade_manutencao || 'NENHUMA'}</td>
                </tr>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Histórico de Falhas / Quebras:</td>
                  <td className="p-2 break-words">{dadosFrios?.historico_falhas?.length || 0} registro(s)</td>
                </tr>
                <tr className="break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Localização / Coordenadas:</td>
                  <td className="p-2 font-mono break-words">
                    {dadosFrios?.latitude !== undefined && dadosFrios?.latitude !== null
                      ? `${Number(dadosFrios.latitude).toFixed(4)}, ${Number(dadosFrios.longitude).toFixed(4)}`
                      : dadosFrios?.localizacao || '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs border border-gray-300 border-collapse mb-4 table-fixed">
              <tbody>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100 w-1/3">Protocolo do Incidente:</td>
                  <td className="p-2 font-mono font-bold break-words">#{id ? String(id).slice(0, 8).toUpperCase() : '—'}</td>
                </tr>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Título / Tipo:</td>
                  <td className="p-2 break-words">{dadosFrios?.titulo || '—'} ({dadosFrios?.tipo || '—'})</td>
                </tr>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Status / Gravidade:</td>
                  <td className="p-2 font-semibold break-words">{dadosFrios?.status || '—'} · Gravidade: {dadosFrios?.gravidade || '—'}</td>
                </tr>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Tempo de Resposta (SLA):</td>
                  <td className="p-2 font-semibold break-words">
                    {dadosFrios?.tempo_resposta_minutos !== null && dadosFrios?.tempo_resposta_minutos !== undefined
                      ? `${dadosFrios.tempo_resposta_minutos} min`
                      : '—'}
                    {dadosFrios?.situacao_sla ? ` (${dadosFrios.situacao_sla})` : ''}
                  </td>
                </tr>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Efetivo Designado:</td>
                  <td className="p-2 break-words">
                    {dadosFrios?.agentes?.length
                      ? dadosFrios.agentes.map((a) => a.nome).join(', ')
                      : (dadosFrios?.agente?.nome || 'Nenhum agente designado')}
                  </td>
                </tr>
                <tr className="break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Descrição do Incidente:</td>
                  <td className="p-2 break-words">{dadosFrios?.descricao || 'Sem descrição cadastrada.'}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Seção 2: Parecer do Oráculo Preditivo (IA) - Quebra natural de página */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-1 mb-3 break-inside-avoid">
            2. Parecer Técnico e Diagnóstico do Oráculo IA
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
              Nenhum parecer emitido pela IA para este registro até o momento.
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

export default function ParecerIaModal(props) {
  if (!props.isOpen) return null

  return (
    <ErrorBoundary
      title="Falha no Módulo de Auditoria SLA / IA"
      onClose={props.onClose}
      onReset={props.onClose}
    >
      <ParecerIaModalContent {...props} />
    </ErrorBoundary>
  )
}

