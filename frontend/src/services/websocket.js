// Gerenciador central de WebSocket para sincronização em tempo real do F.O.G.O. CICC

class FogoWebSocket {
  constructor() {
    this.ws = null
    this.reconnectTimeout = null
    this.pingInterval = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 15
    this.isConnected = false
  }

  getWsUrl() {
    // Permite override explícito via variável de ambiente
    if (import.meta.env.VITE_WS_URL) {
      return import.meta.env.VITE_WS_URL
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
    const isSecure = apiUrl.startsWith('https') || window.location.protocol === 'https:'
    const wsProto = isSecure ? 'wss:' : 'ws:'

    try {
      const url = new URL(apiUrl, window.location.href)
      return `${wsProto}//${url.host}/ws`
    } catch {
      return `${wsProto}//localhost:8000/ws`
    }
  }

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    const wsUrl = this.getWsUrl()
    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0
        console.log('🔌 [FOGO-WS] Conexão WebSocket ativa:', wsUrl)

        // Ping de liveness a cada 25 segundos para manter tunnels (ngrok/proxy) abertos
        if (this.pingInterval) clearInterval(this.pingInterval)
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send('ping')
          }
        }, 25000)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('📡 [FOGO-WS] Evento recebido do CICC:', data)

          // Dispara evento global para que qualquer página do painel atualize suas tabelas sem F5
          window.dispatchEvent(new CustomEvent('fogo:data-updated', { detail: data }))

          if (data?.action === 'nova_ocorrencia') {
            window.dispatchEvent(new CustomEvent('fogo:nova-ocorrencia', { detail: data }))
          }
        } catch {
          // Ignora mensagens de texto simples como pong
        }
      }

      this.ws.onerror = (error) => {
        console.warn('⚠️ [FOGO-WS] Aviso de conectividade WebSocket:', error)
      }

      this.ws.onclose = () => {
        this.isConnected = false
        if (this.pingInterval) clearInterval(this.pingInterval)

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000)
          this.reconnectAttempts++
          clearTimeout(this.reconnectTimeout)
          this.reconnectTimeout = setTimeout(() => {
            this.connect()
          }, delay)
        }
      }
    } catch (err) {
      console.warn('⚠️ [FOGO-WS] Falha ao instanciar conexão WebSocket:', err)
    }
  }

  disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

export const fogoWs = new FogoWebSocket()
