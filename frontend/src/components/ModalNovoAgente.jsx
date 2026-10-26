import { useState } from 'react'
import { agentesService } from '../services/api.js'

const TIPOS_DISPONIVEIS = [
  { value: 'AGENTE_TRANSITO', label: 'Agente de Trânsito' },
  { value: 'GUARDA_MUNICIPAL', label: 'Guarda Municipal' },
  { value: 'TECNICO_MANUTENCAO', label: 'Técnico' },
  { value: 'FISCAL_POSTURAS', label: 'Fiscal' },
  { value: 'DEFESA_CIVIL', label: 'Defesa Civil' },
  { value: 'RESGATE_MEDICO', label: 'Resgate / SAMU' },
]

const STATUS_OPCOES = [
  { value: 'DISPONIVEL', label: 'Disponível', desc: 'Pronto para despacho imediato com telemetria GPS' },
  { value: 'OFFLINE', label: 'Offline', desc: 'Fora de turno operacional' },
]

export default function ModalNovoAgente({ isOpen, onClose, onSuccess }) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('AGENTE_TRANSITO')
  const [status, setStatus] = useState('DISPONIVEL')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  if (!isOpen) return null

  const handleReset = () => {
    setNome('')
    setTipo('AGENTE_TRANSITO')
    setStatus('DISPONIVEL')
    setErro(null)
    setSalvando(false)
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nome.trim()) {
      setErro('Por favor, informe o nome completo do agente.')
      return
    }

    setSalvando(true)
    setErro(null)

    try {
      // Coordenadas padrão em Marília para agentes disponíveis
      let latitude = null
      let longitude = null

      if (status === 'DISPONIVEL') {
        const offsetLat = (Math.random() - 0.5) * 0.04
        const offsetLng = (Math.random() - 0.5) * 0.04
        latitude = Number((-22.2160 + offsetLat).toFixed(6))
        longitude = Number((-49.9465 + offsetLng).toFixed(6))
      }

      const payload = {
        nome: nome.trim(),
        tipo,
        status,
        latitude,
        longitude,
      }

      await agentesService.cadastrar(payload)
      handleReset()
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error('Falha ao cadastrar agente:', err)
      setErro(err?.friendlyMessage || err?.response?.data?.detail || 'Erro ao cadastrar novo agente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-novo-agente-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      {/* Card do Modal */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-neon-magenta/40 bg-fogo-900/95 p-6 shadow-[0_0_40px_rgba(255,43,214,0.2)] backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-neon-magenta/40 bg-neon-magenta/10 text-neon-magenta shadow-[0_0_15px_rgba(255,43,214,0.3)]">
              <span className="text-lg">🛡️</span>
            </div>
            <div>
              <h3
                id="modal-novo-agente-title"
                className="font-display text-lg font-bold tracking-wider text-white"
              >
                Cadastrar Novo Agente
              </h3>
              <p className="font-mono text-xs text-slate-400">
                Integração tática ao efetivo em campo do F.O.G.O.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        {/* Mensagem de Erro */}
        {erro && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-neon-red/40 bg-neon-red/10 px-4 py-2.5 font-mono text-xs text-neon-red"
          >
            ⚠ {erro}
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Nome Completo */}
          <div>
            <label
              htmlFor="novo-agente-nome"
              className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Nome Completo <span className="text-neon-magenta">*</span>
            </label>
            <input
              id="novo-agente-nome"
              type="text"
              required
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Inspetor Rogério Lima"
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-fogo-800/80 px-3.5 py-2.5 font-sans text-sm text-slate-100 placeholder-slate-500 transition-all focus:border-neon-magenta focus:outline-none focus:ring-1 focus:ring-neon-magenta"
            />
          </div>

          {/* Especialidade / Tipo */}
          <div>
            <label
              htmlFor="novo-agente-tipo"
              className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Especialidade / Tipo <span className="text-neon-magenta">*</span>
            </label>
            <select
              id="novo-agente-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-fogo-800/90 px-3.5 py-2.5 font-sans text-sm text-slate-100 transition-all focus:border-neon-magenta focus:outline-none focus:ring-1 focus:ring-neon-magenta"
            >
              {TIPOS_DISPONIVEIS.map((t) => (
                <option key={t.value} value={t.value} className="bg-fogo-900 text-slate-100">
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Inicial */}
          <div>
            <label
              htmlFor="novo-agente-status"
              className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Status Inicial <span className="text-neon-magenta">*</span>
            </label>
            <select
              id="novo-agente-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-fogo-800/90 px-3.5 py-2.5 font-sans text-sm text-slate-100 transition-all focus:border-neon-magenta focus:outline-none focus:ring-1 focus:ring-neon-magenta"
            >
              {STATUS_OPCOES.map((s) => (
                <option key={s.value} value={s.value} className="bg-fogo-900 text-slate-100">
                  {s.label} ({s.desc})
                </option>
              ))}
            </select>
          </div>

          {/* Rodapé / Ações */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={salvando}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-slate-300 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="btn-confirmar-novo-agente"
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg border border-neon-magenta/60 bg-neon-magenta/20 px-5 py-2 font-display text-xs font-bold uppercase tracking-wider text-neon-magenta shadow-[0_0_15px_rgba(255,43,214,0.3)] transition-all hover:bg-neon-magenta/30 hover:border-neon-magenta hover:shadow-[0_0_25px_rgba(255,43,214,0.5)] disabled:opacity-50"
            >
              {salvando ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-neon-magenta border-t-transparent" />
                  <span>Cadastrando...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Salvar Agente</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
