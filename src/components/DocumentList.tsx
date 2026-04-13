import { useState } from 'react'
import {
  DocumentRow,
  deleteDocument,
  formatSize,
  getDocumentDownloadUrl,
} from '../lib/documents'

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
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">Tamaño</th>
            <th className="px-4 py-3">Subido</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium text-slate-800">{doc.name}</td>
              <td className="px-4 py-3 text-slate-600">{formatSize(doc.size)}</td>
              <td className="px-4 py-3 text-slate-600">
                {new Date(doc.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={busyId === doc.id}
                  className="mr-2 rounded-md bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                >
                  Descargar
                </button>
                {doc.owner_id === currentUserId && (
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={busyId === doc.id}
                    className="rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
