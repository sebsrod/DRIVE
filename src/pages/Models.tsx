import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  ActTemplate,
  MODEL_CATEGORIES,
  ModelCategory,
  ModelDocument,
  analyzeStyleFromModels,
  deleteModelDocument,
  extractTemplatesFromModels,
  formatSize,
  getProfile,
  listActTemplates,
  listModelDocuments,
  updateActTemplateText,
  uploadModelDocument,
} from '../lib/api'

const MAX_MODELS_PER_CATEGORY = 25

export default function Models() {
  const { user } = useAuth()
  const [models, setModels] = useState<ModelDocument[]>([])
  const [writingStyles, setWritingStyles] = useState<Record<string, string>>({})
  const [legacyStyle, setLegacyStyle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
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
      setWritingStyles(profile?.writing_styles ?? {})
      setLegacyStyle(profile?.writing_style ?? null)
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

  // Agrupar modelos por categoría
  const modelsByCategory = useMemo(() => {
    const groups: Record<string, ModelDocument[]> = {}
    for (const cat of MODEL_CATEGORIES) groups[cat.key] = []
    const uncategorized: ModelDocument[] = []
    for (const m of models) {
      if (m.category && groups[m.category]) {
        groups[m.category].push(m)
      } else {
        uncategorized.push(m)
      }
    }
    return { groups, uncategorized }
  }, [models])

  if (!user) return null

  const hasLegacy =
    legacyStyle && Object.keys(writingStyles).length === 0

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-2xl font-bold text-slate-900">Modelos</h2>
      <p className="mb-6 text-sm text-slate-500">
        Sube ejemplos de documentos que hayas redactado en cada categoría.
        La IA analizará cada categoría por separado y usará el estilo
        correspondiente al tipo de documento que estés generando.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {info && <p className="mb-4 text-sm text-green-600">{info}</p>}

      {hasLegacy && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Tienes una guía de estilo antigua sin categorizar. Analiza tus
            modelos por categoría abajo para reemplazarla. Hasta entonces, la
            guía legacy se usará como respaldo cuando una categoría no tenga
            análisis propio.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <div className="space-y-6">
          {MODEL_CATEGORIES.map((cat) => (
            <CategorySection
              key={cat.key}
              category={cat.key}
              label={cat.label}
              description={cat.description}
              models={modelsByCategory.groups[cat.key] ?? []}
              stylePreview={writingStyles[cat.key] ?? null}
              onChange={refresh}
              setError={setError}
              setInfo={setInfo}
              userId={user.id}
            />
          ))}

          {modelsByCategory.uncategorized.length > 0 && (
            <section className="rounded-lg border border-slate-300 bg-slate-50 p-5">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Sin clasificar ({modelsByCategory.uncategorized.length})
              </h3>
              <p className="mb-3 text-xs text-slate-500">
                Estos modelos fueron subidos antes de activar las categorías.
                Elimínalos y vuelve a subirlos en la categoría correcta.
              </p>
              <ul className="divide-y divide-slate-200">
                {modelsByCategory.uncategorized.map((doc) => (
                  <UncategorizedRow
                    key={doc.id}
                    doc={doc}
                    onChange={refresh}
                    setError={setError}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// =========================================================
// Sección por categoría
// =========================================================

interface CategorySectionProps {
  category: ModelCategory
  label: string
  description: string
  models: ModelDocument[]
  stylePreview: string | null
  onChange: () => Promise<void>
  setError: (msg: string | null) => void
  setInfo: (msg: string | null) => void
  userId: string
}

function CategorySection({
  category,
  label,
  description,
  models,
  stylePreview,
  onChange,
  setError,
  setInfo,
  userId,
}: CategorySectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{
    current: number
    total: number
  } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [templates, setTemplates] = useState<ActTemplate[]>([])
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  // Cargar templates al montar
  useEffect(() => {
    let alive = true
    listActTemplates(category)
      .then((ts) => {
        if (alive) setTemplates(ts)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [category])

  const refreshTemplates = async () => {
    try {
      const ts = await listActTemplates(category)
      setTemplates(ts)
    } catch {
      // ignore
    }
  }

  const handleExtract = async () => {
    if (models.length === 0) return
    try {
      setExtracting(true)
      setError(null)
      setInfo(null)
      const result = await extractTemplatesFromModels(models, category)
      await refreshTemplates()
      setInfo(
        `Se extrajeron ${result.count} plantilla(s) de "${label}". Revísalas abajo y edítalas si es necesario.`,
      )
      setTimeout(() => setInfo(null), 6000)
    } catch (err) {
      setError(`Error al extraer plantillas de "${label}": ` + (err as Error).message)
    } finally {
      setExtracting(false)
    }
  }

  const handleSaveTemplate = async (t: ActTemplate) => {
    try {
      await updateActTemplateText(t.id, editText)
      setEditingTemplate(null)
      await refreshTemplates()
      setInfo('Plantilla guardada.')
      setTimeout(() => setInfo(null), 2000)
    } catch (err) {
      setError('Error guardando: ' + (err as Error).message)
    }
  }

  const atCap = models.length >= MAX_MODELS_PER_CATEGORY

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    const available = MAX_MODELS_PER_CATEGORY - models.length
    if (available <= 0) {
      setError(
        `Has alcanzado el máximo de ${MAX_MODELS_PER_CATEGORY} modelos en "${label}". Elimina alguno antes de subir nuevos.`,
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
          await uploadModelDocument(file, userId, category)
        } catch (err) {
          const msg = (err as Error).message
          // eslint-disable-next-line no-console
          console.error(`[Modelos:${category}] Falló "${file.name}":`, err)
          failed.push(`${file.name}: ${msg}`)
        }
      }
      await onChange()

      const msgs: string[] = []
      if (skipped > 0) {
        msgs.push(
          `${skipped} archivo(s) no se subieron por el cupo de ${MAX_MODELS_PER_CATEGORY}.`,
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
      await onChange()
    } catch (err) {
      setError('Error al eliminar: ' + (err as Error).message)
    }
  }

  const handleAnalyze = async () => {
    if (models.length === 0) return
    try {
      setAnalyzing(true)
      setError(null)
      setInfo(null)
      await analyzeStyleFromModels(models, category)
      await onChange()
      setInfo(`Estilo de "${label}" analizado correctamente.`)
      setTimeout(() => setInfo(null), 4000)
    } catch (err) {
      setError(`Error al analizar "${label}": ` + (err as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{label}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          <p className="mt-1 text-xs text-slate-400">
            {models.length} / {MAX_MODELS_PER_CATEGORY} modelos ·{' '}
            {stylePreview ? 'Estilo analizado ✅' : 'Sin analizar'}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
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
            disabled={uploading || atCap}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {uploading
              ? uploadProgress
                ? `${uploadProgress.current}/${uploadProgress.total}`
                : 'Subiendo…'
              : '+ Subir PDFs'}
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || models.length === 0}
            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {analyzing ? 'Analizando…' : '✨ Estilo'}
          </button>
          <button
            onClick={handleExtract}
            disabled={extracting || models.length === 0}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {extracting ? 'Extrayendo…' : '📋 Plantillas'}
          </button>
        </div>
      </div>

      {models.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          Aún no has subido modelos de esta categoría.
        </div>
      ) : (
        <details
          className="rounded-lg border border-slate-200 bg-white"
          open={models.length <= 4}
        >
          <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Ver lista de {models.length} modelo{models.length === 1 ? '' : 's'}
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 px-3">
            {models.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between py-2"
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
        </details>
      )}

      {stylePreview && (
        <details className="mt-4 rounded-lg bg-slate-50 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            Ver guía de estilo extraída
          </summary>
          <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-700">
            {stylePreview}
          </div>
        </details>
      )}

      {templates.length > 0 && (
        <details className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <summary className="cursor-pointer text-xs font-medium text-emerald-800">
            📋 Plantillas extraídas ({templates.length})
          </summary>
          <p className="mt-2 text-[11px] text-emerald-700">
            Estas plantillas se usan al generar documentos. Puedes editarlas
            para ajustar la redacción. Los placeholders
            (&#123;&#123;nombre&#125;&#125;) se reemplazan con datos reales.
          </p>
          <ul className="mt-2 space-y-3">
            {templates.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-emerald-100 bg-white p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-800">
                    {t.act_label}
                  </p>
                  {editingTemplate === t.id ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleSaveTemplate(t)}
                        className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTemplate(null)}
                        className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTemplate(t.id)
                        setEditText(t.template_text)
                      }}
                      className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200"
                    >
                      Editar
                    </button>
                  )}
                </div>
                {t.placeholders.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {t.placeholders.map((ph) => (
                      <span
                        key={ph}
                        className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-mono text-emerald-800"
                      >
                        {`{{${ph}}}`}
                      </span>
                    ))}
                  </div>
                )}
                {editingTemplate === t.id ? (
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={10}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 font-mono text-[11px] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                ) : (
                  <div className="max-h-32 overflow-y-auto whitespace-pre-line text-[11px] leading-relaxed text-slate-700">
                    {t.template_text.slice(0, 500)}
                    {t.template_text.length > 500 && (
                      <span className="text-slate-400">
                        … (pulsa Editar para ver completo)
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

// =========================================================
// Fila para modelos sin categoría (legacy)
// =========================================================

function UncategorizedRow({
  doc,
  onChange,
  setError,
}: {
  doc: ModelDocument
  onChange: () => Promise<void>
  setError: (msg: string | null) => void
}) {
  const handleDelete = async () => {
    if (!confirm(`¿Eliminar "${doc.name}"?`)) return
    try {
      await deleteModelDocument(doc)
      await onChange()
    } catch (err) {
      setError('Error al eliminar: ' + (err as Error).message)
    }
  }
  return (
    <li className="flex items-center justify-between py-2">
      <p className="min-w-0 flex-1 truncate text-sm text-slate-700">{doc.name}</p>
      <button
        onClick={handleDelete}
        className="ml-3 rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
      >
        Eliminar
      </button>
    </li>
  )
}
