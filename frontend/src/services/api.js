import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail = err.response?.data?.detail
    err.friendlyMessage =
      typeof detail === 'string' ? detail : err.message || 'Falha de comunicação com a API'
    return Promise.reject(err)
  },
)

// Health fica fora do prefixo /api/v1
export const checkHealth = () =>
  axios.get(API_URL.replace(/\/api\/v1\/?$/, '') + '/health', { timeout: 5000 }).then((r) => r.data)

export const equipamentosService = {
  listar: (params = {}) => api.get('/equipamentos', { params }).then((r) => r.data),
  resumo: () => api.get('/equipamentos/resumo').then((r) => r.data),
  obter: (id) => api.get(`/equipamentos/${id}`).then((r) => r.data),
  cadastrar: (payload) => api.post('/equipamentos', payload).then((r) => r.data),
  restaurarEquipamento: (id) => api.put(`/equipamentos/${id}/restaurar`).then((r) => r.data),
  gerarOcorrenciaReparo: (id) => api.post(`/equipamentos/${id}/gerar-reparo`).then((r) => r.data),
}

export const restaurarEquipamento = (id) => equipamentosService.restaurarEquipamento(id)
export const gerarOcorrenciaReparo = (id) => equipamentosService.gerarOcorrenciaReparo(id)

export const agentesService = {
  listar: (params = {}) => api.get('/agentes', { params }).then((r) => r.data),
  proximos: (params) => api.get('/agentes/proximos', { params }).then((r) => r.data),
  cadastrar: (payload) => api.post('/agentes', payload).then((r) => r.data),
  sincronizar: () => api.post('/agentes/sync').then((r) => r.data),
  remover: (id) => api.delete(`/agentes/${id}`).then((r) => r.data),
  atualizarStatus: (id, status) => api.patch(`/agentes/${id}/status`, { status }).then((r) => r.data),
}

export const removerAgente = (id) => agentesService.remover(id)
export const atualizarStatusAgente = (id, status) => agentesService.atualizarStatus(id, status)

export const ocorrenciasService = {
  listar: (params = {}) => api.get('/ocorrencias', { params }).then((r) => r.data),
  obter: (id) => api.get(`/ocorrencias/${id}`).then((r) => r.data),
  cadastrar: (payload) => api.post('/ocorrencias', payload).then((r) => r.data),
  despachar: (id, agenteId) =>
    api.put(`/ocorrencias/${id}/despachar`, { agente_id: agenteId }).then((r) => r.data),
  concluirOcorrencia: (id) =>
    api.put(`/ocorrencias/${id}/concluir`).then((r) => r.data),
}

export const concluirOcorrencia = (id) => ocorrenciasService.concluirOcorrencia(id)

export const iaService = {
  analisar: (tipo = 'geral') =>
    api.post('/preditivo/analisar', { tipo_analise: tipo }, { timeout: 90000 }).then((r) => r.data),
}

export const relatoriosService = {
  detalhesOcorrencia: (id) =>
    api.get(`/relatorios/ocorrencias/${id}/detalhes`).then((r) => r.data),
  detalhesEquipamento: (id) =>
    api.get(`/relatorios/equipamentos/${id}/detalhes`).then((r) => r.data),
  detalhesAgente: (id) =>
    api.get(`/relatorios/agentes/${id}/detalhes`).then((r) => r.data),
  parecerEquipamento: (id) =>
    api.get(`/relatorios/equipamentos/${id}/ia`, { timeout: 15000 }).then((r) => r.data),
  auditoriaOcorrencia: (id) =>
    api.get(`/relatorios/ocorrencias/${id}/ia`, { timeout: 15000 }).then((r) => r.data),
  parecerAgente: (id) =>
    api.get(`/relatorios/agentes/${id}/ia`, { timeout: 15000 }).then((r) => r.data),
}

export const obterDetalhesOcorrencia = (id) => relatoriosService.detalhesOcorrencia(id)
export const obterDetalhesEquipamento = (id) => relatoriosService.detalhesEquipamento(id)
export const obterDetalhesAgente = (id) => relatoriosService.detalhesAgente(id)
export const obterParecerEquipamentoIa = (id) => relatoriosService.parecerEquipamento(id)
export const obterAuditoriaOcorrenciaIa = (id) => relatoriosService.auditoriaOcorrencia(id)
export const obterParecerAgenteIa = (id) => relatoriosService.parecerAgente(id)

export const webhookService = {
  simularTelegram: (payload) => {
    const rootUrl = API_URL.replace(/\/api\/v1\/?$/, '')
    return axios
      .post(`${rootUrl}/webhook`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      })
      .then((r) => r.data)
  },
}
