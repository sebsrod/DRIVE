import { useEffect, useState } from 'react'
import Modal from './Modal'
import { Client, Profile, getProfile } from '../lib/api'
import { OFFICE_ADDRESS } from '../lib/officeInfo'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  open: boolean
  onClose: () => void
  text: string
  client: Client
}

export default function DocumentPreviewModal({
  open,
  onClose,
  text,
  client,
}: Props) {
  const { user } = useAuth()
  const [author, setAuthor] = useState<Profile | null>(null)
  const [showFormatted, setShowFormatted] = useState(true)

  useEffect(() => {
    if (!open || !user) return
    let alive = true
    getProfile(user.id)
      .then((p) => {
        if (alive) setAuthor(p)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, user])

  const handlePrint = () => {
    const previousTitle = document.title
    const safeName = (client.name ?? 'Documento').replace(/[^\w\s.-]+/g, '')
    document.title = `Documento - ${safeName}`
    const restore = () => {
      document.title = previousTitle
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
    setTimeout(restore, 2000)
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title="Vista previa del documento">
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowFormatted((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          {showFormatted ? 'Ver texto sin formato' : 'Ver con formato'}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      {showFormatted ? (
        <article className="print-sheet mx-auto bg-white p-6 shadow sm:p-8 print:shadow-none">
          {/* Encabezado del despacho */}
          <header className="border-b border-slate-300 pb-3 text-center">
            <h1 className="text-lg font-bold uppercase text-slate-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              {author?.full_name ?? 'Abogado'}
            </h1>
            {author?.ipsa_number && (
              <p className="text-sm text-slate-700" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                Abogado · I.P.S.A. N° {author.ipsa_number}
              </p>
            )}
            <p className="mt-1 text-[11px] text-slate-600">{OFFICE_ADDRESS}</p>
            {author?.phone && (
              <p className="text-[11px] text-slate-600">Teléfono: {author.phone}</p>
            )}
            {author?.email && (
              <p className="text-[11px] text-slate-600">{author.email}</p>
            )}
          </header>

          {/* Cuerpo del documento */}
          <div
            className="mt-6 whitespace-pre-line text-justify text-sm leading-relaxed text-slate-900"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            {text}
          </div>
        </article>
      ) : (
        <textarea
          value={text}
          readOnly
          rows={24}
          className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      )}
    </Modal>
  )
}
