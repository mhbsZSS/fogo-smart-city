import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import Sidebar from '../components/Sidebar.jsx'
import StatCard from '../components/StatCard.jsx'
import TacticalMap from '../components/TacticalMap.jsx'
import EquipmentTable from '../components/EquipmentTable.jsx'
import AgentList from '../components/AgentList.jsx'
import OraculoModal from '../components/OraculoModal.jsx'
import { TIPO_LABEL } from '../components/statusConfig.js'

import { agentesService, checkHealth, equipamentosService, ocorrenciasService } from '../services/api.js'

const REFRESH_MS = 30_000
const PRIORIDADE = { URGENTE: 0, CORRETIVA: 1, PREVENTIVA: 2, NENHUMA: 3 }

export default function Dashboard() {
  const navigate = useNavigate()
  const [apiOnline, setApiOnline] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [equipamentos, setEquipamentos] = useState([])
  const [agentes, setAgentes] = useState([])
  const [ocorrencias, setOcorrencias] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [isOraculoOpen, setIsOraculoOpen] = useState(false)

  // Estados para filtros de camadas do Mapa Tático
  const [mostrarEquipamentos, setMostrarEquipamentos] = useState(true)
  const [mostrarAgentes, setMostrarAgentes] = useState(true)
  const [mostrarOcorrencias, setMostrarOcorrencias] = useState(true)
  const [apenasCriticos, setApenasCriticos] = useState(false)

  // Estado de ordenação dinâmica da Fila de Manutenção
  const [ordenacao, setOrdenacao] = useState({ coluna: 'status', direcao: 'asc' })

  const carregar = useCallback(async () => {
    const [health, res, eqs, ags, ocs] = await Promise.allSettled([
      checkHealth(),
      equipamentosService.resumo(),
      equipamentosService.listar({ limit: 1000 }),
      agentesService.listar({ limit: 500 }),
      ocorrenciasService.listar({ limit: 500 }),
    ])
    setApiOnline(health.status === 'fulfilled')
    if (res.status === 'fulfilled') setResumo(res.value)
    if (eqs.status === 'fulfilled') setEquipamentos(eqs.value)
    if (ags.status === 'fulfilled') setAgentes(ags.value)
    if (ocs.status === 'fulfilled') setOcorrencias(ocs.value)

    const falha = [res, eqs, ags, ocs].find((r) => r.status === 'rejected')
    setErro(falha ? falha.reason?.friendlyMessage || 'Erro ao carregar dados' : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, REFRESH_MS)

    const handleDataUpdate = () => {
      carregar()
    }
    window.addEventListener('fogo:data-updated', handleDataUpdate)
    window.addEventListener('fogo:refresh-dashboard', handleDataUpdate)

    return () => {
      clearInterval(t)
      window.removeEventListener('fogo:data-updated', handleDataUpdate)
      window.removeEventListener('fogo:refresh-dashboard', handleDataUpdate)
    }
  }, [carregar])

  const filaManutencao = useMemo(
    () =>
      equipamentos
        .filter((e) => e.status !== 'OPERANTE' || e.necessidade_manutencao !== 'NENHUMA')
        .slice(0, 50),
    [equipamentos],
  )

  const s = resumo?.por_status ?? {}
  const total = resumo?.total ?? 0
  const disponibilidade = total ? (((s.OPERANTE ?? 0) / total) * 100).toFixed(1) : '0.0'
  const agentesAtivos = agentes.filter((a) => a.status !== 'OFFLINE').length

  const ocorrenciasAtivas = useMemo(
    () => ocorrencias.filter((o) => o.status !== 'RESOLVIDA'),
    [ocorrencias],
  )
  const ocorrenciasPendentes = ocorrencias.filter((o) => o.status === 'PENDENTE').length
  const ocorrenciasEmAtendimento = ocorrencias.filter(
    (o) => o.status === 'EM_ATENDIMENTO' || o.status === 'DESPACHADA',
  ).length

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header apiOnline={apiOnline}>
          <button
            type="button"
            id="btn-oraculo-preditivo"
            onClick={() => setIsOraculoOpen(true)}
            className="group relative inline-flex items-center gap-2 rounded-xl border border-neon-magenta/60 bg-gradient-to-r from-neon-magenta/20 via-neon-cyan/15 to-neon-magenta/20 px-3.5 py-1.5 font-display text-xs font-bold tracking-wider text-white shadow-[0_0_18px_rgba(255,43,214,0.35)] transition-all duration-300 hover:scale-[1.03] hover:border-neon-cyan hover:shadow-[0_0_22px_rgba(34,229,255,0.45)] active:scale-95"
            title="Abrir o Módulo de Inteligência Preditiva (Cidade Preditiva com IA Gemini)"
          >
            {/* Efeito de pulso animado */}
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-magenta opacity-90" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon-magenta" />
            </span>
            <span className="text-sm">🤖</span>
            <span className="bg-gradient-to-r from-white via-neon-cyan to-neon-magenta bg-clip-text text-transparent group-hover:text-white transition-colors">
              Inteligência Preditiva
            </span>
          </button>
        </Header>



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

          {/* Grid superior de Cards Interativos com Navegação Rápida */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard
              id="stat-total"
              label="Ativos monitorados"
              value={total}
              hint="Equipamentos cadastrados"
              accent="ember"
              loading={loading}
              delay={0}
              onClick={() => navigate('/equipamentos')}
            />
            <StatCard
              id="stat-disponibilidade"
              label="Disponibilidade"
              value={`${disponibilidade}%`}
              hint={`${s.OPERANTE ?? 0} operantes`}
              accent="lime"
              loading={loading}
              delay={60}
              onClick={() => navigate('/agentes')}
            />
            <StatCard
              id="stat-criticos"
              label="Críticos"
              value={(s.INOPERANTE ?? 0) + (s.ALERTA ?? 0)}
              hint={`${resumo?.manutencao_vencida ?? 0} manutenções vencidas`}
              accent="red"
              loading={loading}
              delay={120}
              onClick={() => navigate('/equipamentos?filtro=critico')}
            />
            <StatCard
              id="stat-ocorrencias"
              label="Ocorrências ativas"
              value={ocorrenciasAtivas.length}
              hint={`${ocorrenciasPendentes} pendentes · ${ocorrenciasEmAtendimento} em atendimento`}
              accent="amber"
              loading={loading}
              delay={180}
              onClick={() => navigate('/ocorrencias')}
            />
            <StatCard
              id="stat-agentes"
              label="Agentes ativos"
              value={agentesAtivos}
              hint={`de ${agentes.length} cadastrados`}
              accent="magenta"
              loading={loading}
              delay={240}
              onClick={() => navigate('/agentes')}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <TacticalMap
                equipamentos={equipamentos}
                agentes={agentes}
                ocorrencias={ocorrencias}
                mostrarEquipamentos={mostrarEquipamentos}
                setMostrarEquipamentos={setMostrarEquipamentos}
                mostrarAgentes={mostrarAgentes}
                setMostrarAgentes={setMostrarAgentes}
                mostrarOcorrencias={mostrarOcorrencias}
                setMostrarOcorrencias={setMostrarOcorrencias}
                apenasCriticos={apenasCriticos}
                setApenasCriticos={setApenasCriticos}
              />
            </div>
            <section className="panel p-5" aria-label="Distribuição por tipo">
              <h2 className="panel-title mb-4">Distribuição por Tipo</h2>
              <ul className="space-y-3">
                {Object.entries(resumo?.por_tipo ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([tipo, qtd]) => (
                    <li key={tipo}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-slate-300">{TIPO_LABEL[tipo] || tipo}</span>
                        <span className="font-mono text-slate-500">{qtd}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-ember-600 via-ember-400 to-neon-amber transition-all duration-700"
                          style={{ width: `${total ? (qtd / total) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                {!loading && !total && <li className="text-xs text-slate-500">Sem dados.</li>}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <EquipmentTable
                equipamentos={filaManutencao}
                loading={loading}
                ordenacao={ordenacao}
                setOrdenacao={setOrdenacao}
              />
            </div>
            <AgentList agentes={agentes} loading={loading} />
          </div>
        </main>
      </div>

      <OraculoModal
        isOpen={isOraculoOpen}
        onClose={() => setIsOraculoOpen(false)}
      />
    </div>
  )
}

