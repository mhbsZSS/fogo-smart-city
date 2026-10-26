import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import html2pdf from 'html2pdf.js'
import { iaService } from '../services/api.js'

const FILTROS = [
  { id: 'geral', label: 'Visão Geral', icon: '🌐', desc: 'Diagnóstico sistêmico e intermodal' },
  { id: 'ocorrencias', label: 'Foco em Ocorrências', icon: '🚨', desc: 'Hotspots, colisões e incidentes' },
  { id: 'equipamentos', label: 'Foco em Equipamentos', icon: '📡', desc: 'Integridade, radares e onda verde' },
  { id: 'agentes', label: 'Foco em Agentes', icon: '👮', desc: 'Alocação de efetivo e patrulhamento' },
]

export default function OraculoModal({ isOpen, onClose }) {
  const contentRef = useRef(null)
  const printRef = useRef(null)
  const [tipoAtivo, setTipoAtivo] = useState('geral')
  const [loading, setLoading] = useState(false)
  const [relatorio, setRelatorio] = useState('')
  const [metadados, setMetadados] = useState(null)
  const [erro, setErro] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const requisitarAnalise = async (tipo) => {
    setLoading(true)
    setErro(null)
    setCopiado(false)
    try {
      const data = await iaService.analisar(tipo)
      setRelatorio(data.relatorio_markdown || 'Nenhum dado retornado.')
      setMetadados({
        timestamp: data.timestamp,
        modelo: data.modelo,
        status: data.status,
      })
    } catch (err) {
      setErro(
        err.friendlyMessage ||
          err.response?.data?.detail ||
          'Falha na comunicação com o motor de Inteligência Preditiva.',
      )
    } finally {
      setLoading(false)
    }
  }

  // Ao abrir o modal, executa a análise inicial se ainda não tiver relatório
  useEffect(() => {
    if (isOpen) {
      requisitarAnalise(tipoAtivo)
    }
  }, [isOpen])

  const handleMudarFiltro = (novoTipo) => {
    if (novoTipo === tipoAtivo && relatorio && !erro) return
    setTipoAtivo(novoTipo)
    requisitarAnalise(novoTipo)
  }

  const handleCopiar = () => {
    if (!relatorio) return
    navigator.clipboard.writeText(relatorio)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  const gerarPDF = async () => {
    if (!printRef.current) return

    setGerandoPdf(true)
    const filename = `FOGO_Relatorio_Tatico_Inteligencia_${tipoAtivo}.pdf`
    const opt = {
      margin: 15,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }

    try {
      await html2pdf().set(opt).from(printRef.current).save()
    } catch (err) {
      console.error('Erro ao gerar PDF do Oráculo:', err)
    } finally {
      setGerandoPdf(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in"
    >
      <div className="relative flex flex-col w-full max-w-5xl h-[90vh] rounded-2xl border border-neon-cyan/40 bg-fogo-950/95 shadow-[0_0_50px_rgba(34,229,255,0.2),inset_0_0_20px_rgba(255,43,214,0.1)] overflow-hidden">
        {/* Barra superior de acento neon */}
        <div className="h-1 w-full bg-gradient-to-r from-neon-cyan via-neon-magenta to-ember-500" />

        {/* Cabeçalho do Modal */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-4 bg-fogo-900/60">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neon-magenta/50 bg-neon-magenta/10 shadow-[0_0_15px_rgba(255,43,214,0.3)]">
              <span className="text-xl">🧠</span>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-cyan opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-neon-cyan" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-lg font-black tracking-wider text-white">
                  ORÁCULO TÁTICO
                </h2>
                <span className="rounded-full border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neon-cyan shadow-[0_0_10px_rgba(34,229,255,0.2)]">
                  Gemini 1.5 Flash
                </span>
                <span className="hidden sm:inline rounded-full border border-neon-magenta/40 bg-neon-magenta/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neon-magenta">
                  Cidade Preditiva
                </span>
              </div>
              <p className="font-mono text-xs text-slate-400">
                Detecção de anomalias, análise de hotspots e prescrição operacional · Marília/SP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopiar}
              disabled={!relatorio || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-white/25 hover:bg-white/10 transition-colors disabled:opacity-40"
              title="Copiar relatório em Markdown"
            >
              <span>{copiado ? '✓' : '📋'}</span>
              <span className="hidden sm:inline">{copiado ? 'Copiado!' : 'Copiar'}</span>
            </button>
            <button
              type="button"
              onClick={gerarPDF}
              disabled={!relatorio || loading || gerandoPdf}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ember-500/50 bg-ember-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-ember-400 hover:bg-ember-500/20 hover:border-ember-400 transition-colors disabled:opacity-40 shadow-[0_0_12px_rgba(255,94,26,0.15)]"
              title="Exportar relatório para documento PDF A4"
            >
              <span>{gerandoPdf ? '⏳' : '📄'}</span>
              <span className="hidden sm:inline">{gerandoPdf ? 'Exportando...' : 'Exportar PDF'}</span>
            </button>
            <button
              type="button"
              onClick={() => requisitarAnalise(tipoAtivo)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 px-3 py-1.5 font-mono text-xs font-semibold text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan transition-colors disabled:opacity-40"
              title="Reexecutar inferência"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden sm:inline">Recalcular</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:border-neon-red/50 hover:bg-neon-red/10 hover:text-neon-red transition-all ml-2"
              aria-label="Fechar Oráculo"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Barra de Filtros de Análise IA */}
        <div className="border-b border-white/10 bg-fogo-900/40 px-6 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Filtros de Análise IA:
            </span>
            <div className="flex flex-wrap gap-2">
              {FILTROS.map((f) => {
                const ativo = tipoAtivo === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleMudarFiltro(f.id)}
                    disabled={loading}
                    className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-mono text-xs font-semibold transition-all duration-200 ${
                      ativo
                        ? 'border border-neon-cyan bg-neon-cyan/20 text-neon-cyan shadow-[0_0_15px_rgba(34,229,255,0.3)]'
                        : 'border border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:bg-white/[0.08] hover:text-slate-200'
                    }`}
                  >
                    <span>{f.icon}</span>
                    <span>{f.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Área Central de Conteúdo */}
        <div className="relative flex-1 overflow-y-auto overflow-x-auto p-6 text-slate-200 custom-scrollbar">
          {loading && (
            <div className="flex h-full flex-col items-center justify-center space-y-4 py-16 text-center">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <div className="absolute inset-0 animate-ping rounded-full border border-neon-cyan/40 bg-neon-cyan/10" />
                <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-neon-magenta border-r-neon-cyan" />
                <span className="text-2xl animate-pulse">📡</span>
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-base font-bold tracking-wider text-neon-cyan">
                  Sincronizando com Motor Preditivo...
                </h3>
                <p className="font-mono text-xs text-slate-400">
                  Cruzando telemetria de semáforos, histórico de sabotagem e hotspots de acidentes
                </p>
                <div className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[10px] text-neon-magenta">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon-magenta" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon-magenta [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon-magenta [animation-delay:0.4s]" />
                  <span>CONSULTANDO GEMINI 1.5 FLASH COGNITIVE CORE</span>
                </div>
              </div>
            </div>
          )}

          {!loading && erro && (
            <div className="rounded-xl border border-neon-red/40 bg-neon-red/10 p-6 text-center font-mono">
              <div className="text-3xl text-neon-red mb-2">⚠</div>
              <h4 className="font-bold text-neon-red text-sm">Falha no Processamento Preditivo</h4>
              <p className="mt-1 text-xs text-slate-300">{erro}</p>
              <button
                type="button"
                onClick={() => requisitarAnalise(tipoAtivo)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-neon-red/50 bg-neon-red/20 px-4 py-2 text-xs font-bold text-neon-red hover:bg-neon-red/30 transition-all"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {!loading && !erro && relatorio && (
            <div id="relatorio-oraculo" ref={contentRef} className="w-[1000px] max-w-none bg-[#0f172a] text-slate-100 p-8 rounded-xl shadow-inner font-sans break-inside-avoid">
              <article className="prose prose-invert prose-cyan max-w-none font-sans leading-relaxed text-slate-200">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ node, ...props }) => (
                      <div className="my-6 overflow-hidden rounded-xl border border-neon-cyan/40 bg-fogo-900/90 shadow-[0_0_25px_rgba(34,229,255,0.12),inset_0_0_15px_rgba(34,229,255,0.03)]">
                        <div className="overflow-x-auto custom-scrollbar">
                          <table className="w-full min-w-[560px] border-collapse text-left font-mono text-xs text-slate-200" {...props} />
                        </div>
                      </div>
                    ),
                    thead: ({ node, ...props }) => (
                      <thead className="border-b border-neon-cyan/40 bg-fogo-800/95 text-neon-cyan" {...props} />
                    ),
                    th: ({ node, ...props }) => (
                      <th className="border-r border-white/10 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-neon-cyan last:border-r-0" {...props} />
                    ),
                    tbody: ({ node, ...props }) => (
                      <tbody className="divide-y divide-white/5" {...props} />
                    ),
                    tr: ({ node, ...props }) => (
                      <tr className="transition-colors hover:bg-neon-cyan/[0.07] even:bg-white/[0.02]" {...props} />
                    ),
                    td: ({ node, ...props }) => (
                      <td className="border-r border-white/5 px-4 py-2.5 font-mono text-xs text-slate-300 last:border-r-0" {...props} />
                    ),
                    blockquote: ({ node, ...props }) => (
                      <blockquote className="my-4 rounded-r-lg border-l-4 border-neon-amber bg-neon-amber/10 px-4 py-3 font-mono text-xs text-amber-200 shadow-[inset_0_0_15px_rgba(255,197,49,0.08)]" {...props} />
                    ),
                    h1: ({ node, ...props }) => (
                      <h1 className="mb-4 mt-2 border-b border-white/10 pb-3 font-display text-xl font-bold tracking-wider text-neon-cyan" {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2 className="mb-3 mt-6 font-display text-base font-bold tracking-wide text-neon-magenta" {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3 className="mb-2 mt-4 font-mono text-sm font-semibold tracking-wide text-ember-400" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                      <strong className="font-semibold text-neon-cyan" {...props} />
                    ),
                    code: ({ node, inline, ...props }) =>
                      inline ? (
                        <code className="rounded border border-neon-cyan/30 bg-neon-cyan/10 px-1.5 py-0.5 font-mono text-[11px] text-neon-cyan" {...props} />
                      ) : (
                        <code className="block overflow-x-auto rounded-lg border border-white/10 bg-fogo-950 p-3 font-mono text-xs text-neon-cyan" {...props} />
                      ),
                  }}
                >
                  {relatorio}
                </ReactMarkdown>
              </article>
            </div>
          )}
        </div>

        {/* Rodapé do Modal com Informações Operacionais */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-fogo-900/70 px-6 py-3 font-mono text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-neon-lime">
              <span className="h-2 w-2 rounded-full bg-neon-lime animate-ping" />
              SISTEMA OPERACIONAL
            </span>
            <span>·</span>
            <span>Motor: <span className="text-slate-200">{metadados?.modelo || 'gemini-1.5-flash'}</span></span>
            {metadados?.timestamp && (
              <>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline text-slate-500">
                  {new Date(metadados.timestamp).toLocaleTimeString('pt-BR')}
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 border border-white/10 px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
          >
            Fechar Oráculo
          </button>
        </div>
      </div>

      {/* Template de Impressão Oculto (Oráculo Preditivo Corporativo) */}
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
              RELATÓRIO TÁTICO DE INTELIGÊNCIA PREDITIVA (ORÁCULO IA)
            </p>
            <div className="text-xs text-gray-500 mt-2 flex justify-between">
              <span>Âmbito Analisado: {FILTROS.find((f) => f.id === tipoAtivo)?.label || tipoAtivo}</span>
              <span>Emitido em: {new Date().toLocaleString('pt-BR')}</span>
            </div>
          </div>

          {/* 1. Metadados Operacionais */}
          <div className="mb-6">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-1 mb-3 break-inside-avoid">
              1. Identificação da Análise Neural
            </h2>
            <table className="w-full text-xs border border-gray-300 border-collapse table-fixed">
              <tbody>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100 w-1/3">Motor de IA:</td>
                  <td className="p-2 font-mono break-words">{metadados?.modelo || 'Google Gemini 1.5 Flash'}</td>
                </tr>
                <tr className="border-b border-gray-300 break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Foco Analítico:</td>
                  <td className="p-2 break-words">{FILTROS.find((f) => f.id === tipoAtivo)?.desc || tipoAtivo}</td>
                </tr>
                <tr className="break-inside-avoid">
                  <td className="p-2 font-bold bg-gray-100">Timestamp de Inferência:</td>
                  <td className="p-2 break-words">
                    {metadados?.timestamp ? new Date(metadados.timestamp).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 2. Diagnóstico e Prescrição Preditiva - Quebra natural de página */}
          <div className="mb-6">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-1 mb-3 break-inside-avoid">
              2. Parecer Técnico e Prescrição Operacional
            </h2>
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
                {relatorio}
              </ReactMarkdown>
            </div>
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
