import { useState } from 'react'
import { TIPO_LABEL } from './statusConfig.js'
import { equipamentosService } from '../services/api.js'

const TIPOS_EQUIPAMENTO = [
  'RADAR',
  'SEMAFORO',
  'CAMERA_CFTV',
  'LUMINARIA_LED',
  'SENSOR_AMBIENTAL',
  'TOTEM_WIFI',
  'LOMBADA_ELETRONICA',
]

export default function EquipamentoModal({ isOpen, onClose, onSuccess, onCadastrar }) {
  const [tipo, setTipo] = useState('RADAR')
  const [numeroSerie, setNumeroSerie] = useState('')
  const [marca, setMarca] = useState('')
  const [cep, setCep] = useState('')
  const [bairro, setBairro] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [dataProximaManutencao, setDataProximaManutencao] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingCep, setLoadingCep] = useState(false)
  const [loadingGps, setLoadingGps] = useState(false)
  const [erro, setErro] = useState(null)
  const [avisoGps, setAvisoGps] = useState(null)

  if (!isOpen) return null

  const handleGerarCoords = () => {
    // Lat entre -22.25 e -22.18
    const lat = (-22.25 + Math.random() * 0.07).toFixed(6)
    // Lng entre -49.98 e -49.91
    const lng = (-49.98 + Math.random() * 0.07).toFixed(6)
    setLatitude(lat)
    setLongitude(lng)
    setAvisoGps(null)
  }

  const buscarCEP = async () => {
    const cepLimpo = cep.replace(/\D/g, '')
    if (cepLimpo.length !== 8) {
      setErro('Informe um CEP válido com 8 dígitos (ex: 17500-020).')
      return
    }

    setLoadingCep(true)
    setErro(null)
    setAvisoGps(null)

    try {
      const resViaCep = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      if (!resViaCep.ok) throw new Error('Não foi possível consultar o serviço de CEP.')
      const dataViaCep = await resViaCep.json()

      if (dataViaCep.erro) {
        setErro('CEP não encontrado na base de endereços.')
        return
      }

      if (dataViaCep.logradouro) setLogradouro(dataViaCep.logradouro)
      if (dataViaCep.bairro) setBairro(dataViaCep.bairro)
    } catch (err) {
      setErro(err.message || 'Falha ao buscar CEP.')
    } finally {
      setLoadingCep(false)
    }
  }

  const buscarGPSExato = async () => {
    if (!logradouro.trim() || !numero.trim()) {
      setErro('Para buscar o GPS exato, preencha o Logradouro e o Número.')
      return
    }

    setLoadingGps(true)
    setErro(null)
    setAvisoGps(null)

    try {
      const enderecoCompleto = `${numero.trim()} ${logradouro.trim()}`
      const urlNominatim = `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(
        enderecoCompleto,
      )}&city=Marília&state=SP&country=Brazil`

      const resNom = await fetch(urlNominatim, {
        headers: {
          Accept: 'application/json',
        },
      })

      if (resNom.ok) {
        const dataNom = await resNom.json()
        if (Array.isArray(dataNom) && dataNom.length > 0) {
          const { lat, lon } = dataNom[0]
          setLatitude(parseFloat(lat).toFixed(6))
          setLongitude(parseFloat(lon).toFixed(6))
        } else {
          // Fallback buscando pela via se o número predial específico não estiver mapeado no OpenStreetMap
          const urlFallback = `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(
            logradouro.trim(),
          )}&city=Marília&state=SP&country=Brazil`
          const resFallback = await fetch(urlFallback, { headers: { Accept: 'application/json' } })
          if (resFallback.ok) {
            const dataFallback = await resFallback.json()
            if (Array.isArray(dataFallback) && dataFallback.length > 0) {
              setLatitude(parseFloat(dataFallback[0].lat).toFixed(6))
              setLongitude(parseFloat(dataFallback[0].lon).toFixed(6))
              setAvisoGps(
                `Número ${numero} não catalogado no GPS. Coordenadas aproximadas da via definidas.`,
              )
              return
            }
          }

          setAvisoGps(
            'Localização exata não encontrada no mapa. Use "Gerar Coords" ou insira manualmente.',
          )
        }
      } else {
        setAvisoGps('Falha ao consultar serviço de GPS. Use "Gerar Coords" ou insira manualmente.')
      }
    } catch (err) {
      setErro(err.message || 'Falha ao buscar GPS exato.')
    } finally {
      setLoadingGps(false)
    }
  }

  const resetForm = () => {
    setTipo('RADAR')
    setNumeroSerie('')
    setMarca('')
    setCep('')
    setBairro('')
    setLogradouro('')
    setNumero('')
    setLatitude('')
    setLongitude('')
    setDataProximaManutencao('')
    setErro(null)
    setAvisoGps(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErro(null)

    // Coordenadas padrão se não informadas
    let latVal = latitude
    let lngVal = longitude
    if (latVal === '' || lngVal === '') {
      latVal = (-22.25 + Math.random() * 0.07).toFixed(6)
      lngVal = (-49.98 + Math.random() * 0.07).toFixed(6)
      setLatitude(latVal)
      setLongitude(lngVal)
    }

    setLoading(true)

    const logradouroCompleto = numero.trim()
      ? `${logradouro.trim()}, ${numero.trim()}`
      : logradouro.trim() || null

    const payload = {
      tipo,
      numero_serie: numeroSerie.trim(),
      marca: marca.trim() || null,
      cep: cep.trim() || null,
      bairro: bairro.trim() || null,
      logradouro: logradouroCompleto,
      local: logradouroCompleto,
      latitude: parseFloat(latVal),
      longitude: parseFloat(lngVal),
      cidade_uf: 'Marília/SP',
      status: 'Operante',
      necessidade_manutencao: 'NENHUMA',
      proxima_manutencao: dataProximaManutencao || null,
      data_proxima_manutencao: dataProximaManutencao || null,
    }

    try {
      try {
        await equipamentosService.cadastrar(payload)
      } catch (apiErr) {
        console.warn('API backend não respondeu ou em mock, salvando localmente:', apiErr)
      }

      resetForm()
      if (onCadastrar) {
        onCadastrar(payload)
      } else if (onSuccess) {
        onSuccess(payload)
      }
      if (onClose) onClose()
    } catch (err) {
      setErro(err.friendlyMessage || err.message || 'Falha ao cadastrar equipamento.')
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
            <h3 className="font-display text-base font-bold tracking-wider text-white">
              Cadastrar Novo Equipamento
            </h3>
            <p className="font-mono text-xs text-slate-400">
              Adicione um novo ativo urbano à rede operacional de Marília/SP
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs text-slate-400 mb-1.5">
                Tipo do Ativo <span className="text-ember-500">*</span>
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 text-sm text-slate-200 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all"
              >
                {TIPOS_EQUIPAMENTO.map((t) => (
                  <option key={t} value={t} className="bg-fogo-900 text-slate-200">
                    {TIPO_LABEL[t] || t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-xs text-slate-400 mb-1.5">
                Nº de Série <span className="text-ember-500">*</span>
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={100}
                placeholder="Ex: RAD-MAR-2024-001"
                value={numeroSerie}
                onChange={(e) => setNumeroSerie(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 font-mono text-sm text-slate-200 placeholder-slate-600 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs text-slate-400 mb-1.5">
                Marca / Fabricante
              </label>
              <input
                type="text"
                maxLength={100}
                placeholder="Ex: Intelbras, Hikvision..."
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all"
              />
            </div>

            <div>
              <label className="block font-mono text-xs text-slate-400 mb-1.5">
                Bairro
              </label>
              <input
                type="text"
                maxLength={120}
                placeholder="Ex: Centro, Cascata..."
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all"
              />
            </div>
          </div>

          {/* Campo CEP com Busca ViaCEP */}
          <div>
            <label className="block font-mono text-xs text-slate-400 mb-1.5">
              CEP (Marília/SP)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={9}
                placeholder="Ex: 17500-020"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    buscarCEP()
                  }
                }}
                className="flex-1 rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 font-mono text-sm text-slate-200 placeholder-slate-600 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all"
              />
              <button
                type="button"
                id="btn-buscar-cep"
                onClick={buscarCEP}
                disabled={loadingCep || !cep}
                className="rounded-lg bg-slate-700 px-4 py-2 font-mono text-xs font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50 transition-colors shrink-0"
              >
                {loadingCep ? 'Buscando...' : 'Buscar CEP'}
              </button>
            </div>
          </div>

          {/* Linha do Logradouro dividida com Número */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-mono text-xs text-slate-400 mb-1.5">
                Logradouro (Endereço)
              </label>
              <input
                type="text"
                maxLength={200}
                placeholder="Ex: Av. Sampaio Vidal"
                value={logradouro}
                onChange={(e) => setLogradouro(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all"
              />
            </div>

            <div className="w-28 sm:w-32">
              <label className="block font-mono text-xs text-slate-400 mb-1.5">
                Número
              </label>
              <input
                type="text"
                maxLength={20}
                placeholder="Ex: 1365"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 font-mono text-sm text-slate-200 placeholder-slate-600 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all"
              />
            </div>
          </div>

          {/* Data de Próxima Manutenção Preventiva */}
          <div>
            <label className="block font-mono text-xs text-slate-400 mb-1.5">
              Data de Próxima Manutenção (Preventiva)
            </label>
            <input
              type="date"
              id="input-proxima-manutencao"
              value={dataProximaManutencao}
              onChange={(e) => setDataProximaManutencao(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 font-mono text-sm text-slate-200 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all [color-scheme:dark]"
            />
          </div>

          {/* Coordenadas com botão de GPS Exato */}
          <div className="rounded-lg border border-white/5 bg-fogo-900/60 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
                Coordenadas Geográficas (Marília/SP) <span className="text-ember-500">*</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-buscar-gps-exato"
                  onClick={buscarGPSExato}
                  disabled={loadingGps}
                  className="rounded border border-neon-cyan/50 bg-neon-cyan/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan disabled:opacity-50 transition-all shadow-[0_0_10px_rgba(34,229,255,0.15)]"
                >
                  {loadingGps ? 'Buscando GPS...' : '🎯 Buscar GPS Exato'}
                </button>
                <button
                  type="button"
                  onClick={handleGerarCoords}
                  className="rounded border border-ember-500/40 bg-ember-500/10 px-2.5 py-1 font-mono text-[11px] text-ember-400 hover:bg-ember-500/20 transition-colors"
                >
                  ⌖ Gerar Coords (Marília)
                </button>
              </div>
            </div>

            {avisoGps && (
              <p className="font-mono text-[11px] text-neon-amber">
                ℹ {avisoGps}
              </p>
            )}

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
                  className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all"
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
                  className="w-full rounded-lg border border-white/10 bg-fogo-900 px-3 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-ember-500 focus:outline-none focus:ring-1 focus:ring-ember-500 transition-all"
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
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ember-600 px-5 py-2 font-display text-xs font-bold uppercase tracking-wider text-white shadow-ember hover:bg-ember-500 disabled:opacity-50 transition-all"
            >
              {loading ? 'Cadastrando...' : 'Confirmar Cadastro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
