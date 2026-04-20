import { useEffect, useState } from 'react'
import { DocumentRow, getDocumentDownloadUrl } from '../lib/api'

interface Props {
  open: boolean
  onClose: () => void
  document: DocumentRow | null
}

export default function FilePreviewModal({ open, onClose, document: doc }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !doc) {
      setUrl(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const signedUrl = await getDocumentDownloadUrl(doc)
        if (alive) setUrl(signedUrl)
      } catch (err) {
        if (alive) setError((err as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [open, doc])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !doc) return null

  const mime = doc.mime_type ?? ''
  const isPdf = mime === 'application/pdf'
  const isImage = mime.startsWith('image/')
  const canPreview = isPdf || isImage

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex flex-col bg-black/80"
      onClick={onClose}
    >
      {/* Barra superior */}
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
          {doc.name}
        </p>
        <div className="flex gap-2">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              Abrir en nueva pestaña
            </a>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Área de preview */}
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <p className="text-sm text-slate-400">Cargando vista previa…</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && !error && url && (
          <>
            {isPdf && (
              <iframe
                src={url}
                title={doc.name}
                className="h-full w-full rounded-lg bg-white"
                style={{ maxWidth: '8.5in' }}
              />
            )}
            {isImage && (
              <img
                src={url}
                alt={doc.name}
                className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
              />
            )}
            {!canPreview && (
              <div className="rounded-lg bg-slate-800 p-8 text-center">
                <p className="text-sm text-slate-300">
                  No se puede previsualizar este tipo de archivo ({mime || 'desconocido'}).
                </p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Descargar
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
