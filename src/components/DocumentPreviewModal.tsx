import { useEffect, useState } from 'react'
import { Client, Profile, getProfile } from '../lib/api'
import { OFFICE_ADDRESS } from '../lib/officeInfo'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  open: boolean
  onClose: () => void
  text: string
  client: Client
}

// Parseo mínimo de "**negrita**" que a veces devuelve Gemini como
// markdown accidental. Devuelve un arreglo de trozos React.
function renderBold(line: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  const re = /\*\*([^*]+)\*\*/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(line)) !== null) {
    if (m.index > lastIdx) parts.push(line.slice(lastIdx, m.index))
    parts.push(<strong key={key++}>{m[1]}</strong>)
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < line.length) parts.push(line.slice(lastIdx))
  return parts.length > 0 ? parts : [line]
}

// Detecta si una línea parece ser un encabezado (cláusulas, puntos,
// títulos en MAYÚSCULAS al inicio).
function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0) return false
  if (trimmed.length > 120) return false
  // "PRIMERO:", "PUNTO PRIMERO:", "CLÁUSULA X:", etc.
  if (/^(PUNTO|CLÁUSULA|CLAUSULA|ARTÍCULO|ARTICULO|CAPÍTULO|CAPITULO)\s/i.test(
      trimmed,
    ))
    return true
  if (/^[A-ZÁÉÍÓÚÑ\s]+:\s*$/.test(trimmed) && trimmed.length < 80) return true
  return false
}

export default function DocumentPreviewModal({
  open,
  onClose,
  text,
  client,
}: Props) {
  const { user } = useAuth()
  const [author, setAuthor] = useState<Profile | null>(null)

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

  // Bloquear scroll del body mientras el preview está abierto
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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

  // Dividir por párrafos (líneas en blanco separan) y aplicar formato
  const blocks = text.split(/\n{2,}/).map((block) => block.split(/\n/))

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex flex-col bg-slate-700/80 print:static print:block print:bg-white"
      onClick={onClose}
    >
      {/* Barra superior (solo pantalla) */}
      <div className="no-print flex items-center justify-between gap-2 bg-white px-4 py-2 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">
          Vista previa del documento
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePrint()
            }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Imprimir / Guardar PDF
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Área scrolleable donde se centra la hoja */}
      <div
        className="no-print flex-1 overflow-y-auto p-4 print:overflow-visible print:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <article
          className="print-sheet mx-auto bg-white shadow-lg print:shadow-none"
          style={{
            maxWidth: '8.5in',
            padding: '1in',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '12pt',
            lineHeight: '26pt',
            color: '#000',
          }}
        >
          {/* Encabezado del despacho */}
          <header
            style={{
              textAlign: 'center',
              borderBottom: '1px solid #000',
              paddingBottom: '6pt',
              marginBottom: '26pt',
            }}
          >
            <p style={{ fontSize: '12pt', fontWeight: 'bold', margin: 0, textTransform: 'uppercase', lineHeight: '26pt' }}>
              {author?.full_name ?? 'Abogado'}
            </p>
            {author?.ipsa_number && (
              <p style={{ fontSize: '12pt', margin: 0, lineHeight: '26pt' }}>
                Abogado · I.P.S.A. N° {author.ipsa_number}
              </p>
            )}
            <p style={{ fontSize: '12pt', margin: 0, lineHeight: '26pt' }}>
              {OFFICE_ADDRESS}
            </p>
            {author?.phone && (
              <p style={{ fontSize: '12pt', margin: 0, lineHeight: '26pt' }}>
                Teléfono: {author.phone}
                {author?.email ? ` · ${author.email}` : ''}
              </p>
            )}
          </header>

          {/* Cuerpo del documento */}
          <div>
            {blocks.map((lines, i) => {
              const fullLine = lines.join(' ').trim()
              if (!fullLine) return null
              // Si todo el bloque es un único encabezado
              if (lines.length === 1 && isLikelyHeading(lines[0])) {
                return (
                  <p
                    key={i}
                    style={{
                      fontFamily: 'Arial, Helvetica, sans-serif',
                      fontSize: '12pt',
                      lineHeight: '26pt',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      margin: '0',
                    }}
                  >
                    {renderBold(lines[0].trim())}
                  </p>
                )
              }
              return (
                <p
                  key={i}
                  style={{
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontSize: '12pt',
                    lineHeight: '26pt',
                    textAlign: 'justify',
                    margin: '0',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {lines.map((l, j) => (
                    <span key={j}>
                      {j > 0 ? ' ' : ''}
                      {renderBold(l)}
                    </span>
                  ))}
                </p>
              )
            })}
          </div>
        </article>
      </div>
    </div>
  )
}
