import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Pencil, Save, Trash2, TriangleAlert, X } from 'lucide-react'
import Header from '../components/Header.jsx'
import Sidebar from '../components/Sidebar.jsx'
import EquipamentoModal from '../components/EquipamentoModal.jsx'
import ParecerIaModal from '../components/ParecerIaModal.jsx'
import { STATUS_EQUIP, TIPO_LABEL, fallback } from '../components/statusConfig.js'
import { checkHealth, equipamentosService, relatoriosService } from '../services/api.js'

// Dicionário de prioridade por criticidade operacional (crescente: mais críticos no topo)
const statusPriority = {
  INOPERANTE: 1,
  Inoperante: 1,
  ALERTA: 2,
  Alerta: 2,
  MANUTENCAO: 3,
  EM_MANUTENCAO: 3,
  'Manutenção': 3,
  Manutencao: 3,
  OPERANTE: 4,
  Operante: 4,
}

// Obtém a data de próxima manutenção (real ou fallback determinístico baseado no id/nº de série)
function getProximaManutencaoInfo(equipamento) {
  const dataOriginal = equipamento?.data_proxima_manutencao || equipamento?.proxima_manutencao
  if (dataOriginal) {
    if (typeof dataOriginal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dataOriginal)) {
      const [ano, mes, dia] = dataOriginal.slice(0, 10).split('-').map(Number)
      return { data: new Date(ano, mes - 1, dia) }
    }
    const d = new Date(dataOriginal)
    if (!isNaN(d.getTime())) return { data: d }
  }

  const seedStr = String(equipamento?.id || equipamento?.numero_serie || 'fogo')
  let hash = 0
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i)
    hash |= 0
  }
  const diasFuturos = 3 + Math.abs(hash % 58) // Entre 3 e 60 dias no futuro
  const dataFutura = new Date()
  dataFutura.setDate(dataFutura.getDate() + diasFuturos)
  return { data: dataFutura }
}

// Formata a próxima manutenção em DD/MM/YYYY para a tabela
function getProximaManutencaoFormatada(equipamento) {
  const { data } = getProximaManutencaoInfo(equipamento)
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const ano = data.getFullYear()
  return `${dia}/${mes}/${ano}`
}

// Converte a próxima manutenção para YYYY-MM-DD (valor do input type="date")
function getProximaManutencaoInput(equipamento) {
  const dataOriginal = equipamento?.data_proxima_manutencao || equipamento?.proxima_manutencao
  if (typeof dataOriginal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dataOriginal)) {
    return dataOriginal.slice(0, 10)
  }
  const { data } = getProximaManutencaoInfo(equipamento)
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

const TIPOS_EQUIPAMENTO = [
  'RADAR',
  'SEMAFORO',
  'CAMERA_CFTV',
  'LUMINARIA_LED',
  'SENSOR_AMBIENTAL',
  'TOTEM_WIFI',
  'LOMBADA_ELETRONICA',
]

const STATUS_OPCOES = [
  { value: 'OPERANTE', label: 'Operante' },
  { value: 'ALERTA', label: 'Em Alerta' },
  { value: 'EM_MANUTENCAO', label: 'Manutenção' },
  { value: 'INOPERANTE', label: 'Inoperante' },
]

// Normaliza variações de status vindas do backend para as chaves de STATUS_EQUIP
function normalizarStatus(status) {
  const s = String(status || '').toUpperCase()
  if (s === 'MANUTENCAO' || s === 'MANUTENÇÃO' || s === 'EM MANUTENCAO') return 'EM_MANUTENCAO'
  if (s === 'EM_ALERTA' || s === 'EM ALERTA') return 'ALERTA'
  return s || 'OPERANTE'
}

