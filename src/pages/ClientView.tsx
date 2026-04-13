import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  Client,
  ClientFolder,
  DocumentRow,
  createClientFolder,
  deleteClientFolder,
  getClient,
  listClientDocuments,
  listClientFolders,
  scopeFromSlug,
  slugFromScope,
  uploadDocument,
} from '../lib/api'
import DocumentList from '../components/DocumentList'
import UploadButton from '../components/UploadButton'
import FolderFormModal from '../components/FolderFormModal'

export default function ClientView() {
  const { scope: scopeSlug, clientId } = useParams<{
    scope: string
    clientId: string
  }>()
  const { user } = useAuth()
  const scope = scopeFromSlug(scopeSlug)

  const [client, setClient] = useState<Client | null>(null)
  const [folders, setFolders] = useState<ClientFolder[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [folderModalOpen, setFolderModalOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!clientId) return
    try {
      setLoading(true)
      const [c, f, d] = await Promise.all([
        getClient(clientId),
        listClientFolders(clientId),
        listClientDocuments(clientId),
      ])
      setClient(c)
      setFolders(f)
      setDocuments(d)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleUpload = async (file: File) => {
    if (!user || !client) return
    await uploadDocument({ file, client, subfolderId: null, ownerId: user.id })
    await refresh()
  }

  const handleCreateFolder = async (name: string) => {
    if (!clientId) return
    await createClientFolder(clientId, name)
    await refresh()
  }

  const handleDeleteFolder = async (folder: ClientFolder) => {
    if (!confirm(`¿Eliminar la carpeta "${folder.name}" y todos sus archivos?`))
      return
    try {
      await deleteClientFolder(folder, scope)
      await refresh()
    } catch (err) {
      alert('Error al eliminar la carpeta: ' + (err as Error).message)
    }
  }

  if (!user) return null

  const backUrl = `/ejercicio/${slugFromScope(scope)}`

  return (
    <div>
      <Link to={backUrl} className="text-sm text-indigo-600 hover:underline">
        ← Volver a clientes
      </Link>

      <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-slate-900">
            📁 {client?.name ?? 'Cliente'}
          </h2>
          {client && (
            <dl className="mt-1 space-y-0.5 text-xs text-slate-600">
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
                <div>
                  <dt className="inline font-medium">Dirección: </dt>
                  <dd className="inline">{client.address}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => setFolderModalOpen(true)}
            className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            + Nueva carpeta
          </button>
          <UploadButton onUpload={handleUpload} label="Subir archivo" />
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <>
          <section className="mb-8">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Carpetas
            </h3>
            {folders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                Sin carpetas. Crea una para organizar los archivos del cliente.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <Link
                      to={`/ejercicio/${slugFromScope(scope)}/clientes/${
                        clientId
                      }/carpetas/${folder.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-indigo-700 hover:underline"
                    >
                      📂 {folder.name}
                    </Link>
                    <button
                      onClick={() => handleDeleteFolder(folder)}
                      className="ml-2 flex-shrink-0 text-xs font-medium text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Archivos del cliente
            </h3>
            <DocumentList
              documents={documents}
              onChange={refresh}
              currentUserId={user.id}
            />
          </section>
        </>
      )}

      <FolderFormModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        onSubmit={handleCreateFolder}
      />
    </div>
  )
}
