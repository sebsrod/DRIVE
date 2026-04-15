import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  Client,
  ClientFolder,
  DocumentRow,
  getClient,
  getClientFolder,
  listSubfolderDocuments,
  scopeFromSlug,
  slugFromScope,
  uploadDocument,
} from '../lib/api'
import DocumentList from '../components/DocumentList'
import UploadButton from '../components/UploadButton'

export default function SubfolderView() {
  const { scope: scopeSlug, clientId, folderId } = useParams<{
    scope: string
    clientId: string
    folderId: string
  }>()
  const { user } = useAuth()
  const scope = scopeFromSlug(scopeSlug)

  const [client, setClient] = useState<Client | null>(null)
  const [folder, setFolder] = useState<ClientFolder | null>(null)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!clientId || !folderId) return
    try {
      setLoading(true)
      const [c, f, d] = await Promise.all([
        getClient(clientId),
        getClientFolder(folderId),
        listSubfolderDocuments(folderId),
      ])
      setClient(c)
      setFolder(f)
      setDocuments(d)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [clientId, folderId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleUpload = async (file: File) => {
    if (!user || !client || !folderId) return
    await uploadDocument({
      file,
      client,
      subfolderId: folderId,
      ownerId: user.id,
    })
    await refresh()
  }

  if (!user) return null

  const clientUrl = `/ejercicio/${slugFromScope(scope)}/clientes/${clientId}`

  return (
    <div>
      <div className="text-sm">
        <Link
          to={`/ejercicio/${slugFromScope(scope)}`}
          className="text-indigo-600 hover:underline"
        >
          Clientes
        </Link>
        <span className="mx-1 text-slate-400">/</span>
        <Link to={clientUrl} className="text-indigo-600 hover:underline">
          {client?.name ?? 'Cliente'}
        </Link>
        <span className="mx-1 text-slate-400">/</span>
        <span className="text-slate-700">{folder?.name ?? 'Carpeta'}</span>
      </div>

      <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="truncate text-2xl font-bold text-slate-900">
          📂 {folder?.name ?? 'Carpeta'}
        </h2>
        <UploadButton onUpload={handleUpload} label="Subir archivo" />
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <DocumentList
          documents={documents}
          onChange={refresh}
          currentUserId={user.id}
        />
      )}
    </div>
  )
}
