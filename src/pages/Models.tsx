import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  ModelDocument,
  analyzeStyleFromModels,
  deleteModelDocument,
  formatSize,
  getProfile,
  listModelDocuments,
  uploadModelDocument,
} from '../lib/api'

const MAX_MODELS = 25

export default function Models() {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [models, setModels] = useState<ModelDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{
    current: number
    total: number
  } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [stylePreview, setStylePreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      const [docs, profile] = await Promise.all([
        listModelDocuments(user.id),
        getProfile(user.id),
      ])
      setModels(docs)
      setStylePreview(profile?.writing_style ?? null)
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length || !user) return
    // eslint-disable-next-line no-console
    console.log(`[Modelos] Seleccionados ${files.length} archivo(s)`)

    const available = MAX_MODELS - models.length
    if (available <= 0) {
      setError(
        `Has alcanzado el máximo de ${MAX_MODELS} modelos. Elimina alguno antes de subir nuevos.`,
      )
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    const toUpload = Array.from(files).slice(0, available)
    const skipped = files.length - toUpload.length

    setUploading(true)
    setError(null)
    const failed: string[] = []

    try {
      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i]
        setUploadProgress({ current: i + 1, total: toUpload.length })
        try {
          await uploadModelDocument(file, user.id)
        } catch (err) {
          const msg = (err as Error).message
          // eslint-disable-next-line no-console
          console.error(`[Modelos] Falló "${file.name}":`, err)
          failed.push(`${file.name}: ${msg}`)
        }
      }
      await refresh()

      const msgs: string[] = []
      if (skipped > 0) {
        msgs.push(
          `${skipped} archivo(s) no se subieron porque superarían el máximo de ${MAX_MODELS}.`,
        )
      }
      if (failed.length > 0) {
        msgs.push(`Fallaron ${failed.length} archivo(s): ${failed.join('; ')}`)
      }
      if (msgs.length > 0) setError(msgs.join(' '))
    } finally {
      setUploading(false)
      setUploadProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async (doc: ModelDocument) => {
    if (!confirm(`¿Eliminar "${doc.name}"?`)) return
    try {
      await deleteModelDocument(doc)
      await refresh()
    } catch (err) {
      setError('Error al eliminar: ' + (err as Error).message)
    }
  }

  const handleAnalyze = async () => {
    if (!user || models.length === 0) return
    try {
      setAnalyzing(true)
      setError(null)
      setInfo(null)
      const style = await analyzeStyleFromModels(models)
      setStylePreview(style)
      setInfo(
        'Estilo analizado correctamente. Se usará automáticamente en la generación de documentos.',
      )
      setTimeout(() => setInfo(null), 5000)
    } catch (err) {
      setError('Error al analizar: ' + (err as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-2xl font-bold text-slate-900">Modelos</h2>
      <p className="mb-6 text-sm text-slate-500">
        Sube documentos de ejemplo (PDFs) para que la IA aprenda tu estilo de
        redacción y pueda emularlo al generar nuevos documentos.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {info && <p className="mb-4 text-sm text-green-600">{info}</p>}

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Documentos modelo
            </h3>
            <p className="text-xs text-slate-400">
              {models.length} / {MAX_MODELS} modelos subidos
            </p>
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading || models.length >= MAX_MODELS}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              title={
                models.length >= MAX_MODELS
                  ? `Máximo ${MAX_MODELS} modelos`
                  : undefined
              }
            >
              {uploading
                ? uploadProgress
                  ? `Subiendo ${uploadProgress.current} de ${uploadProgress.total}…`
                  : 'Subiendo…'
                : '+ Subir modelos (PDF)'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : models.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aún no has subido documentos modelo. Sube poderes, contratos o actas
            que hayas redactado anteriormente para que la IA analice tu estilo.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {models.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {doc.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatSize(doc.size)} ·{' '}
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(doc)}
                  className="ml-3 rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <button
          onClick={handleAnalyze}
          disabled={analyzing || models.length === 0}
          className="w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 sm:w-auto"
        >
          {analyzing ? 'Analizando con IA…' : '✨ Analizar modelos'}
        </button>
        {models.length === 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Sube al menos un documento modelo antes de analizar.
          </p>
        )}
      </section>

      {stylePreview && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Guía de estilo extraída
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Esta guía se incluirá automáticamente como instrucción cuando generes
            cualquier documento. Puedes re-analizarla cuando añadas nuevos modelos.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-700 whitespace-pre-line">
            {stylePreview}
          </div>
        </section>
      )}
    </div>
  )
}
