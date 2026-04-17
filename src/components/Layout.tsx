import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import WelcomeModal from './WelcomeModal'

const WELCOME_KEY_PREFIX = 'office-drive:welcome-dismissed:'

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(false)

  // Cerrar el sidebar al cambiar de ruta (en móvil)
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Mostrar el manual de bienvenida la primera vez que el usuario entra,
  // a menos que haya marcado "No mostrar más" antes.
  useEffect(() => {
    if (!user) return
    const dismissed =
      localStorage.getItem(`${WELCOME_KEY_PREFIX}${user.id}`) === '1'
    if (!dismissed) setWelcomeOpen(true)
  }, [user])

  const handleWelcomeClose = (dontShowAgain: boolean) => {
    if (user && dontShowAgain) {
      localStorage.setItem(`${WELCOME_KEY_PREFIX}${user.id}`, '1')
    }
    setWelcomeOpen(false)
  }

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
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Topbar móvil */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <h1 className="text-lg font-bold text-indigo-700">Office Drive</h1>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menú"
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {open ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </header>

      {/* Overlay móvil cuando el sidebar está abierto */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white p-4 transition-transform duration-200 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <h1 className="mb-6 hidden px-2 text-xl font-bold text-indigo-700 md:block">
          Office Drive
        </h1>
        <nav className="flex flex-col gap-1">
          <NavLink to="/ejercicio/privado" className={linkClass}>
            Ejercicio privado
          </NavLink>
          <NavLink to="/ejercicio/equipo" className={linkClass}>
            Ejercicio en equipo
          </NavLink>
          <NavLink to="/modelos" className={linkClass}>
            Modelos
          </NavLink>
          <NavLink to="/perfil" className={linkClass}>
            Perfil
          </NavLink>
          <NavLink to="/manual" className={linkClass}>
            Manual
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

      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-8">
        <Outlet />
      </main>

      <WelcomeModal open={welcomeOpen} onClose={handleWelcomeClose} />
    </div>
  )
}
