import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  DocumentRow,
  FolderRow,
  listFolderDocuments,
  listFolders,
  uploadSharedDocument,
} from '../lib/documents'
import DocumentList from '../components/DocumentList'
import UploadButton from '../components/UploadButton'

export default function FolderView() {
  const { folderId } = useParams<{ folderId: string }>()
  const { user } = useAuth()
  const [folder, setFolder] = useState<FolderRow | null>(null)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!folderId) return
    try {
      setLoading(true)
      const [folders, docs] = await Promise.all([
        listFolders(),
        listFolderDocuments(folderId),
      ])
      setFolder(folders.find((f) => f.id === folderId) ?? null)
      setDocuments(docs)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [folderId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleUpload = async (file: File) => {
    if (!user || !folderId) return
    await uploadSharedDocument(file, folderId, user.id)
    await refresh()
  }

  if (!user) return null

  return (
    <div>
      <Link to="/carpetas" className="text-sm text-indigo-600 hover:underline">
        ← Volver a carpetas
      </Link>
      <div className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            📁 {folder?.name ?? 'Carpeta'}
          </h2>
          {folder?.description && (
            <p className="text-sm text-slate-500">{folder.description}</p>
          )}
        </div>
        <UploadButton onUpload={handleUpload} />
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
