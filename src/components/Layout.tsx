import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-4 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-slate-700 hover:bg-slate-200'
    }`

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white p-4">
        <h1 className="mb-6 px-2 text-xl font-bold text-indigo-700">Office Drive</h1>
        <nav className="flex flex-col gap-1">
          <NavLink to="/mis-documentos" className={linkClass}>
            Mis documentos
          </NavLink>
          <NavLink to="/carpetas" className={linkClass}>
            Carpetas compartidas
          </NavLink>
        </nav>
        <div className="mt-auto border-t border-slate-200 pt-4">
          <p className="truncate px-2 text-xs text-slate-500">{user?.email}</p>
          <button
            onClick={handleSignOut}
            className="mt-2 w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
