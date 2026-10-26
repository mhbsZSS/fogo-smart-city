import { useEffect, useState } from 'react'
import { TIPO_LABEL } from './statusConfig.js'
import { agentesService, ocorrenciasService } from '../services/api.js'
import { calcularDistancia } from '../utils/geo.js'

function obterEspecialidadesIdeais(ocorrencia) {
  if (!ocorrencia) return []
  const tipo = (ocorrencia.tipo || '').toUpperCase()
  const gravidade = (ocorrencia.gravidade || '').toUpperCase()

  if (tipo === 'SAUDE' || tipo === 'EMERGENCIA_MEDICA') {
    return ['RESGATE_MEDICO', 'SAUDE']
  }
  if (tipo === 'ACIDENTE' && (gravidade === 'ALTA' || gravidade === 'CRITICA')) {
    return ['RESGATE_MEDICO', 'SAUDE', 'DEFESA_CIVIL']
  }
  if (tipo === 'ACIDENTE') {
    return ['AGENTE_TRANSITO', 'GUARDA_MUNICIPAL']
  }
  if (tipo === 'MANUTENCAO' || ocorrencia.equipamento_id) {
    return ['TECNICO_MANUTENCAO']
  }
  if (tipo === 'SEGURANCA') {
    return ['GUARDA_MUNICIPAL']
  }
  if (tipo === 'DEFESA_CIVIL' || tipo === 'AMBIENTAL') {
    return ['DEFESA_CIVIL']
  }
  if (tipo === 'FISCALIZACAO') {
    return ['FISCAL_POSTURAS']
  }
  if (tipo === 'TRANSITO') {
    return ['AGENTE_TRANSITO']
  }
  return []
}

function ehAgenteElegivel(agenteTipo, ocorrencia) {
  if (!ocorrencia || !agenteTipo) return false
  const tipo = (ocorrencia.tipo || '').toUpperCase()
  const gravidade = (ocorrencia.gravidade || '').toUpperCase()
  const temEquipamento = Boolean(ocorrencia.equipamento_id)

  const ehAgenteSaude = agenteTipo === 'RESGATE_MEDICO' || agenteTipo === 'SAUDE'

  // 1. HARD CONSTRAINT SAÚDE: Agente de Saúde atende EXCLUSIVAMENTE emergências médicas e acidentes graves
  if (ehAgenteSaude) {
    const isEmergenciaMedica =
      tipo === 'SAUDE' ||
      tipo === 'EMERGENCIA_MEDICA' ||
      (tipo === 'ACIDENTE' && (gravidade === 'ALTA' || gravidade === 'CRITICA'))
    return isEmergenciaMedica
  }

  // 2. HARD CONSTRAINT MÉDICA: Incidentes de Saúde exigem EXCLUSIVAMENTE agente de Saúde
  if (tipo === 'SAUDE' || tipo === 'EMERGENCIA_MEDICA') {
    return ehAgenteSaude
  }

  // 3. HARD CONSTRAINT MANUTENÇÃO: Manutenção e falha em equipamentos exigem TECNICO_MANUTENCAO
  if (tipo === 'MANUTENCAO' || temEquipamento) {
    return agenteTipo === 'TECNICO_MANUTENCAO'
  }

  // 4. Incidentes de Fiscalização de Posturas:
  if (tipo === 'FISCALIZACAO') {
    return agenteTipo === 'FISCAL_POSTURAS' || agenteTipo === 'GUARDA_MUNICIPAL'
  }

  // 5. Incidentes de Segurança Urbana / Vandalismo:
  if (tipo === 'SEGURANCA') {
    return agenteTipo === 'GUARDA_MUNICIPAL'
  }

  return true
}