function useFecharComEsc(onClose) {
  useEffect(() => {
    const handler = (ev) => {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}

const INPUT_CLS =
  'w-full rounded-lg border border-white/10 bg-fogo-900 px-3.5 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all'
const LABEL_CLS = 'block font-mono text-xs text-slate-400 mb-1.5'

// Modal de Edição (estilo Cyberpunk, bordas border-cyan-500/50 com estado local formData)
function EditarEquipamentoModal({ equipamento, onClose, onSalvar }) {
  const [formData, setFormData] = useState(() => ({
    ...equipamento,
    tipo: equipamento?.tipo || 'RADAR',
    numero_serie: equipamento?.numero_serie || '',
    marca: equipamento?.marca || '',
    local: equipamento?.local || equipamento?.logradouro || '',
    logradouro: equipamento?.logradouro || equipamento?.local || '',
    bairro: equipamento?.bairro || '',
    status: normalizarStatus(equipamento?.status),
    data_proxima_manutencao: getProximaManutencaoInput(equipamento),
  }))
  const [erro, setErro] = useState(null)
  useFecharComEsc(onClose)

  const atualizarCampo = (campo) => (ev) => {
    const valor = ev.target.value
    setFormData((prev) => {
      const next = { ...prev, [campo]: valor }
      if (campo === 'local') next.logradouro = valor
      if (campo === 'logradouro') next.local = valor
      return next
    })
  }

  const tiposDisponiveis = TIPOS_EQUIPAMENTO.includes(formData.tipo)
    ? TIPOS_EQUIPAMENTO
    : [formData.tipo, ...TIPOS_EQUIPAMENTO]

  const handleSubmit = (ev) => {
    ev.preventDefault()
    if (!formData.numero_serie || formData.numero_serie.trim().length < 3) {
      setErro('O Nº de Série deve ter pelo menos 3 caracteres.')
      return
    }
    const localFinal = (formData.local || formData.logradouro || '').trim()
    onSalvar({
      ...formData,
      numero_serie: formData.numero_serie.trim(),
      marca: formData.marca ? formData.marca.trim() : null,
      local: localFinal || null,
      logradouro: localFinal || null,
      bairro: formData.bairro ? formData.bairro.trim() : null,
      proxima_manutencao: formData.data_proxima_manutencao || null,
      data_proxima_manutencao: formData.data_proxima_manutencao || null,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-editar-equipamento"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-xl rounded-xl border border-cyan-500/50 bg-slate-900 p-6 shadow-[0_0_30px_rgba(34,211,238,0.15)]">
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-400">
              <Pencil className="h-4 w-4" />
            </span>
            <div>
              <h3 id="titulo-editar-equipamento" className="font-display text-base font-bold tracking-wider text-white">
                Editar Equipamento
              </h3>
              <p className="font-mono text-xs text-cyan-400/80">
                Ativo #{equipamento?.numero_serie || equipamento?.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Fechar modal"
          >
            <X className="h-4 w-4" />
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-tipo" className={LABEL_CLS}>Tipo do Ativo</label>
              <select id="edit-tipo" value={formData.tipo} onChange={atualizarCampo('tipo')} className={INPUT_CLS}>
                {tiposDisponiveis.map((t) => (
                  <option key={t} value={t} className="bg-fogo-900 text-slate-200">
                    {TIPO_LABEL[t] || t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-numero-serie" className={LABEL_CLS}>
                Nº de Série <span className="text-cyan-400">*</span>
              </label>
              <input
                id="edit-numero-serie"
                type="text"
                required
                maxLength={100}
                value={formData.numero_serie}
                onChange={atualizarCampo('numero_serie')}
                className={`${INPUT_CLS} font-mono`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-marca" className={LABEL_CLS}>Marca / Fabricante</label>
              <input
                id="edit-marca"
                type="text"
                maxLength={100}
                value={formData.marca}
                onChange={atualizarCampo('marca')}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label htmlFor="edit-status" className={LABEL_CLS}>Status Operacional</label>
              <select id="edit-status" value={formData.status} onChange={atualizarCampo('status')} className={INPUT_CLS}>
                {STATUS_OPCOES.map((s) => (
                  <option key={s.value} value={s.value} className="bg-fogo-900 text-slate-200">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="edit-logradouro" className={LABEL_CLS}>Local (Logradouro)</label>
              <input
                id="edit-logradouro"
                type="text"
                maxLength={255}
                value={formData.logradouro}
                onChange={atualizarCampo('logradouro')}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label htmlFor="edit-bairro" className={LABEL_CLS}>Bairro</label>
              <input
                id="edit-bairro"
                type="text"
                maxLength={120}
                value={formData.bairro}
                onChange={atualizarCampo('bairro')}
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-proxima-manutencao" className={LABEL_CLS}>Próxima Manutenção (Preventiva)</label>
            <input
              id="edit-proxima-manutencao"
              type="date"
              value={formData.data_proxima_manutencao}
              onChange={atualizarCampo('data_proxima_manutencao')}
              className={`${INPUT_CLS} font-mono [color-scheme:dark]`}
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-cyan-500/20 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 font-display text-xs uppercase tracking-wider text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="btn-salvar-edicao-equipamento"
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/60 bg-cyan-500/15 px-5 py-2 font-display text-xs font-bold uppercase tracking-wider text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)] transition-all hover:border-cyan-400 hover:bg-cyan-500/25 hover:shadow-[0_0_18px_rgba(34,211,238,0.4)]"
            >
              <Save className="h-4 w-4" />
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Modal de Confirmação de Exclusão
function ExcluirEquipamentoModal({ equipamento, onClose, onConfirmar }) {
  useFecharComEsc(onClose)

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-excluir-equipamento"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md rounded-xl border border-red-500/50 bg-slate-900 p-6 shadow-[0_0_30px_rgba(239,68,68,0.18)]">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-500/50 bg-red-500/10 text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.3)]">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 id="titulo-excluir-equipamento" className="font-display text-base font-bold tracking-wider text-white">
              Excluir Equipamento
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Tem certeza que deseja excluir permanentemente o equipamento{' '}
              <span className="font-mono font-semibold text-red-400">{equipamento?.numero_serie}</span>?
            </p>
            <p className="mt-2 font-mono text-[11px] text-slate-500">
              {TIPO_LABEL[equipamento?.tipo] || equipamento?.tipo || '—'} · {equipamento?.logradouro || 'Sem endereço'}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-red-500/20 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 font-display text-xs uppercase tracking-wider text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            id="btn-confirmar-exclusao-equipamento"
            onClick={onConfirmar}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/60 bg-red-500/15 px-5 py-2 font-display text-xs font-bold uppercase tracking-wider text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.25)] transition-all hover:border-red-400 hover:bg-red-500/25 hover:shadow-[0_0_18px_rgba(239,68,68,0.4)]"
          >
            <Trash2 className="h-4 w-4" />
            Confirmar Exclusão
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Equipamentos() {
  const [searchParams, setSearchParams] = useSearchParams()
  const isFiltroCriticoUrl = searchParams.get('filtro') === 'critico'

  const [apiOnline, setApiOnline] = useState(null)
  const [equipamentos, setEquipamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [executandoId, setExecutandoId] = useState(null)

  // Estados dos modais de Edição e Exclusão
  const [modalEditarAberto, setModalEditarAberto] = useState(false)
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false)
  const [equipamentoSelecionado, setEquipamentoSelecionado] = useState(null)

  // Registo das alterações locais: reaplicado após cada recarga da API para que o
  // refetch automático (evento 'fogo:data-updated') não desfaça edições/exclusões/criações.
  const alteracoesLocaisRef = useRef({ excluidos: new Set(), editados: new Map(), novos: [] })

  // Estado para Parecer de IA do Oráculo
  const [modalIaOpen, setModalIaOpen] = useState(false)
  const [modalIaLoading, setModalIaLoading] = useState(false)
  const [modalIaErro, setModalIaErro] = useState(null)
  const [modalIaConteudo, setModalIaConteudo] = useState('')
  const [equipamentoSelecionadoIa, setEquipamentoSelecionadoIa] = useState(null)

  // 1. Estados de Filtro e Ordenação
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState(
    isFiltroCriticoUrl ? 'Inoperante' : 'Todos',
  )
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' })

  // 2. Manipulador de Ordenação por Coluna
  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'ascending' ? 'descending' : 'ascending',
        }
      }
      return {
        key,
        direction: 'ascending',
      }
    })
  }

  const carregar = useCallback(async () => {
    try {
      const [health, eqs] = await Promise.allSettled([
        checkHealth(),
        equipamentosService.listar({ limit: 500 }),
      ])
      setApiOnline(health.status === 'fulfilled')
      if (eqs.status === 'fulfilled') {
        const dados = Array.isArray(eqs.value)
          ? eqs.value
          : Array.isArray(eqs.value?.items)
          ? eqs.value.items
          : []
        const { excluidos, editados, novos } = alteracoesLocaisRef.current
        const novosIds = new Set((novos || []).map((n) => n.id))
        const itensBase = dados
          .filter((eq) => !excluidos.has(eq?.id) && !novosIds.has(eq?.id))
          .map((eq) => (editados.has(eq?.id) ? { ...eq, ...editados.get(eq.id) } : eq))
        setEquipamentos([...(novos || []), ...itensBase])
      } else {
        setErro(eqs.reason?.friendlyMessage || 'Erro ao carregar equipamentos')
      }
    } catch (err) {
      setErro(err?.message || 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    const handleDataUpdate = () => carregar()
    window.addEventListener('fogo:data-updated', handleDataUpdate)
    return () => window.removeEventListener('fogo:data-updated', handleDataUpdate)
  }, [carregar])

  // Contadores dinâmicos para cada botão de status
  const contadores = useMemo(() => {
    let inoperantes = 0
    let alerta = 0
    let manutencao = 0
    let operantes = 0

    for (const eq of equipamentos || []) {
      const s = String(eq?.status || '').toUpperCase()
      if (s === 'INOPERANTE') inoperantes++
      else if (s === 'ALERTA' || s === 'EM_ALERTA' || s === 'EM ALERTA') alerta++
      else if (s === 'MANUTENCAO' || s === 'EM_MANUTENCAO' || s === 'EM MANUTENCAO') manutencao++
      else if (s === 'OPERANTE') operantes++
    }

    return {
      total: (equipamentos || []).length,
      inoperantes,
      alerta,
      manutencao,
      operantes,
    }
  }, [equipamentos])

  // 3. Lógica de Filtragem (Fluxo: Filtra -> Ordena -> Renderiza)
  const equipamentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return (equipamentos || []).filter((eq) => {
      // Verifica se o eq.status corresponde ao filtroStatus (ignorando se for 'Todos')
      if (filtroStatus !== 'Todos') {
        const s = String(eq?.status || '').toUpperCase()
        if (filtroStatus === 'Inoperante') {
          if (s !== 'INOPERANTE') return false
        } else if (filtroStatus === 'Em Alerta') {
          if (s !== 'ALERTA' && s !== 'EM_ALERTA' && s !== 'EM ALERTA') return false
        } else if (filtroStatus === 'Manutenção') {
          if (s !== 'MANUTENCAO' && s !== 'EM_MANUTENCAO' && s !== 'EM MANUTENCAO') return false
        } else if (filtroStatus === 'Operante') {
          if (s !== 'OPERANTE') return false
        } else if (eq?.status !== filtroStatus) {
          return false
        }
      }

      // Verifica se o termo de busca existe no eq.numero_serie, eq.tipo ou eq.local
      if (termo) {
        const numSerie = String(eq?.numero_serie || '').toLowerCase()
        const tipo = String(eq?.tipo || '').toLowerCase()
        const local = String(eq?.local || eq?.logradouro || '').toLowerCase()
        const bairro = String(eq?.bairro || '').toLowerCase()
        const marca = String(eq?.marca || '').toLowerCase()

        const match =
          numSerie.includes(termo) ||
          tipo.includes(termo) ||
          local.includes(termo) ||
          bairro.includes(termo) ||
          marca.includes(termo)

        if (!match) return false
      }

      return true
    })
  }, [equipamentos, filtroStatus, busca])

  // 4. Lógica de Ordenação Aplicada nos Dados Filtrados
  const equipamentosOrdenados = useMemo(() => {
    const lista = [...equipamentosFiltrados]

    if (!sortConfig.key) {
      return lista.sort((a, b) => {
        // Se um item foi adicionado recentemente (_isNovo: true), mantê-lo sempre no topo
        if (a?._isNovo && !b?._isNovo) return -1
        if (!a?._isNovo && b?._isNovo) return 1
        const prioridadeA = statusPriority[a?.status] ?? 99
        const prioridadeB = statusPriority[b?.status] ?? 99
        if (prioridadeA !== prioridadeB) {
          return prioridadeA - prioridadeB
        }
        const refA = a?.logradouro || a?.numero_serie || ''
        const refB = b?.logradouro || b?.numero_serie || ''
        return refA.localeCompare(refB, 'pt-BR')
      })
    }

    return lista.sort((a, b) => {
      const key = sortConfig.key
      let res = 0

      if (key === 'proxima_manutencao' || key === 'data_proxima_manutencao') {
        const timeA = getProximaManutencaoInfo(a).data.getTime()
        const timeB = getProximaManutencaoInfo(b).data.getTime()
        res = timeA - timeB
      } else if (key === 'tipo') {
        const labelA = TIPO_LABEL[a?.tipo] || a?.tipo || ''
        const labelB = TIPO_LABEL[b?.tipo] || b?.tipo || ''
        res = labelA.localeCompare(labelB, 'pt-BR')
      } else if (key === 'local' || key === 'logradouro') {
        const localA = a?.logradouro || a?.local || a?.bairro || ''
        const localB = b?.logradouro || b?.local || b?.bairro || ''
        res = localA.localeCompare(localB, 'pt-BR')
      } else if (key === 'status') {
        const stA = STATUS_EQUIP[a?.status]?.label || a?.status || ''
        const stB = STATUS_EQUIP[b?.status]?.label || b?.status || ''
        res = stA.localeCompare(stB, 'pt-BR')
      } else {
        const valA = String(a?.[key] ?? '')
        const valB = String(b?.[key] ?? '')
        res = valA.localeCompare(valB, 'pt-BR', { numeric: true, sensitivity: 'base' })
      }

      return sortConfig.direction === 'ascending' ? res : -res
    })
  }, [equipamentosFiltrados, sortConfig])

  const BOTOES_STATUS = [
    {
      id: 'Todos',
      label: 'Todos',
      icon: '📋',
      activeClass: 'border-white/20 bg-white/10 text-slate-200 shadow-[0_0_10px_rgba(255,255,255,0.15)]',
      hoverClass: 'hover:text-slate-200',
      count: contadores.total,
    },
    {
      id: 'Inoperante',
      label: 'Inoperante',
      icon: '🚨',
      activeClass: 'border-neon-red/40 bg-neon-red/20 text-neon-red shadow-[0_0_10px_rgba(255,42,85,0.25)]',
      hoverClass: 'hover:text-neon-red',
      count: contadores.inoperantes,
    },
    {
      id: 'Em Alerta',
      label: 'Em Alerta',
      icon: '⚠️',
      activeClass: 'border-amber-500/40 bg-amber-500/20 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.25)]',
      hoverClass: 'hover:text-amber-400',
      count: contadores.alerta,
    },
    {
      id: 'Manutenção',
      label: 'Manutenção',
      icon: '🔧',
      activeClass: 'border-purple-500/40 bg-purple-500/20 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.25)]',
      hoverClass: 'hover:text-purple-300',
      count: contadores.manutencao,
    },
    {
      id: 'Operante',
      label: 'Operante',
      icon: '🟢',
      activeClass: 'border-neon-lime/40 bg-neon-lime/20 text-neon-lime shadow-[0_0_10px_rgba(163,230,53,0.25)]',
      hoverClass: 'hover:text-neon-lime',
      count: contadores.operantes,
    },
  ]

  // Mantém o registo de edições locais coerente com mudanças de status feitas pela API
  const sincronizarEdicaoLocal = (id, patch) => {
    const edicao = alteracoesLocaisRef.current.editados.get(id)
    if (edicao) alteracoesLocaisRef.current.editados.set(id, { ...edicao, ...patch })
  }

  const handleGerarReparo = async (equipamentoId) => {
    if (!equipamentoId) return
    try {
      setExecutandoId(equipamentoId)
      await equipamentosService.gerarOcorrenciaReparo(equipamentoId)
      sincronizarEdicaoLocal(equipamentoId, { status: 'EM_MANUTENCAO', necessidade_manutencao: 'CORRETIVA' })

      // Atualiza o estado local imediatamente para feedback reativo instantâneo
      setEquipamentos((prev) =>
        (prev || []).map((e) =>
          e?.id === equipamentoId
            ? { ...e, status: 'EM_MANUTENCAO', necessidade_manutencao: 'CORRETIVA' }
            : e,
        ),
      )

      window.dispatchEvent(new Event('fogo:data-updated'))
      await carregar()
    } catch (err) {
      console.error('Falha ao gerar chamado de reparo:', err)
      alert(err?.friendlyMessage || err?.message || 'Erro ao gerar chamado de reparo.')
    } finally {
      setExecutandoId(null)
    }
  }

  const handleRestaurar = async (equipamentoId) => {
    if (!equipamentoId) return
    try {
      setExecutandoId(equipamentoId)
      await equipamentosService.restaurarEquipamento(equipamentoId)
      sincronizarEdicaoLocal(equipamentoId, { status: 'OPERANTE', necessidade_manutencao: 'NENHUMA' })

      // Atualiza o estado local imediatamente para status OPERANTE
      setEquipamentos((prev) =>
        (prev || []).map((e) =>
          e?.id === equipamentoId
            ? { ...e, status: 'OPERANTE', necessidade_manutencao: 'NENHUMA' }
            : e,
        ),
      )

      window.dispatchEvent(new Event('fogo:data-updated'))
      await carregar()
    } catch (err) {
      console.error('Falha ao restaurar equipamento:', err)
      alert(err?.friendlyMessage || err?.message || 'Erro ao restaurar equipamento.')
    } finally {
      setExecutandoId(null)
    }
  }

  const handleAbrirParecerIa = (equipamento) => {
    if (!equipamento) return
    setEquipamentoSelecionadoIa(equipamento)
    setModalIaOpen(true)
  }

  const fecharModaisGestao = () => {
    setModalEditarAberto(false)
    setModalExcluirAberto(false)
    setEquipamentoSelecionado(null)
  }

  // 1, 2, 3: Submissão do formulário de criação de novo equipamento no estado local
  const handleSubmitCadastro = (dadosForm) => {
    // 1. Construção do Objeto
    const idUnico =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now()

    const localFormatado =
      dadosForm?.local ||
      dadosForm?.logradouro ||
      (dadosForm?.numero
        ? `${dadosForm?.logradouro || ''}, ${dadosForm.numero}`.trim()
        : dadosForm?.logradouro || '') ||
      'Marília/SP'

    const proximaManutencaoData =
      dadosForm?.proxima_manutencao ||
      dadosForm?.data_proxima_manutencao ||
      getProximaManutencaoInput({ id: idUnico })

    const novoEquipamento = {
      id: dadosForm?.id || idUnico,
      tipo: dadosForm?.tipo || 'RADAR',
      numero_serie: dadosForm?.numero_serie || `EQP-${Date.now()}`,
      marca: dadosForm?.marca || 'F.O.G.O. Tech',
      local: localFormatado,
      logradouro: localFormatado,
      bairro: dadosForm?.bairro || 'Centro',
      proxima_manutencao: proximaManutencaoData,
      data_proxima_manutencao: proximaManutencaoData,
      status: 'Operante',
      necessidade_manutencao: 'NENHUMA',
      cidade_uf: 'Marília/SP',
      _isNovo: true,
    }

    // Registra nas alterações locais para preservar caso carregar() seja invocado
    alteracoesLocaisRef.current.novos = alteracoesLocaisRef.current.novos || []
    alteracoesLocaisRef.current.novos.unshift(novoEquipamento)

    // 2. Atualização do Estado: injeta este novo objeto no topo da lista de equipamentos existente
    setEquipamentos((prev) => [novoEquipamento, ...prev])

    // 3. Finalização: fecha o modal de cadastro
    setIsModalOpen(false)
  }

  const handleSalvarEdicao = (formData) => {
    alteracoesLocaisRef.current.editados.set(formData.id, formData)
    setEquipamentos((prev) => prev.map((eq) => (eq.id === formData.id ? formData : eq)))
    fecharModaisGestao()
  }

  const handleConfirmarExclusao = () => {
    if (!equipamentoSelecionado) return
    const idExcluido = equipamentoSelecionado.id
    alteracoesLocaisRef.current.excluidos.add(idExcluido)
    alteracoesLocaisRef.current.editados.delete(idExcluido)
    if (alteracoesLocaisRef.current.novos) {
      alteracoesLocaisRef.current.novos = alteracoesLocaisRef.current.novos.filter(
        (eq) => eq.id !== idExcluido,
      )
    }
    setEquipamentos((prev) => prev.filter((eq) => eq.id !== idExcluido))
    fecharModaisGestao()
  }

  const limparFiltro = () => {
    setFiltroStatus('Todos')
    setBusca('')
    setSearchParams({})
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header apiOnline={apiOnline} />

        <main className="flex-1 space-y-6 overflow-auto p-6">
          {erro && (
            <div
              role="alert"
              className="rounded-lg border border-neon-red/30 bg-neon-red/10 px-4 py-3 font-mono text-xs text-neon-red"
            >
              ⚠ {erro} — verifique se o backend está rodando em{' '}
              <span className="underline">{import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'}</span>
            </div>
          )}

          {/* Banner de Filtro Ativo */}
          {isFiltroCriticoUrl && filtroStatus === 'Inoperante' && (
            <div
              id="banner-filtro-critico"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neon-red/40 bg-neon-red/10 px-4 py-3 font-mono text-xs text-neon-red shadow-[0_0_15px_rgba(255,59,92,0.15)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-red opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon-red" />
                </span>
                <span className="font-semibold text-white">
                  FILTRO ATIVO: Ativos Inoperantes ({equipamentosFiltrados.length} equipamentos)
                </span>
              </div>
              <button
                type="button"
                id="btn-limpar-filtro"
                onClick={limparFiltro}
                className="inline-flex items-center gap-1.5 rounded-md border border-neon-red/50 bg-neon-red/20 px-3 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-all hover:bg-neon-red/30 hover:shadow-[0_0_10px_rgba(255,59,92,0.4)] focus:outline-none focus:ring-1 focus:ring-neon-red"
              >
                <span>✕</span>
                <span>Limpar Filtro</span>
              </button>
            </div>
          )}

          {/* Cabeçalho da Seção */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold tracking-wider text-white">
                Gestão de Equipamentos
              </h2>
              <p className="mt-1 font-mono text-xs text-slate-400">
                {loading ? (
                  <span className="inline-flex items-center gap-2 text-ember-400">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ember-400 border-t-transparent" />
                    Carregando inventário de ativos...
                  </span>
                ) : (
                  `${equipamentosFiltrados.length} equipamentos ${
                    filtroStatus !== 'Todos' || busca ? 'filtrados' : 'cadastrados no sistema'
                  }`
                )}
              </p>
            </div>

            <button
              type="button"
              id="btn-novo-equipamento"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ember-600 px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-white shadow-ember transition-colors hover:bg-ember-500 focus:outline-none focus:ring-2 focus:ring-ember-500/50"
              onClick={() => setIsModalOpen(true)}
            >
              <span>+</span>
              <span>Novo Equipamento</span>
            </button>
          </div>

          {/* Tabela de Equipamentos */}
          <section className="panel overflow-hidden" aria-label="Lista de Equipamentos">
            {/* Cabeçalho do Painel com Título e Estatísticas */}
            <div className="flex flex-col gap-2 border-b border-white/5 bg-fogo-900/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h3 className="panel-title">INVENTÁRIO DE ATIVOS URBANOS</h3>
                <span className="font-mono text-[10px] text-slate-500">
                  {equipamentosFiltrados.length}
                  {filtroStatus !== 'Todos' || busca ? ` de ${(equipamentos || []).length}` : ''} itens listados
                </span>
              </div>
            </div>

            {/* Barra Superior de Controles: Filtros Rápidos de Status (Esquerda) e Busca Livre (Direita) */}
            <div className="flex flex-col gap-3 border-b border-white/5 bg-fogo-900/40 p-4 lg:flex-row lg:items-center lg:justify-between">
              {/* Esquerda: Botões de Filtro Rápido por Status */}
              <div
                className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/5 bg-fogo-900/80 p-1"
                role="toolbar"
                aria-label="Filtros rápidos de equipamentos por status"
              >
                {BOTOES_STATUS.map((btn) => {
                  const isSelected = filtroStatus === btn.id
                  return (
                    <button
                      key={btn.id}
                      type="button"
                      id={`filtro-status-${btn.id.toLowerCase().replace(/\s+/g, '-')}`}
                      onClick={() => setFiltroStatus(btn.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
                        isSelected
                          ? `border ${btn.activeClass}`
                          : `border border-transparent text-slate-400 hover:bg-white/5 ${btn.hoverClass}`
                      }`}
                    >
                      <span>{btn.icon}</span>
                      <span>{btn.label}</span>
                      <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold">
                        {btn.count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Direita: Input de Busca Textual */}
              <div className="relative min-w-[260px] sm:w-80">
                <input
                  type="text"
                  id="input-busca-equipamentos"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Filtrar por nº série, tipo ou local..."
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-500 transition-colors focus:border-neon-cyan/50 focus:outline-none focus:ring-1 focus:ring-neon-cyan/50"
                />
                {busca && (
                  <button
                    type="button"
                    id="btn-limpar-busca-equip"
                    onClick={() => setBusca('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400 hover:text-white"
                    title="Limpar busca"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-fogo-800 font-mono text-[10px] uppercase tracking-wider text-slate-500 select-none">
                  <tr>
                    <th
                      className={`px-5 py-3 font-medium cursor-pointer hover:text-cyan-400 transition-colors ${
                        sortConfig.key === 'tipo' ? 'text-cyan-400' : ''
                      }`}
                      onClick={() => handleSort('tipo')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tipo</span>
                        {sortConfig.key === 'tipo' && (
                          sortConfig.direction === 'ascending' ? (
                            <ChevronUp className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          )
                        )}
                      </div>
                    </th>
                    <th
                      className={`px-4 py-3 font-medium cursor-pointer hover:text-cyan-400 transition-colors ${
                        sortConfig.key === 'numero_serie' ? 'text-cyan-400' : ''
                      }`}
                      onClick={() => handleSort('numero_serie')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Nº Série</span>
                        {sortConfig.key === 'numero_serie' && (
                          sortConfig.direction === 'ascending' ? (
                            <ChevronUp className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          )
                        )}
                      </div>
                    </th>
                    <th
                      className={`px-4 py-3 font-medium cursor-pointer hover:text-cyan-400 transition-colors ${
                        sortConfig.key === 'marca' ? 'text-cyan-400' : ''
                      }`}
                      onClick={() => handleSort('marca')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Marca</span>
                        {sortConfig.key === 'marca' && (
                          sortConfig.direction === 'ascending' ? (
                            <ChevronUp className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          )
                        )}
                      </div>
                    </th>
                    <th
                      className={`px-4 py-3 font-medium cursor-pointer hover:text-cyan-400 transition-colors ${
                        sortConfig.key === 'local' ? 'text-cyan-400' : ''
                      }`}
                      onClick={() => handleSort('local')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Local (Logradouro / Bairro)</span>
                        {sortConfig.key === 'local' && (
                          sortConfig.direction === 'ascending' ? (
                            <ChevronUp className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          )
                        )}
                      </div>
                    </th>
                    <th
                      className={`px-4 py-3 font-medium cursor-pointer hover:text-cyan-400 transition-colors ${
                        sortConfig.key === 'proxima_manutencao' ? 'text-cyan-400' : ''
                      }`}
                      onClick={() => handleSort('proxima_manutencao')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Próx. Manut.</span>
                        {sortConfig.key === 'proxima_manutencao' && (
                          sortConfig.direction === 'ascending' ? (
                            <ChevronUp className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          )
                        )}
                      </div>
                    </th>
                    <th
                      className={`px-5 py-3 font-medium cursor-pointer hover:text-cyan-400 transition-colors ${
                        sortConfig.key === 'status' ? 'text-cyan-400' : ''
                      }`}
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Status</span>
                        {sortConfig.key === 'status' && (
                          sortConfig.direction === 'ascending' ? (
                            <ChevronUp className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          )
                        )}
                      </div>
                    </th>
                    <th className="px-5 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {loading && (
                    <>
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-ember-400 border-t-transparent" />
                            <span className="font-mono text-xs text-slate-400">
                              Carregando equipamentos e telemetria...
                            </span>
                          </div>
                        </td>
                      </tr>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <tr key={`skeleton-${i}`}>
                          <td colSpan={7} className="px-5 py-3">
                            <div className="h-4 animate-pulse rounded bg-white/5" />
                          </td>
                        </tr>
                      ))}
                    </>
                  )}

                  {!loading && equipamentosOrdenados.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center font-mono text-xs text-slate-500">
                        {(equipamentos || []).length === 0
                          ? 'Nenhum equipamento cadastrado.'
                          : busca
                          ? `Nenhum equipamento localizado para o termo "${busca}".`
                          : `Nenhum equipamento com status "${filtroStatus}" encontrado.`}
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    equipamentosOrdenados.map((eq, index) => {
                      const stKey = String(eq?.status || '').toUpperCase()
                      const st = STATUS_EQUIP[eq?.status] || STATUS_EQUIP[stKey] || fallback
                      const isInoperante = stKey === 'INOPERANTE'
                      const isAlerta = stKey === 'ALERTA' || stKey === 'EM_ALERTA'
                      const isManutencao =
                        stKey === 'EM_MANUTENCAO' ||
                        stKey === 'MANUTENCAO' ||
                        stKey === 'MANUTENÇÃO'

                      const podeGerarReparo = isInoperante || isAlerta
                      const podeRestaurar = isManutencao || isInoperante
                      const itemKey = eq?.id || `equip-${index}`

                      return (
                        <tr key={itemKey} className="transition-colors hover:bg-white/[0.03]">
                          <td className="px-5 py-3">
                            <span className="font-medium text-slate-200">
                              {TIPO_LABEL[eq?.tipo] || eq?.tipo || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-300">
                            {eq?.numero_serie || '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            <div>{eq?.marca || '—'}</div>
                            {eq?.modelo && (
                              <div className="text-[10px] text-slate-500">{eq.modelo}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-[280px] truncate text-slate-200">
                              {eq?.logradouro || eq?.local || '—'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {eq?.bairro || 'Sem bairro'}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-slate-500 text-[11px]">🗓</span>
                              <span>{getProximaManutencaoFormatada(eq)}</span>
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ring-1 ${st?.text || 'text-slate-400'} ${st?.ring || 'ring-white/10'}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${st?.dot || 'bg-slate-500'}`} />
                              {st?.label || eq?.status || 'Indefinido'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-xs">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {podeGerarReparo && (
                                <button
                                  type="button"
                                  id={`btn-reparo-${eq?.id || index}`}
                                  disabled={executandoId === eq?.id}
                                  onClick={() => handleGerarReparo(eq?.id)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-2.5 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)] hover:bg-amber-500/25 hover:border-amber-400 hover:shadow-[0_0_16px_rgba(245,158,11,0.35)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Gerar ocorrência de reparo técnico para despacho de equipes"
                                >
                                  {executandoId === eq?.id ? (
                                    <span className="animate-spin text-xs">⌛</span>
                                  ) : (
                                    <span>⚡</span>
                                  )}
                                  <span>Solicitar Reparo</span>
                                </button>
                              )}

                              {podeRestaurar && (
                                <button
                                  type="button"
                                  id={`btn-restaurar-${eq?.id || index}`}
                                  disabled={executandoId === eq?.id}
                                  onClick={() => handleRestaurar(eq?.id)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-neon-lime/50 bg-neon-lime/15 px-2.5 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-neon-lime shadow-[0_0_12px_rgba(163,230,53,0.2)] hover:bg-neon-lime/25 hover:border-neon-lime/80 hover:shadow-[0_0_16px_rgba(163,230,53,0.35)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Concluir manutenção e restaurar equipamento para status Operante"
                                >
                                  {executandoId === eq?.id ? (
                                    <span className="animate-spin text-xs">⌛</span>
                                  ) : (
                                    <span>✓</span>
                                  )}
                                  <span>Concluir e Restaurar</span>
                                </button>
                              )}

                              {/* Botão de Parecer de Inteligência Preditiva (Oráculo Gemini) */}
                              <button
                                type="button"
                                id={`btn-parecer-ia-${eq?.id || index}`}
                                onClick={() => handleAbrirParecerIa(eq)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-neon-magenta/50 bg-neon-magenta/15 px-2.5 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-neon-magenta shadow-[0_0_12px_rgba(255,42,229,0.2)] hover:bg-neon-magenta/25 hover:border-neon-magenta/80 hover:shadow-[0_0_16px_rgba(255,42,229,0.35)] transition-all"
                                title="Gerar parecer de engenharia de hardware e análise financeira com IA"
                              >
                                <span>🧠</span>
                                <span>Parecer IA</span>
                              </button>

                              {/* Botões Administrativos: Editar e Excluir */}
                              <button 
                                type="button"
                                id={`btn-editar-${eq?.id || index}`}
                                onClick={() => { setEquipamentoSelecionado(eq); setModalEditarAberto(true); }} 
                                title="Editar Equipamento"
                                className="p-2 ml-2 border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_12px_rgba(34,211,238,0.3)] rounded-md transition-all flex items-center justify-center"
                              >
                                <Pencil className="w-4 h-4"/>
                              </button>

                              <button 
                                type="button"
                                id={`btn-excluir-${eq?.id || index}`}
                                onClick={() => { setEquipamentoSelecionado(eq); setModalExcluirAberto(true); }} 
                                title="Excluir Equipamento"
                                className="p-2 border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:shadow-[0_0_12px_rgba(239,68,68,0.3)] rounded-md transition-all flex items-center justify-center"
                              >
                                <Trash2 className="w-4 h-4"/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      <EquipamentoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSubmitCadastro}
        onCadastrar={handleSubmitCadastro}
      />

      <ParecerIaModal
        isOpen={modalIaOpen}
        onClose={() => setModalIaOpen(false)}
        id={equipamentoSelecionadoIa?.id}
        tipo="equipamento"
      />

      {modalEditarAberto && equipamentoSelecionado && (
        <EditarEquipamentoModal
          key={equipamentoSelecionado.id}
          equipamento={equipamentoSelecionado}
          onClose={fecharModaisGestao}
          onSalvar={handleSalvarEdicao}
        />
      )}

      {modalExcluirAberto && equipamentoSelecionado && (
        <ExcluirEquipamentoModal
          equipamento={equipamentoSelecionado}
          onClose={fecharModaisGestao}
          onConfirmar={handleConfirmarExclusao}
        />
      )}
    </div>
  )
}
