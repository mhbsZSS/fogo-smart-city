// Classes completas (não interpoladas) para o Tailwind detectar no build.
export const STATUS_EQUIP = {
  OPERANTE: { label: 'Operante', dot: 'bg-neon-lime', text: 'text-neon-lime', ring: 'ring-neon-lime/30' },
  ALERTA: { label: 'Alerta', dot: 'bg-neon-amber', text: 'text-neon-amber', ring: 'ring-neon-amber/30' },
  EM_MANUTENCAO: { label: 'Manutenção', dot: 'bg-neon-cyan', text: 'text-neon-cyan', ring: 'ring-neon-cyan/30' },
  INOPERANTE: { label: 'Inoperante', dot: 'bg-neon-red', text: 'text-neon-red', ring: 'ring-neon-red/30' },
}

export const STATUS_AGENTE = {
  DISPONIVEL: { label: 'Disponível', dot: 'bg-neon-lime', text: 'text-neon-lime' },
  EM_DESLOCAMENTO: { label: 'Deslocamento', dot: 'bg-neon-cyan', text: 'text-neon-cyan' },
  EM_ATENDIMENTO: { label: 'Atendimento', dot: 'bg-neon-magenta', text: 'text-neon-magenta' },
  OFFLINE: { label: 'Offline', dot: 'bg-slate-500', text: 'text-slate-500' },
}

export const TIPO_LABEL = {
  RADAR: 'Radar',
  LOMBADA_ELETRONICA: 'Lombada Eletrônica',
  SEMAFORO: 'Semáforo',
  CAMERA_CFTV: 'Câmera CFTV',
  LUMINARIA_LED: 'Luminária LED',
  SENSOR_AMBIENTAL: 'Sensor Ambiental',
  TOTEM_WIFI: 'Totem Wi-Fi',
  AGENTE_TRANSITO: 'Agente de Trânsito',
  GUARDA_MUNICIPAL: 'Guarda Municipal',
  TECNICO_MANUTENCAO: 'Técnico',
  FISCAL_POSTURAS: 'Fiscal',
  DEFESA_CIVIL: 'Defesa Civil',
  RESGATE_MEDICO: 'Resgate / SAMU',
  SAUDE: 'Saúde / SAMU',
  ALERTA_CAMPO: 'Alerta de Campo (Telegram)',
}

export const fallback = { label: '—', dot: 'bg-slate-500', text: 'text-slate-400', ring: 'ring-slate-500/30' }

export const isManutencao = (tipo, titulo = '') => {
  if (!tipo) return false
  const t = String(tipo).toUpperCase()
  // Alertas de campo, defesa civil e emergências NUNCA devem ir para a fila de manutenção de ativos
  if (
    t === 'ALERTA_CAMPO' ||
    t === 'DEFESA_CIVIL' ||
    t === 'SEGURANCA' ||
    t === 'ACIDENTE' ||
    t === 'TRANSITO' ||
    t === 'SAUDE'
  ) {
    return false
  }
  return Boolean(
    tipo?.toLowerCase().includes('manuten') ||
    titulo?.toLowerCase().includes('manuten')
  )
}


