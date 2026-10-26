import React from 'react'

/**
 * ErrorBoundary tático no padrão F.O.G.O.
 * Captura exceções na árvore de renderização do React e exibe
 * uma interface amigável de diagnóstico em vez de tela preta/branca.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[FOGO ErrorBoundary] Erro interceptado:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset)
      }

      return (
        <div className="rounded-xl border border-neon-red/50 bg-navy-950/95 p-6 shadow-[0_0_30px_rgba(255,42,85,0.25)] text-slate-100 my-4">
          <div className="flex items-center gap-3 border-b border-neon-red/20 pb-3 mb-4">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neon-red">
                {this.props.title || 'Falha na Renderização do Componente'}
              </h3>
              <p className="font-mono text-xs text-slate-400">
                Uma exceção foi interceptada pelo sistema de contenção do F.O.G.O.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-black/60 border border-slate-800 p-3 mb-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-40">
            <div className="text-neon-red font-semibold mb-1">
              {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Erro desconhecido'}
            </div>
            {this.state.errorInfo?.componentStack && (
              <pre className="text-[10px] text-slate-500 whitespace-pre-wrap leading-tight">
                {this.state.errorInfo.componentStack.trim().slice(0, 500)}
              </pre>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            {this.props.onClose && (
              <button
                type="button"
                onClick={this.props.onClose}
                className="rounded-lg border border-slate-700 bg-navy-900 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white hover:border-slate-500 transition-all"
              >
                Fechar Painel
              </button>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-lg border border-neon-cyan bg-neon-cyan/20 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-neon-cyan hover:bg-neon-cyan/35 shadow-[0_0_12px_rgba(34,229,255,0.25)] transition-all"
            >
              🔄 Tentar Novamente
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
