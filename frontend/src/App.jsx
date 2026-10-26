import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Equipamentos from './pages/Equipamentos.jsx'
import Agentes from './pages/Agentes.jsx'
import Ocorrencias from './pages/Ocorrencias.jsx'
import Relatorios from './pages/Relatorios.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { fogoWs } from './services/websocket.js'

export default function App() {
  useEffect(() => {
    fogoWs.connect()
    return () => fogoWs.disconnect()
  }, [])

  return (
    <BrowserRouter>
      <ErrorBoundary title="Painel Central CICC - Falha Recuperável">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/equipamentos" element={<Equipamentos />} />
          <Route path="/agentes" element={<Agentes />} />
          <Route path="/ocorrencias" element={<Ocorrencias />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
