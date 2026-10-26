import { useState } from 'react'
import { ocorrenciasService } from '../services/api.js'

const TIPOS_OCORRENCIA = [
  { value: 'ACIDENTE', label: 'Acidente de Trânsito' },
  { value: 'MANUTENCAO', label: 'Manutenção de Infraestrutura' },
  { value: 'SEGURANCA', label: 'Segurança Pública' },
  { value: 'ILUMINACAO', label: 'Iluminação / Falha Elétrica' },
  { value: 'TRANSITO', label: 'Congestionamento / Interdição' },
  { value: 'AMBIENTAL', label: 'Incidente Ambiental' },
  { value: 'OUTRO', label: 'Outro' },
]

const GRAVIDADES = [
  { value: 'BAIXA', label: 'Baixa', dot: 'bg-neon-lime' },
  { value: 'MEDIA', label: 'Média', dot: 'bg-neon-amber' },
  { value: 'ALTA', label: 'Alta', dot: 'bg-ember-500' },
  { value: 'CRITICA', label: 'Crítica', dot: 'bg-neon-red' },
]

export default function OcorrenciaModal({ isOpen, onClose, onSuccess }) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState('ACIDENTE')
  const [gravidade, setGravidade] = useState('MEDIA')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)

  if (!isOpen) return null

  const handleSimularCoords = () => {
    // Lat entre -22.25 e -22.18 (Marília/SP)
    const lat = (-22.25 + Math.random() * 0.07).toFixed(6)
    // Lng entre -49.98 e -49.91 (Marília/SP)
    const lng = (-49.98 + Math.random() * 0.07).toFixed(6)
    setLatitude(lat)
    setLongitude(lng)
  }

  const resetForm = () => {
    setTitulo('')
    setDescricao('')
    setTipo('ACIDENTE')
    setGravidade('MEDIA')
    setLatitude('')
    setLongitude('')
    setErro(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErro(null)

    if (latitude === '' || longitude === '') {
      setErro('Informe as coordenadas geográficas do incidente.')
      return
    }

    setLoading(true)

    const payload = {
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      tipo,
      gravidade,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    }

    try {
      await ocorrenciasService.cadastrar(payload)
      resetForm()
      if (onSuccess) onSuccess()
      if (onClose) onClose()
    } catch (err) {
      setErro(err.friendlyMessage || err.message || 'Falha ao registrar ocorrência.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-xl rounded-xl border border-white/10 bg-fogo-800 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="font-display text-base font-bold tracking-wider text-white flex items-center gap-2">
              <span className="text-neon-amber">⚠</span>
              <span>Registrar Nova Ocorrência</span>
            </h3>
            <p className="font-mono text-xs text-slate-400">
              Despacho operacional e alerta para equipes de campo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block font-mono text-xs text-slate-400 mb-1.5">
              Título da Ocorrência <span className="text-neon-amber">*</span>
            </label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={150}
              placeholder="Ex: Colisão entre veículos com interdição de via"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-neon-amber focus:outline-none focus:ring-1 focus:ring-neon-amber transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs text-slate-400 mb-1.5">
                Tipo do Incidente <span className="text-neon-amber">*</span>
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 text-sm text-slate-200 focus:border-neon-amber focus:outline-none focus:ring-1 focus:ring-neon-amber transition-all"
              >
                {TIPOS_OCORRENCIA.map((t) => (
                  <option key={t.value} value={t.value} className="bg-fogo-900 text-slate-200">
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-xs text-slate-400 mb-1.5">
                Nível de Gravidade <span className="text-neon-amber">*</span>
              </label>
              <select
                value={gravidade}
                onChange={(e) => setGravidade(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 text-sm text-slate-200 focus:border-neon-amber focus:outline-none focus:ring-1 focus:ring-neon-amber transition-all"
              >
                {GRAVIDADES.map((g) => (
                  <option key={g.value} value={g.value} className="bg-fogo-900 text-slate-200">
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-mono text-xs text-slate-400 mb-1.5">
              Descrição Detalhada <span className="text-neon-amber">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Descreva a situação, danos aparentes, se há vítimas ou obstrução da via..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-neon-amber focus:outline-none focus:ring-1 focus:ring-neon-amber transition-all resize-none"
            />
          </div>

          {/* Secção de Localização */}
          <div className="rounded-lg border border-white/5 bg-fogo-900/60 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
                LOCALIZAÇÃO DO INCIDENTE (MARÍLIA/SP) <span className="text-neon-amber">*</span>
              </span>
              <button
                type="button"
                id="btn-simular-coords-ocorrencia"
                onClick={handleSimularCoords}
                className="rounded border border-neon-amber/50 bg-neon-amber/15 px-3 py-1 font-mono text-[11px] font-semibold text-neon-amber hover:bg-neon-amber/25 hover:border-neon-amber transition-all shadow-[0_0_10px_rgba(255,197,49,0.2)]"
              >
                🎯 Simular Coordenada do Incidente (Marília)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[11px] text-slate-500 mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="-22.2139"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-neon-amber focus:outline-none focus:ring-1 focus:ring-neon-amber transition-all"
                />
              </div>
              <div>
                <label className="block font-mono text-[11px] text-slate-500 mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="-49.9458"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-neon-amber focus:outline-none focus:ring-1 focus:ring-neon-amber transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg px-4 py-2 font-display text-xs uppercase tracking-wider text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neon-amber/60 bg-neon-amber/20 px-5 py-2 font-display text-xs font-bold uppercase tracking-wider text-neon-amber shadow-[0_0_15px_rgba(255,197,49,0.25)] hover:bg-neon-amber/30 hover:shadow-[0_0_20px_rgba(255,197,49,0.4)] disabled:opacity-50 transition-all"
            >
              {loading ? 'Registrando...' : 'Registrar Ocorrência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
