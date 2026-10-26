import { useEffect, useState } from 'react'
import DevPanel from './DevPanel.jsx'

export default function Header({ apiOnline, children }) {
  const [now, setNow] = useState(new Date())
  const [devModeClicks, setDevModeClicks] = useState(0)
  const [showDevPanel, setShowDevPanel] = useState(false)
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Reseta contador de cliques após 3s de inatividade
  useEffect(() => {
    if (devModeClicks > 0) {
      const timer = setTimeout(() => setDevModeClicks(0), 3000)
      return () => clearTimeout(timer)
    }
  }, [devModeClicks])

  // Atalho de teclado alternativo para segurança total da apresentação: Ctrl+Shift+D ou F2
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') || e.key === 'F2') {
        e.preventDefault()
        setShowDevPanel((prev) => !prev)
        setNotification('MODO DEV ATIVADO 🛠️')
        setTimeout(() => setNotification(null), 3500)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleLogoClick = () => {
    setDevModeClicks((prev) => {
      const next = prev + 1
      if (next >= 3) {
        setShowDevPanel(true)
        setNotification('MODO DEV ATIVADO 🛠️')
        setTimeout(() => setNotification(null), 3500)
        return 0
      }
      return next
    })
  }

  const statusCls =
    apiOnline === null
      ? 'border-slate-600 text-slate-400'
      : apiOnline
        ? 'border-neon-lime/40 text-neon-lime'
        : 'border-neon-red/40 text-neon-red'
  const statusLabel = apiOnline === null ? 'CONECTANDO' : apiOnline ? 'API ONLINE' : 'API OFFLINE'

  return (
    <>
      {notification && (
        <div
          id="dev-mode-toast"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 rounded-lg border-2 border-amber-500 bg-slate-950/95 px-5 py-2.5 font-mono text-xs font-black uppercase tracking-widest text-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.5)] animate-bounce backdrop-blur-md"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span>{notification}</span>
        </div>
      )}

      {showDevPanel && <DevPanel onClose={() => setShowDevPanel(false)} />}

      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 px-6 py-4">
        <div>
          <h1 className="font-display text-2xl font-black tracking-[0.2em] text-white">
            <span
              id="fogo-logo-trigger"
              onClick={handleLogoClick}
              className="text-ember-500 text-glow-ember cursor-pointer select-none transition-transform hover:opacity-90 active:scale-95"
              title="F.O.G.O. (Clique 3x para abrir o Painel de Desenvolvedor)"
            >
              F.O.G.O.
            </span>
            <span className="ml-3 hidden text-sm font-medium tracking-[0.3em] text-slate-400 md:inline">
              CENTRO DE OPERAÇÕES
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Ferramenta Onisciente de Gestão e Operações · Marília/SP
          </p>
        </div>

        <div className="flex items-center gap-4">
          {children}
          <span
            id="api-status-badge"
            className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] ${statusCls}`}
          >
            <span className="h-2 w-2 animate-flicker rounded-full bg-current" />
            {statusLabel}
          </span>
          <div className="text-right font-mono">
            <div className="text-lg leading-none text-neon-cyan text-glow-cyan">
              {now.toLocaleTimeString('pt-BR')}
            </div>
            <div className="mt-1 text-[11px] uppercase text-slate-500">
              {now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
            </div>
          </div>
        </div>
      </header>
    </>
  )
}

