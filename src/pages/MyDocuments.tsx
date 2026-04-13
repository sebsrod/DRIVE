import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  DocumentRow,
  listPersonalDocuments,
  uploadPersonalDocument,
} from '../lib/documents'
import DocumentList from '../components/DocumentList'
import UploadButton from '../components/UploadButton'

export default function MyDocuments() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      const docs = await listPersonalDocuments(user.id)
      setDocuments(docs)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleUpload = async (file: File) => {
    if (!user) return
    await uploadPersonalDocument(file, user.id)
    await refresh()
  }

  if (!user) return null

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Mis documentos</h2>
          <p className="text-sm text-slate-500">
            Documentos privados, solo visibles para ti.
          </p>
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