export default function DespachoModal({
  isOpen,
  onClose,
  onSuccess,
  onDespachoSucesso,
  fetchOcorrencias,
  fetchAgentes,
  ocorrencia,
}) {
  const [agentesDisponiveis, setAgentesDisponiveis] = useState([])
  const [loading, setLoading] = useState(true)
  const [despachandoId, setDespachandoId] = useState(null)
  const [erro, setErro] = useState(null)

  const especialidadesIdeais = obterEspecialidadesIdeais(ocorrencia)

  const handleClose = () => {
    // 1. Limpeza rigorosa de todos os estados internos ao fechar o modal
    setDespachandoId(null)
    setLoading(false)
    setErro(null)
    setAgentesDisponiveis([])
    if (onClose) onClose()
  }

  useEffect(() => {
    if (!isOpen || !ocorrencia) {
      // Garante reset de estado quando o modal estiver inativo
      setDespachandoId(null)
      setLoading(false)
      setErro(null)
      setAgentesDisponiveis([])
      return
    }

    let ativo = true
    setLoading(true)
    setErro(null)

    // 3. Tratamento de Agentes Stale: busca sempre dados frescos da API
    agentesService
      .listar({ limit: 500 })
      .then((data) => {
        if (!ativo) return

        const listaAgentes = Array.isArray(data) ? data : []
        const ideais = obterEspecialidadesIdeais(ocorrencia)

        // Filtra dinamicamente agentes com status DISPONÍVEL, sinal GPS ativo E que respeitem as Hard Constraints de competência
        const filtrados = listaAgentes
          .filter(
            (a) =>
              a.status === 'DISPONIVEL' &&
              a.latitude != null &&
              a.longitude != null &&
              ehAgenteElegivel(a.tipo, ocorrencia),
          )
          .map((a) => {
            const distancia = calcularDistancia(
              ocorrencia.latitude,
              ocorrencia.longitude,
              a.latitude,
              a.longitude,
            )
            const isEspecialidadeIdeal = ideais.includes(a.tipo)

            // Lógica de Match Scoring:
            // Base: 100 pontos
            // Subtrai a distância (km)
            // Bônus de Competência: +500 pontos se for o tipo ideal
            const distNum = distancia ?? 9999
            const bonusCompetencia = isEspecialidadeIdeal ? 500 : 0
            const score_afinidade = 100 - distNum + bonusCompetencia

            return {
              ...a,
              distancia,
              isEspecialidadeIdeal,
              score_afinidade,
            }
          })
          // Ordena pelo maior score_afinidade para o menor
          .sort((a, b) => b.score_afinidade - a.score_afinidade)

        setAgentesDisponiveis(filtrados)
      })
      .catch((err) => {
        if (!ativo) return
        setErro(err.friendlyMessage || err.message || 'Falha ao buscar agentes disponíveis.')
      })
      .finally(() => {
        if (ativo) setLoading(false)
      })

    return () => {
      ativo = false
    }
  }, [isOpen, ocorrencia])

  if (!isOpen || !ocorrencia) return null

  const handleDespachar = async (agente) => {
    if (!ocorrencia || despachandoId !== null) return
    setDespachandoId(agente.id)
    setErro(null)

    try {
      await ocorrenciasService.despachar(ocorrencia.id, agente.id)

      // 2. Sincronização de Dados em Tempo Real:
      // Dispara evento global para forçar atualização em segundo plano de todas as listas
      window.dispatchEvent(new Event('fogo:data-updated'))
      window.dispatchEvent(new CustomEvent('fogo:data-updated'))

      // Chama callbacks opcionais do componente pai para atualizar estados imediatamente
      if (onSuccess) await onSuccess()
      if (onDespachoSucesso) await onDespachoSucesso()
      if (fetchOcorrencias) await fetchOcorrencias()
      if (fetchAgentes) await fetchAgentes()

      handleClose()
    } catch (err) {
      console.error('Falha ao despachar agente:', err)
      setErro(err.friendlyMessage || err.message || 'Falha ao despachar agente.')
    } finally {
      // Garante que o loading/despachandoId é SEMPRE redefinido, prevenindo o congelamento de botões
      setDespachandoId(null)
    }
  }

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
            <h3 className="font-display text-base font-bold tracking-wider text-white flex items-center gap-2">
              <span className="text-neon-cyan">⚡</span>
              <span>Despachar Unidade Mais Próxima</span>
            </h3>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-400">
              Incidente: <span className="text-slate-200">{ocorrencia.titulo}</span> · GPS: [
              {Number(ocorrencia.latitude).toFixed(4)}, {Number(ocorrencia.longitude).toFixed(4)}]
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-colors shrink-0"
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        {erro && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-neon-red/30 bg-neon-red/10 p-3 font-mono text-xs text-neon-red"
          >
            ⚠ {erro}
          </div>
        )}

        {/* Lista de Unidades Mais Próximas */}
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
            <span>UNIDADES DISPONÍVEIS · ROTEAMENTO PREDITIVO</span>
            <span>{agentesDisponiveis.length} aptas</span>
          </div>

          {especialidadesIdeais.length > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-neon-amber/20 bg-neon-amber/5 px-3 py-2 font-mono text-xs text-neon-amber">
              <span className="text-sm">🎯</span>
              <span>
                Competência ideal para este incidente: {especialidadesIdeais.map((t) => TIPO_LABEL[t] || t).join(', ')}
              </span>
            </div>
          )}

          <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-fogo-900/60 p-3.5"
                >
                  <div className="space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-white/5" />
                    <div className="h-3 w-24 animate-pulse rounded bg-white/5" />
                  </div>
                  <div className="h-8 w-24 animate-pulse rounded bg-white/5" />
                </div>
              ))}

            {!loading && agentesDisponiveis.length === 0 && (
              <div className="rounded-lg border border-white/5 bg-fogo-900/40 p-8 text-center font-mono text-xs text-slate-500">
                <span className="text-2xl text-slate-600 mb-2 block">⚠</span>
                Nenhuma unidade operacional com status "Disponível" e sinal GPS ativo no momento.
              </div>
            )}

            {!loading &&
              agentesDisponiveis.map((agente, index) => {
                const isRecomendado = index === 0
                const isDespachando = despachandoId === agente.id

                return (
                  <div
                    key={agente.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3.5 transition-all ${
                      isRecomendado
                        ? 'border-neon-cyan/50 bg-neon-cyan/5 shadow-[0_0_15px_rgba(34,229,255,0.12)]'
                        : 'border-white/5 bg-fogo-900/60 hover:border-white/10 hover:bg-fogo-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-md font-display text-xs font-bold ${
                          isRecomendado
                            ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                            : 'bg-fogo-700 text-slate-300'
                        }`}
                      >
                        {agente.nome
                          .split(' ')
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join('')}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-200">{agente.nome}</span>
                          {agente.isEspecialidadeIdeal && (
                            <span className="rounded bg-neon-amber/20 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-neon-amber border border-neon-amber/40">
                              ⭐ Especialidade Recomendada
                            </span>
                          )}
                          {isRecomendado && !agente.isEspecialidadeIdeal && (
                            <span className="rounded bg-neon-cyan/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-neon-cyan border border-neon-cyan/40">
                              ⚡ Mais Próximo
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs text-slate-400">
                          {TIPO_LABEL[agente.tipo] || agente.tipo}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-fogo-950/80 px-2.5 py-1 font-mono text-xs font-semibold text-slate-200 shadow-inner">
                        <span className="text-neon-cyan">📍</span>
                        <span>{agente.distancia} km</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDespachar(agente)}
                        disabled={despachandoId !== null}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 font-display text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
                          isRecomendado
                            ? 'bg-neon-cyan text-fogo-950 shadow-[0_0_15px_rgba(34,229,255,0.4)] hover:bg-white hover:shadow-[0_0_20px_rgba(34,229,255,0.6)]'
                            : 'border border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20'
                        }`}
                      >
                        {isDespachando ? 'Despachando...' : 'Despachar'}
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Rodapé */}
        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="font-mono text-[11px] text-slate-500">
            F.O.G.O. · Algoritmo de roteamento preditivo
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-4 py-2 font-display text-xs uppercase tracking-wider text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
