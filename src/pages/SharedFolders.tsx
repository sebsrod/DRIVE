import { useCallback, useEffect, useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  FolderRow,
  createFolder,
  deleteFolder,
  listFolders,
} from '../lib/documents'

export default function SharedFolders() {
  const { user } = useAuth()
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const data = await listFolders()
      setFolders(data)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !name.trim()) return
    try {
      await createFolder(name.trim(), description.trim() || null, user.id)
      setName('')
      setDescription('')
      setShowForm(false)
      await refresh()
    } catch (err) {
      alert('Error al crear la carpeta: ' + (err as Error).message)
    }
  }

  const handleDelete = async (folder: FolderRow) => {
    if (!confirm(`¿Eliminar la carpeta "${folder.name}" y todos sus documentos?`)) return
    try {
      await deleteFolder(folder.id)
      await refresh()
    } catch (err) {
      alert('Error al eliminar: ' + (err as Error).message)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Carpetas compartidas</h2>
          <p className="text-sm text-slate-500">
            Visibles para todos los colaboradores de la oficina.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showForm ? 'Cancelar' : 'Nueva carpeta'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Descripción (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Crear carpeta
          </button>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Cargando…</p>
      ) : folders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Aún no hay carpetas compartidas.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <Link
                to={`/carpetas/${folder.id}`}
                className="block text-lg font-semibold text-indigo-700 hover:underline"
              >
                📁 {folder.name}
              </Link>
              {folder.description && (
                <p className="mt-1 text-sm text-slate-600">{folder.description}</p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Creada el {new Date(folder.created_at).toLocaleDateString()}
              </p>
              {user && folder.created_by === user.id && (
                <button
                  onClick={() => handleDelete(folder)}
                  className="mt-3 text-xs font-medium text-red-600 hover:underline"
                >
                  Eliminar carpeta
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
