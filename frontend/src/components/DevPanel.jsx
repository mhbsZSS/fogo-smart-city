import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL, ocorrenciasService, webhookService } from '../services/api.js'

export default function DevPanel({ onClose }) {
  const [ocorrencias, setOcorrencias] = useState([])
  const [selectedOcId, setSelectedOcId] = useState('')
  const [loadingOc, setLoadingOc] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [logs, setLogs] = useState([
    {
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      tipo: 'info',
      texto: 'Terminal de Desenvolvimento F.O.G.O. inicializado.',
    },
    {
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      tipo: 'warn',
      texto: 'Rede de segurança para demonstração ativa. Comandos ignoram dependências de rede externa.',
    },
  ])

  const carregarOcorrencias = async () => {
    setLoadingOc(true)
    try {
      const data = await ocorrenciasService.listar({ limit: 20 })
      setOcorrencias(data || [])

      // Prioriza a primeira ocorrência PENDENTE ou DESPACHADA
      const pendente = (data || []).find((o) => o.status === 'PENDENTE' || o.status === 'DESPACHADA')
      if (pendente) {
        setSelectedOcId(pendente.id)
      } else if (data && data.length > 0) {
        setSelectedOcId(data[0].id)
      } else {
        setSelectedOcId('1')
      }
    } catch (err) {
      adicionarLog('erro', `Falha ao sincronizar lista de ocorrências: ${err.message}`)
      setSelectedOcId('1')
    } finally {
      setLoadingOc(false)
    }
  }

  useEffect(() => {
    carregarOcorrencias()
  }, [])

  const adicionarLog = (tipo, texto, meta = null) => {
    setLogs((prev) => [
      ...prev.slice(-30),
      {
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        tipo,
        texto,
        meta,
      },
    ])
  }

  const dispararSimulacao = async (tipoAcao) => {
    if (executing) return
    setExecuting(true)

    const targetId = selectedOcId || '1'
    const callbackData = `${tipoAcao}_${targetId}`

    // Payload de mock idêntico ao Update/CallbackQuery gerado pelo Telegram Bot API
    const mockTelegramPayload = {
      update_id: Math.floor(100000 + Math.random() * 900000),
      callback_query: {
        id: `simulacao_${Date.now()}`,
        from: {
          id: 12345678,
          is_bot: false,
          first_name: 'Comandante de Campo (Mock)',
          username: 'fogo_agente_dev',
        },
        message: {
          message_id: Math.floor(100 + Math.random() * 900),
          chat: {
            id: 12345678,
            type: 'private',
            first_name: 'Comandante de Campo (Mock)',
          },
          date: Math.floor(Date.now() / 1000),
          text: 'Comando operacional via painel de testes',
        },
        data: callbackData,
      },
    }

    adicionarLog(
      'envio',
      `POST /webhook -> '${callbackData}'`,
      mockTelegramPayload
    )

    try {
      const res = await webhookService.simularTelegram(mockTelegramPayload)
      if (tipoAcao === 'apoio') {
        const qtd = res.detalhes?.agentes_despachados_qtd || 0
        const nomes = (res.detalhes?.agentes || []).map((a) => a.nome).join(', ')
        adicionarLog(
          'sucesso',
          `🚨 ESCALADA CONCLUÍDA! Gravidade: CRITICA | ${qtd} reforço(s): [${nomes || 'Base'}]`,
          res
        )
      } else if (tipoAcao === 'concluir') {
        const qtd = res.detalhes?.agentes_liberados_qtd || 0
        adicionarLog(
          'sucesso',
          `✅ OCORRÊNCIA RESOLVIDA! ${qtd} agente(s) liberados para DISPONÍVEL.`,
          res
        )
      } else {
        adicionarLog('sucesso', `Resposta recebida: ${JSON.stringify(res)}`)
      }

      // Notifica as telas abertas para atualizar dados sem F5 manual
      window.dispatchEvent(new CustomEvent('fogo:data-updated'))
      window.dispatchEvent(new CustomEvent('fogo:refresh-dashboard'))

      // Recarrega lista local de ocorrências após breve delay
      setTimeout(carregarOcorrencias, 800)
    } catch (err) {
      adicionarLog(
        'erro',
        `Falha na requisição ao Webhook: ${err.friendlyMessage || err.message}`
      )
    } finally {
      setExecuting(false)
    }
  }

  const sincronizarInconsistencias = async () => {
    if (executing) return
    setExecuting(true)

    adicionarLog(
      'envio',
      'POST /agentes/sync -> Solicitando higienização de agentes órfãos...'
    )

    try {
      // Faz a requisição POST para o endpoint de sincronização
      const res = await axios
        .post(`${API_URL}/agentes/sync`)
        .then((r) => r.data)
        .catch(async (err) => {
          // Fallback para rota na raiz se necessário
          const rootUrl = API_URL.replace(/\/api\/v1\/?$/, '')
          return axios.post(`${rootUrl}/agentes/sync`).then((r) => r.data)
        })

      const qtd = res.registros_corrigidos ?? 0
      adicionarLog(
        'sucesso',
        `🧹 HIGIENIZAÇÃO CONCLUÍDA! ${qtd} agente(s) com status 'EM_DESLOCAMENTO' órfão(s) recuperado(s) para 'DISPONÍVEL'.`,
        res
      )

      // Dispara o evento global para forçar re-renderização imediata de todas as listas no frontend
      window.dispatchEvent(new Event('fogo:data-updated'))
      window.dispatchEvent(new CustomEvent('fogo:data-updated'))
      window.dispatchEvent(new CustomEvent('fogo:refresh-dashboard'))

      // Recarrega a lista de ocorrências
      setTimeout(carregarOcorrencias, 500)
    } catch (err) {
      console.error('Falha ao sincronizar inconsistências:', err)
      adicionarLog(
        'erro',
        `Falha na sincronização do DB: ${err.response?.data?.detail || err.message}`
      )
    } finally {
      setExecuting(false)
    }
  }

  const ocAtual = ocorrencias.find((o) => String(o.id) === String(selectedOcId))

  return (
    <div
      id="fogo-dev-panel"
      className="fixed bottom-6 right-6 z-[9999] w-[92vw] max-w-[500px] rounded-xl border-2 border-amber-500/80 bg-slate-950/95 font-mono shadow-[0_0_35px_rgba(245,158,11,0.35)] backdrop-blur-xl animate-fade-up text-slate-200 overflow-hidden"
    >
      {/* Barra de Título Cyberpunk Terminal */}
      <div className="flex items-center justify-between border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span className="font-display text-xs font-black tracking-widest text-amber-400">
            F.O.G.O. // DEV TERMINAL
          </span>
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
            FAILSAFE
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded px-2 py-0.5 text-xs font-bold text-amber-400 hover:bg-amber-500/20 hover:text-white transition-colors"
          title="Fechar Painel de Desenvolvedor"
        >
          [✕ ESC]
        </button>
      </div>

      <div className="p-4 space-y-3.5">
        {/* Aviso de Modo Apresentação */}
        <div className="rounded-md border border-amber-500/30 bg-amber-950/30 p-2.5 text-[11px] leading-relaxed text-amber-200/90">
          <div className="font-bold text-amber-400 flex items-center gap-1.5">
            <span>⚠️</span> MODO DE CONTINGÊNCIA TÁTICA ATIVO
          </div>
          Dispare eventos mockados de campo diretamente no webhook FastAPI para blindar a apresentação contra oscilações de rede externa.
        </div>

        {/* Seletor de Ocorrência Alvo */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <label htmlFor="dev-oc-select" className="font-semibold text-amber-300">
              🎯 Ocorrência Alvo:
            </label>
            <button
              onClick={carregarOcorrencias}
              disabled={loadingOc}
              className="text-[10px] text-amber-400/80 hover:text-amber-300 underline"
            >
              {loadingOc ? 'Sincronizando...' : 'Atualizar Lista'}
            </button>
          </div>

          <div className="flex gap-2">
            <select
              id="dev-oc-select"
              value={selectedOcId}
              onChange={(e) => setSelectedOcId(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
            >
              {ocorrencias.length === 0 ? (
                <option value="1">Ocorrência Padrão #1 (Simulação Fallback)</option>
              ) : (
                ocorrencias.map((oc) => (
                  <option key={oc.id} value={oc.id}>
                    [{oc.status}] #{String(oc.id).slice(0, 8)} - {oc.titulo} ({oc.gravidade})
                  </option>
                ))
              )}
            </select>
          </div>

          {ocAtual && (
            <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-900/50 px-2 py-1 rounded">
              <span>Status: <strong className="text-white">{ocAtual.status}</strong></span>
              <span>Gravidade: <strong className="text-amber-400">{ocAtual.gravidade}</strong></span>
              <span>Tipo: <strong className="text-white">{ocAtual.tipo}</strong></span>
            </div>
          )}
        </div>

        {/* Botões de Ação Tática */}
        <div className="space-y-2 pt-1">
          <button
            id="btn-simular-apoio"
            onClick={() => dispararSimulacao('apoio')}
            disabled={executing}
            className="group relative flex w-full items-center justify-between rounded-lg border-2 border-red-500/80 bg-gradient-to-r from-red-950/80 to-red-900/50 px-4 py-2.5 font-bold text-red-100 shadow-[0_0_15px_rgba(239,68,68,0.25)] transition-all hover:border-red-400 hover:shadow-[0_0_22px_rgba(239,68,68,0.5)] active:scale-[0.99] disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base group-hover:scale-125 transition-transform">🚨</span>
              <span className="text-xs tracking-wider">Simular Pedido de Apoio (Telegram)</span>
            </div>
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300 font-mono">
              apoio_{String(selectedOcId || '1').slice(0, 4)}...
            </span>
          </button>

          <button
            id="btn-simular-conclusao"
            onClick={() => dispararSimulacao('concluir')}
            disabled={executing}
            className="group relative flex w-full items-center justify-between rounded-lg border-2 border-emerald-500/80 bg-gradient-to-r from-emerald-950/80 to-emerald-900/50 px-4 py-2.5 font-bold text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all hover:border-emerald-400 hover:shadow-[0_0_22px_rgba(16,185,129,0.5)] active:scale-[0.99] disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base group-hover:scale-125 transition-transform">✅</span>
              <span className="text-xs tracking-wider">Simular Conclusão (Telegram)</span>
            </div>
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300 font-mono">
              concluir_{String(selectedOcId || '1').slice(0, 4)}...
            </span>
          </button>

          {/* Botão de Limpeza / Sincronização de Inconsistências (DB) */}
          <button
            id="btn-sync-inconsistencias"
            type="button"
            onClick={sincronizarInconsistencias}
            disabled={executing}
            className="group relative flex w-full items-center justify-between rounded-lg border-2 border-amber-500/80 bg-gradient-to-r from-amber-950/80 to-purple-950/70 px-4 py-2.5 font-bold text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.25)] transition-all hover:border-amber-400 hover:shadow-[0_0_22px_rgba(245,158,11,0.45)] active:scale-[0.99] disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base group-hover:scale-125 transition-transform">🧹</span>
              <span className="text-xs tracking-wider">Sincronizar Inconsistências (DB)</span>
            </div>
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300 font-mono">
              POST /agentes/sync
            </span>
          </button>
        </div>

        {/* Tela do Terminal / Log Stream */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>CONSOLE STREAM (POST /webhook):</span>
            <button
              onClick={() => setLogs([])}
              className="hover:text-amber-400 underline transition-colors"
            >
              Limpar Logs
            </button>
          </div>
          <div className="h-32 overflow-y-auto rounded-md border border-slate-800 bg-black/90 p-2.5 text-[10px] space-y-1 font-mono select-text scrollbar-thin scrollbar-thumb-amber-500/30">
            {logs.map((log, idx) => {
              let cor = 'text-slate-400'
              if (log.tipo === 'warn') cor = 'text-amber-400'
              if (log.tipo === 'erro') cor = 'text-red-400 font-bold'
              if (log.tipo === 'sucesso') cor = 'text-emerald-400 font-semibold'
              if (log.tipo === 'envio') cor = 'text-cyan-400'

              return (
                <div key={idx} className="leading-tight break-all">
                  <span className="text-slate-600 mr-1.5">[{log.timestamp}]</span>
                  <span className={cor}>{log.texto}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Rodapé Tático */}
      <div className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-1.5 text-[9px] text-slate-500 flex justify-between items-center">
        <span>F.O.G.O. TACTICAL SUITE · MODO DEMO</span>
        <span className="text-amber-500/80">HOTKEY: 3x CLIQUE NO LOGO</span>
      </div>
    </div>
  )
}
