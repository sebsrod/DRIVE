import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  Client,
  createClient,
  deleteClient,
  listClients,
  scopeFromSlug,
  scopeLabel,
  slugFromScope,
} from '../lib/api'
import ClientFormModal, { ClientFormValues } from '../components/ClientFormModal'

export default function ClientsList() {
  const { scope: scopeSlug } = useParams<{ scope: string }>()
  const { user } = useAuth()
  const isValidScope = scopeSlug === 'privado' || scopeSlug === 'equipo'
  const scope = scopeFromSlug(scopeSlug)
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!isValidScope) return
    try {
      setLoading(true)
      const data = await listClients(scope)
      setClients(data)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [scope, isValidScope])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!isValidScope) {
    return <Navigate to="/ejercicio/privado" replace />
  }

  const handleCreate = async (values: ClientFormValues) => {
    if (!user) return
    await createClient(scope, user.id, values)
    await refresh()
  }

  const handleDelete = async (client: Client) => {
    if (
      !confirm(
        `¿Eliminar al cliente "${client.name}" y todos sus archivos? Esta acción no se puede deshacer.`,
      )
    )
      return
    try {
      await deleteClient(client)
      await refresh()
    } catch (err) {
      alert('Error al eliminar: ' + (err as Error).message)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{scopeLabel(scope)}</h2>
          <p className="text-sm text-slate-500">
            {scope === 'private'
              ? 'Tus clientes privados, solo visibles para ti.'
              : 'Clientes compartidos con todo el equipo de la oficina.'}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Agregar cliente
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Cargando…</p>
      ) : clients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Aún no hay clientes. Pulsa <strong>Agregar cliente</strong> para crear el
          primero.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <div
              key={client.id}
              className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/ejercicio/${slugFromScope(scope)}/clientes/${client.id}`}
                  className="min-w-0 flex-1 truncate text-lg font-semibold text-indigo-700 hover:underline"
                >
                  📁 {client.name}
                </Link>
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    client.client_type === 'juridica'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-sky-100 text-sky-800'
                  }`}
                >
                  {client.client_type === 'juridica' ? 'Jurídica' : 'Natural'}
                </span>
              </div>
              <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
                {client.cedula_rif && (
                  <div>
                    <dt className="inline font-medium">Cédula/RIF: </dt>
                    <dd className="inline">{client.cedula_rif}</dd>
                  </div>
                )}
                {client.phone && (
                  <div>
                    <dt className="inline font-medium">Tel: </dt>
                    <dd className="inline">{client.phone}</dd>
                  </div>
                )}
                {client.address && (
                  <div className="line-clamp-2">
                    <dt className="inline font-medium">Dirección: </dt>
                    <dd className="inline">{client.address}</dd>
                  </div>
                )}
              </dl>
              {user && client.owner_id === user.id && (
                <button
                  onClick={() => handleDelete(client)}
                  className="mt-3 self-start text-xs font-medium text-red-600 hover:underline"
                >
                  Eliminar cliente
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ClientFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  )
}
