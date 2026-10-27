import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import Header from '../components/Header.jsx'
import Sidebar from '../components/Sidebar.jsx'
import OcorrenciaModal from '../components/OcorrenciaModal.jsx'
import DespachoModal from '../components/DespachoModal.jsx'
import DetalhesOcorrenciaModal from '../components/DetalhesOcorrenciaModal.jsx'
import FilaDespacho from '../components/FilaDespacho.jsx'
import { isManutencao } from '../components/statusConfig.js'
import { api, agentesService, checkHealth, ocorrenciasService } from '../services/api.js'

function ModalEditarOcorrencia({ isOpen, ocorrencia, onClose, onSalvar, salvando }) {
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    tipo: 'ACIDENTE',
    gravidade: 'MEDIA',
  })
  const [erroValidacao, setErroValidacao] = useState(null)

  useEffect(() => {
    if (ocorrencia) {
      setFormData({
        titulo: ocorrencia.titulo || '',
        descricao: ocorrencia.descricao || '',
        tipo: ocorrencia.tipo || 'ACIDENTE',
        gravidade: ocorrencia.gravidade || 'MEDIA',
      })
      setErroValidacao(null)
    }
  }, [ocorrencia])

  if (!isOpen || !ocorrencia) return null

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.titulo.trim() || formData.titulo.trim().length < 3) {
      setErroValidacao('O título deve conter pelo menos 3 caracteres.')
      return
    }
    if (!formData.descricao.trim() || formData.descricao.trim().length < 3) {
      setErroValidacao('A descrição deve conter pelo menos 3 caracteres.')
      return
    }
    setErroValidacao(null)
    onSalvar({
      titulo: formData.titulo.trim(),
      descricao: formData.descricao.trim(),
      tipo: formData.tipo,
      gravidade: formData.gravidade,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-cyan-500/50 bg-slate-900 p-6 shadow-[0_0_30px_rgba(34,211,238,0.25)]">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between border-b border-cyan-500/30 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-cyan-400" />
            <h3 className="font-display text-lg font-bold tracking-wider text-white">
              EDITAR OCORRÊNCIA
            </h3>
          </div>
          <span className="font-mono text-xs text-cyan-400/90 bg-cyan-950/60 px-2 py-1 rounded border border-cyan-500/30">
            #{String(ocorrencia.id || '').slice(0, 8).toUpperCase()}
          </span>
        </div>

        {erroValidacao && (
          <div className="mb-4 rounded border border-rose-500/50 bg-rose-500/10 p-2.5 font-mono text-xs text-rose-300">
            ⚠ {erroValidacao}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Título */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-cyan-400 mb-1.5">
              Título da Ocorrência *
            </label>
            <input
              type="text"
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              required
              minLength={3}
              maxLength={150}
              placeholder="Ex: Semáforo intermitente em amarelo"
              className="w-full rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-cyan-400 mb-1.5">
              Descrição Operacional *
            </label>
            <textarea
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              rows={4}
              required
              minLength={3}
              placeholder="Detalhes ou correções da ocorrência..."
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Tipo e Gravidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-cyan-400 mb-1.5">
                Tipo *
              </label>
              <select
                name="tipo"
                value={formData.tipo}
                onChange={handleChange}
                className="w-full rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              >
                <option value="ACIDENTE">Acidente de Trânsito</option>
                <option value="TRANSITO">Interdição / Trânsito</option>
                <option value="DEFESA_CIVIL">Defesa Civil</option>
                <option value="MANUTENCAO">Manutenção Urbana</option>
                <option value="ILUMINACAO">Falha Elétrica / LED</option>
                <option value="SEGURANCA">Segurança Pública</option>
                <option value="AMBIENTAL">Incidente Ambiental</option>
                <option value="SAUDE">Resgate / SAMU</option>
                <option value="ALERTA_CAMPO">Alerta de Campo (Telegram)</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-cyan-400 mb-1.5">
                Gravidade *
              </label>
              <select
                name="gravidade"
                value={formData.gravidade}
                onChange={handleChange}
                className="w-full rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              >
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="CRITICA">Crítica</option>
              </select>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              disabled={salvando}
              onClick={onClose}
              className="rounded-md border border-slate-700 px-4 py-2 font-mono text-xs uppercase text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-2 rounded-md border border-cyan-500 bg-cyan-500/20 px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.25)] transition-all hover:bg-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] disabled:opacity-50"
            >
              {salvando ? (
                <>
                  <span className="animate-spin text-xs">⌛</span>
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Ocorrencias() {
  const [apiOnline, setApiOnline] = useState(null)
  const [ocorrencias, setOcorrencias] = useState([])
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' })
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDespachoOpen, setIsDespachoOpen] = useState(false)
  const [modalEditarAberto, setModalEditarAberto] = useState(false)
  const [ocorrenciaSelecionada, setOcorrenciaSelecionada] = useState(null)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [ocorrenciaDetalhe, setOcorrenciaDetalhe] = useState(null)
  const [concluindoId, setConcluindoId] = useState(null)
  const [novoAlerta, setNovoAlerta] = useState(null)

  const handleSalvarEdicao = async (dadosAtualizados) => {
    if (!ocorrenciaSelecionada?.id) return
    try {
      setSalvandoEdicao(true)
      const resposta = await api.put('/ocorrencias/' + ocorrenciaSelecionada.id, dadosAtualizados)
      if (resposta.status === 200) {
        const ocorrenciaAtualizada = resposta.data
        setOcorrencias((prev) =>
          (prev || []).map((oc) =>
            oc?.id === ocorrenciaSelecionada.id ? { ...oc, ...ocorrenciaAtualizada } : oc,
          ),
        )
        setModalEditarAberto(false)
        setOcorrenciaSelecionada(null)
        window.dispatchEvent(new CustomEvent('fogo:data-updated'))
      }
    } catch (err) {
      console.error('Erro ao atualizar ocorrência:', err)
      const msg = err.response?.data?.detail || err.friendlyMessage || err.message || 'Erro ao salvar alterações.'
      alert(`Falha ao salvar edição: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`)
    } finally {
      setSalvandoEdicao(false)
    }
  }

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

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    try {
      const [health, ocs, ags] = await Promise.allSettled([
        checkHealth(),
        ocorrenciasService.listar({ limit: 500 }),
        agentesService.listar({ limit: 500 }),
      ])
      setApiOnline(health.status === 'fulfilled')
      if (ocs.status === 'fulfilled') {
        const dados = Array.isArray(ocs.value)
          ? ocs.value
          : Array.isArray(ocs.value?.items)
          ? ocs.value.items
          : []
        setOcorrencias(dados)
      } else {
        setErro(ocs.reason?.friendlyMessage || 'Erro ao carregar ocorrências.')
      }
      if (ags.status === 'fulfilled') {
        const agDados = Array.isArray(ags.value)
          ? ags.value
          : Array.isArray(ags.value?.items)
          ? ags.value.items
          : []
        setAgentes(agDados)
      }
    } catch (err) {
      setErro(err?.message || 'Erro inesperado.')
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar(false)
    const handleDataUpdate = () => {
      carregar(true)
    }
    const handleNovaOcorrencia = (e) => {
      carregar(true)
      if (e?.detail) {
        setNovoAlerta(e.detail)
        setTimeout(() => setNovoAlerta(null), 6000)
      }
    }

    window.addEventListener('fogo:data-updated', handleDataUpdate)
    window.addEventListener('fogo:nova-ocorrencia', handleNovaOcorrencia)

    const timer = setInterval(() => {
      carregar(true)
    }, 15_000)

    return () => {
      clearInterval(timer)
      window.removeEventListener('fogo:data-updated', handleDataUpdate)
      window.removeEventListener('fogo:nova-ocorrencia', handleNovaOcorrencia)
    }
  }, [carregar])

  const handleEncerrarOcorrencia = async (id) => {
    try {
      setConcluindoId(id)
      await ocorrenciasService.concluirOcorrencia(id)

      // Atualiza o estado local imediatamente para feedback visual instantâneo (verde/resolvida)
      setOcorrencias((prev) =>
        (prev || []).map((oc) =>
          oc?.id === id ? { ...oc, status: 'RESOLVIDA' } : oc,
        ),
      )

      // Notifica todos os módulos da aplicação (Dashboard, Mapas Táticos, DevPanel)
      window.dispatchEvent(new CustomEvent('fogo:data-updated'))

      // Recarrega os dados completos da API em segundo plano (libera agentes no pool)
      await carregar(true)
    } catch (err) {
      console.error('Falha ao concluir ocorrência:', err)
      alert(err?.friendlyMessage || err?.message || 'Erro ao concluir ocorrência.')
    } finally {
      setConcluindoId(null)
    }
  }

  const emergenciasPendentes = (ocorrencias || []).filter(
    (o) => o?.status === 'PENDENTE' && !isManutencao(o?.tipo, o?.titulo),
  ).length

  const manutencoesPendentes = (ocorrencias || []).filter(
    (o) => o?.status === 'PENDENTE' && isManutencao(o?.tipo, o?.titulo),
  ).length

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

          {/* Banner Tático de Sincronização em Tempo Real (WebSocket) */}
          {novoAlerta && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neon-amber/50 bg-neon-amber/15 px-4 py-3 font-mono text-xs text-neon-amber shadow-[0_0_15px_rgba(245,158,11,0.25)]"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-amber opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-amber" />
                </span>
                <span className="font-bold uppercase tracking-wider">🚨 Nova Ocorrência Recebida:</span>
                <span className="text-white">
                  #{novoAlerta.protocolo} — {novoAlerta.titulo}
                </span>
              </div>
              <span className="rounded bg-black/50 px-2 py-0.5 text-[10px] text-neon-amber border border-neon-amber/30">
                Sincronizado via WebSocket
              </span>
            </div>
          )}

          {/* Cabeçalho da Seção */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-xl font-bold tracking-wider text-white">
                  Gestão de Ocorrências
                </h2>
                {emergenciasPendentes > 0 && (
                  <span className="flex items-center gap-1.5 rounded-full border border-neon-red/40 bg-neon-red/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neon-red">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-red opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon-red" />
                    </span>
                    {emergenciasPendentes} emergência{emergenciasPendentes > 1 ? 's' : ''} pendente{emergenciasPendentes > 1 ? 's' : ''}
                  </span>
                )}
                {manutencoesPendentes > 0 && (
                  <span className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
                    <span>🔧</span>
                    {manutencoesPendentes} manutenç{manutencoesPendentes > 1 ? 'ões' : 'ão'} de ativos
                  </span>
                )}
              </div>
              <p className="mt-1 font-mono text-xs text-slate-400">
                {loading
                  ? 'Carregando incidentes operacionais...'
                  : `${(ocorrencias || []).length} ocorrências registradas no Centro de Controle`}
              </p>
            </div>

            <button
              type="button"
              id="btn-nova-ocorrencia"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neon-amber/50 bg-neon-amber/20 px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-neon-amber shadow-[0_0_15px_rgba(255,197,49,0.25)] transition-all hover:border-neon-amber hover:bg-neon-amber/30 hover:shadow-[0_0_20px_rgba(255,197,49,0.4)] focus:outline-none focus:ring-2 focus:ring-neon-amber/50"
              onClick={() => setIsModalOpen(true)}
            >
              <span>+</span>
              <span>NOVA OCORRÊNCIA</span>
            </button>
          </div>

          {/* Tabela: Fila de Despacho & Atendimento */}
          <FilaDespacho
            ocorrencias={ocorrencias}
            agentes={agentes}
            loading={loading}
            concluindoId={concluindoId}
            sortConfig={sortConfig}
            onSort={handleSort}
            onVerDetalhes={(oc) => setOcorrenciaDetalhe(oc)}
            onDespachar={(oc) => {
              setOcorrenciaSelecionada(oc)
              setIsDespachoOpen(true)
            }}
            onEditar={(ocorrencia) => {
              setOcorrenciaSelecionada(ocorrencia)
              setModalEditarAberto(true)
            }}
            setOcorrenciaSelecionada={setOcorrenciaSelecionada}
            setModalEditarAberto={setModalEditarAberto}
            onConcluir={handleEncerrarOcorrencia}
          />
        </main>
      </div>

      <OcorrenciaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => carregar(false)}
      />

      <DespachoModal
        isOpen={isDespachoOpen}
        onClose={() => {
          setIsDespachoOpen(false)
          setOcorrenciaSelecionada(null)
        }}
        onSuccess={() => carregar(true)}
        onDespachoSucesso={() => carregar(true)}
        fetchOcorrencias={() => carregar(true)}
        fetchAgentes={() => carregar(true)}
        ocorrencia={ocorrenciaSelecionada}
      />

      {/* Modal Tático de Edição de Ocorrência */}
      {modalEditarAberto && ocorrenciaSelecionada && (
        <ModalEditarOcorrencia
          isOpen={modalEditarAberto}
          ocorrencia={ocorrenciaSelecionada}
          onClose={() => {
            setModalEditarAberto(false)
            setOcorrenciaSelecionada(null)
          }}
          onSalvar={handleSalvarEdicao}
          salvando={salvandoEdicao}
        />
      )}

      {/* Modal Tático Flutuante: Dossiê e Visão Completa da Ocorrência */}
      {ocorrenciaDetalhe && (
        <DetalhesOcorrenciaModal
          ocorrencia={ocorrenciaDetalhe}
          agentes={agentes}
          onClose={() => setOcorrenciaDetalhe(null)}
          onDespachar={(oc) => {
            setOcorrenciaDetalhe(null)
            setOcorrenciaSelecionada(oc)
            setIsDespachoOpen(true)
          }}
        />
      )}
    </div>
  )
}

