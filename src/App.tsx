import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ClientsList from './pages/ClientsList'
import ClientView from './pages/ClientView'
import SubfolderView from './pages/SubfolderView'

export default function App() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Cargando…
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/ejercicio/privado" replace />} />
        <Route path="/ejercicio/:scope" element={<ClientsList />} />
        <Route
          path="/ejercicio/:scope/clientes/:clientId"
          element={<ClientView />}
        />
        <Route
          path="/ejercicio/:scope/clientes/:clientId/carpetas/:folderId"
          element={<SubfolderView />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
