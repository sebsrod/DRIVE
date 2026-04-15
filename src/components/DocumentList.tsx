import { useState } from 'react'
import {
  DocumentRow,
  deleteDocument,
  formatSize,
  getDocumentDownloadUrl,
} from '../lib/api'

interface Props {
  documents: DocumentRow[]
  onChange: () => void
  currentUserId: string
}

export default function DocumentList({ documents, onChange, currentUserId }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleDownload = async (doc: DocumentRow) => {
    try {
      setBusyId(doc.id)
      const url = await getDocumentDownloadUrl(doc)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      alert('Error al descargar: ' + (err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (doc: DocumentRow) => {
    if (!confirm(`¿Eliminar "${doc.name}"?`)) return
    try {
      setBusyId(doc.id)
      await deleteDocument(doc)
      onChange()
    } catch (err) {
      alert('Error al eliminar: ' + (err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
        No hay documentos aún.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <ul className="divide-y divide-slate-100">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800">{doc.name}</p>
              <p className="text-xs text-slate-500">
                {formatSize(doc.size)} ·{' '}
                {new Date(doc.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button
                onClick={() => handleDownload(doc)}
                disabled={busyId === doc.id}
                className="rounded-md bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                Descargar
              </button>
              {doc.owner_id === currentUserId && (
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={busyId === doc.id}
                  className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Eliminar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
