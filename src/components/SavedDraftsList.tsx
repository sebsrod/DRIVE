import { useEffect, useState } from 'react'

interface DraftSummary {
  key: string
  clientId: string
  documentType: string
  params: Record<string, string>
  additionalInstructions: string
  savedAt: string
}

interface Props {
  clientId: string
  onOpen: (draft: { documentType: string; params: Record<string, string>; additionalInstructions: string }) => void
}

const DOC_TYPE_LABELS: Record<string, string> = {
  poder: 'Poder',
  arrendamiento: 'Contrato de Arrendamiento',
  laboral: 'Contrato Laboral',
  acta_asamblea: 'Acta de Asamblea',
  documento_constitutivo: 'Documento Constitutivo',
}

export default function SavedDraftsList({ clientId, onOpen }: Props) {
  const [drafts, setDrafts] = useState<DraftSummary[]>([])

  const scanDrafts = () => {
    const found: DraftSummary[] = []
    const prefix = `draft-${clientId}`
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const data = JSON.parse(raw)
        found.push({
          key,
          clientId,
          documentType: data.documentType ?? 'desconocido',
          params: data.params ?? {},
          additionalInstructions: data.additionalInstructions ?? '',
          savedAt: data.savedAt ?? '',
        })
      } catch {
        // ignore
      }
    }
    setDrafts(found)
  }

  useEffect(() => {
    scanDrafts()
  }, [clientId])

  const handleDelete = (key: string) => {
    if (!confirm('¿Eliminar este proyecto guardado?')) return
    localStorage.removeItem(key)
    scanDrafts()
  }

  if (drafts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
        No hay proyectos guardados para este cliente. Abre "Generar documento"
        y pulsa "💾 Guardar proyecto" para guardar un borrador.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {drafts.map((d) => {
        const label = DOC_TYPE_LABELS[d.documentType] ?? d.documentType
        const actCount = d.params.selectedActs
          ? JSON.parse(d.params.selectedActs).length
          : 0
        return (
          <li
            key={d.key}
            className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-800">{label}</p>
              <p className="text-xs text-slate-500">
                {actCount > 0 ? `${actCount} acto(s) seleccionado(s)` : ''}
                {d.savedAt ? ` · ${new Date(d.savedAt).toLocaleDateString()}` : ''}
              </p>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button
                type="button"
                onClick={() =>
                  onOpen({
                    documentType: d.documentType,
                    params: d.params,
                    additionalInstructions: d.additionalInstructions,
                  })
                }
                className="rounded-md bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Abrir
              </button>
              <button
                type="button"
                onClick={() => handleDelete(d.key)}
                className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Eliminar
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
