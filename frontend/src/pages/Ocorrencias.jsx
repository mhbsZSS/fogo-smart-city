import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import Header from '../components/Header.jsx'
import Sidebar from '../components/Sidebar.jsx'
import OcorrenciaModal from '../components/OcorrenciaModal.jsx'
import DespachoModal from '../components/DespachoModal.jsx'
import DetalhesOcorrenciaModal from '../components/DetalhesOcorrenciaModal.jsx'
import FilaDespacho from '../components/FilaDespacho.jsx'
import { isManutencao } from '../components/statusConfig.js'
import { agentesService, checkHealth, ocorrenciasService } from '../services/api.js'

export default function Ocorrencias() {
  const [apiOnline, setApiOnline] = useState(null)
  const [ocorrencias, setOcorrencias] = useState([])
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' })
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDespachoOpen, setIsDespachoOpen] = useState(false)
  const [ocorrenciaSelecionada, setOcorrenciaSelecionada] = useState(null)
  const [ocorrenciaDetalhe, setOcorrenciaDetalhe] = useState(null)
  const [concluindoId, setConcluindoId] = useState(null)
  const [novoAlerta, setNovoAlerta] = useState(null)

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

