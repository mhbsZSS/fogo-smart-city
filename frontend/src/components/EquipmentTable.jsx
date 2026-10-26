import { useMemo, useState } from 'react'
import { STATUS_EQUIP, TIPO_LABEL, fallback } from './statusConfig.js'

const fmtData = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

// Pesos matemáticos de status: Inoperante = 1, Alerta/Manutenção = 2, Operante = 3
const STATUS_PESOS = {
  INOPERANTE: 1,
  ALERTA: 2,
  EM_MANUTENCAO: 2,
  MANUTENCAO: 2,
  OPERANTE: 3,
}

// Pesos matemáticos de necessidade: Urgente = 1, Corretiva = 2, Preventiva = 3, Nenhuma = 4
const NECESSIDADE_PESOS = {
  URGENTE: 1,
  CORRETIVA: 2,
  PREVENTIVA: 3,
  NENHUMA: 4,
}

export default function EquipmentTable({
  equipamentos = [],
  loading,
  ordenacao: propOrdenacao,
  setOrdenacao: propSetOrdenacao,
}) {
  const [internalOrdenacao, setInternalOrdenacao] = useState({ coluna: 'status', direcao: 'asc' })
  const ordenacao = propOrdenacao || internalOrdenacao
  const setOrdenacao = propSetOrdenacao || setInternalOrdenacao

  const alternarOrdenacao = (coluna) => {
    setOrdenacao((prev) => {
      if (prev.coluna === coluna) {
        return { coluna, direcao: prev.direcao === 'asc' ? 'desc' : 'asc' }
      }
      return { coluna, direcao: 'asc' }
    })
  }

  // Ordenação dinâmica com foco em urgência e status
  const equipamentosOrdenados = useMemo(() => {
    const lista = [...equipamentos]
    const { coluna, direcao } = ordenacao
    const mult = direcao === 'asc' ? 1 : -1

    return lista.sort((a, b) => {
      if (coluna === 'status') {
        const pesoA = STATUS_PESOS[a.status] ?? 99
        const pesoB = STATUS_PESOS[b.status] ?? 99
        if (pesoA !== pesoB) {
          return (pesoA - pesoB) * mult
        }
        // Desempate por urgência de manutenção
        const necA = NECESSIDADE_PESOS[a.necessidade_manutencao] ?? 99
        const necB = NECESSIDADE_PESOS[b.necessidade_manutencao] ?? 99
        if (necA !== necB) return necA - necB

        const dtA = a.data_proxima_manutencao ? new Date(a.data_proxima_manutencao).getTime() : Infinity
        const dtB = b.data_proxima_manutencao ? new Date(b.data_proxima_manutencao).getTime() : Infinity
        return dtA - dtB
      }

      if (coluna === 'necessidade') {
        const necA = NECESSIDADE_PESOS[a.necessidade_manutencao] ?? 99
        const necB = NECESSIDADE_PESOS[b.necessidade_manutencao] ?? 99
        if (necA !== necB) {
          return (necA - necB) * mult
        }
        // Desempate por status (mais críticos primeiro)
        const pesoA = STATUS_PESOS[a.status] ?? 99
        const pesoB = STATUS_PESOS[b.status] ?? 99
        if (pesoA !== pesoB) return pesoA - pesoB

        const dtA = a.data_proxima_manutencao ? new Date(a.data_proxima_manutencao).getTime() : Infinity
        const dtB = b.data_proxima_manutencao ? new Date(b.data_proxima_manutencao).getTime() : Infinity
        return dtA - dtB
      }

      if (coluna === 'tipo') {
        const valA = TIPO_LABEL[a.tipo] || a.tipo || ''
        const valB = TIPO_LABEL[b.tipo] || b.tipo || ''
        return valA.localeCompare(valB) * mult
      }

      if (coluna === 'local') {
        const valA = `${a.logradouro || ''} ${a.bairro || ''}`
        const valB = `${b.logradouro || ''} ${b.bairro || ''}`
        return valA.localeCompare(valB) * mult
      }

      if (coluna === 'data_proxima_manutencao') {
        const dtA = a.data_proxima_manutencao ? new Date(a.data_proxima_manutencao).getTime() : Infinity
        const dtB = b.data_proxima_manutencao ? new Date(b.data_proxima_manutencao).getTime() : Infinity
        return (dtA - dtB) * mult
      }

      return 0
    })
  }, [equipamentos, ordenacao])

  const renderHeader = (coluna, label, align = 'left') => {
    const isAtivo = ordenacao.coluna === coluna
    return (
      <th
        id={`th-sort-${coluna}`}
        onClick={() => alternarOrdenacao(coluna)}
        className={`group cursor-pointer select-none py-2 font-medium transition-colors hover:text-white ${
          coluna === 'tipo' || coluna === 'data_proxima_manutencao' ? 'px-5' : 'px-3'
        } ${align === 'right' ? 'text-right' : 'text-left'} ${
          isAtivo ? 'text-neon-cyan' : 'text-slate-500'
        }`}
        title={`Clique para ordenar por ${label} (${isAtivo && ordenacao.direcao === 'asc' ? 'descendente' : 'ascendente'})`}
      >
        <div className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
          <span>{label}</span>
          {isAtivo ? (
            <span className="font-mono text-xs font-bold text-neon-cyan">
              {ordenacao.direcao === 'asc' ? '↑' : '↓'}
            </span>
          ) : (
            <span className="text-[10px] opacity-0 transition-opacity group-hover:opacity-40">↕</span>
          )}
        </div>
      </th>
    )
  }

  return (
    <section className="panel overflow-hidden" aria-label="Equipamentos críticos">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="panel-title">Fila de Manutenção</h2>
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-400">
            {ordenacao.coluna}: {ordenacao.direcao === 'asc' ? 'ascendente (urgentes no topo)' : 'descendente'}
          </span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">{equipamentos.length} itens</span>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-fogo-800 font-mono text-[10px] uppercase tracking-wider text-slate-500 shadow-sm">
            <tr>
              {renderHeader('tipo', 'Tipo')}
              {renderHeader('local', 'Local')}
              {renderHeader('status', 'Status')}
              {renderHeader('necessidade', 'Necessidade')}
              {renderHeader('data_proxima_manutencao', 'Próx. manut.', 'right')}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-5 py-3">
                    <div className="h-4 animate-pulse rounded bg-white/5" />
                  </td>
                </tr>
              ))}
            {!loading && equipamentosOrdenados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-xs text-slate-500">
                  Nenhum equipamento demandando atenção.
                </td>
              </tr>
            )}
            {!loading &&
              equipamentosOrdenados.map((e) => {
                const st = STATUS_EQUIP[e.status] || fallback
                const vencida = e.data_proxima_manutencao && new Date(e.data_proxima_manutencao) < new Date()
                return (
                  <tr key={e.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-slate-200">{TIPO_LABEL[e.tipo] || e.tipo}</div>
                      <div className="font-mono text-[10px] text-slate-500">{e.numero_serie}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="max-w-[220px] truncate text-slate-300">{e.logradouro}</div>
                      <div className="text-[11px] text-slate-500">{e.bairro}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ring-1 ${st.text} ${st.ring}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          e.necessidade_manutencao === 'URGENTE'
                            ? 'bg-neon-red/15 text-neon-red font-semibold border border-neon-red/30'
                            : e.necessidade_manutencao === 'CORRETIVA'
                            ? 'bg-neon-amber/15 text-neon-amber'
                            : 'text-slate-400'
                        }`}
                      >
                        {e.necessidade_manutencao}
                      </span>
                    </td>
                    <td className={`px-5 py-2.5 text-right font-mono text-xs ${vencida ? 'text-neon-red font-semibold' : 'text-slate-400'}`}>
                      {fmtData(e.data_proxima_manutencao)}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
