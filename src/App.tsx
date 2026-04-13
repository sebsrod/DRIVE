import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Signup from './pages/Signup'
import MyDocuments from './pages/MyDocuments'
import SharedFolders from './pages/SharedFolders'
import FolderView from './pages/FolderView'

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
        <Route path="/" element={<Navigate to="/mis-documentos" replace />} />
        <Route path="/mis-documentos" element={<MyDocuments />} />
        <Route path="/carpetas" element={<SharedFolders />} />
        <Route path="/carpetas/:folderId" element={<FolderView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
