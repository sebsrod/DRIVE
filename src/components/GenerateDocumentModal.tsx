import { FormEvent, useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import {
  Client,
  DocumentRow,
  GeneratedAttachment,
  Profile,
  downloadDocumentAsBase64,
  generateDocumentWithAI,
  getProfile,
  listFundamentalDocuments,
  saveGeneratedDocumentAsFile,
} from '../lib/api'
import { OFFICE_ADDRESS } from '../lib/officeInfo'
import { useAuth } from '../contexts/AuthContext'

const COMMON_ASSEMBLY_ACTS = [
  'Aprobación de balances y estados financieros',
  'Distribución de dividendos / utilidades',
  'Aumento de capital social',
  'Disminución de capital social',
  'Nombramiento de Junta Directiva',
  'Ratificación de Junta Directiva',
  'Nombramiento de Comisario',
  'Reforma parcial de estatutos',
  'Venta / cesión de acciones',
  'Cambio de domicilio social',
  'Modificación del objeto social',
  'Prórroga de duración de la compañía',
  'Disolución y liquidación',
  'Fusión',
  'Transformación de tipo societario',
  'Autorización para venta de activos',
]

const ACT_NOMBRAMIENTO_JD = 'Nombramiento de Junta Directiva'
const ACT_RATIFICACION_JD = 'Ratificación de Junta Directiva'
const ACT_NOMBRAMIENTO_COMISARIO = 'Nombramiento de Comisario'

interface Props {
  open: boolean
  onClose: () => void
  client: Client
  onSaved?: () => void
}

type DocType = 'poder' | 'arrendamiento' | 'laboral' | 'acta_asamblea'

const DOC_TYPES: { key: DocType; label: string }[] = [
  { key: 'poder', label: 'Poder' },
  { key: 'arrendamiento', label: 'Contrato de Arrendamiento' },
  { key: 'laboral', label: 'Contrato Laboral' },
  { key: 'acta_asamblea', label: 'Acta de Asamblea' },
]

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

export default function GenerateDocumentModal({
  open,
  onClose,
  client,
  onSaved,
}: Props) {
  const { user } = useAuth()

  const [documentType, setDocumentType] = useState<DocType>('poder')
  const [params, setParams] = useState<Record<string, string>>({})
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const [fundamentalDocs, setFundamentalDocs] = useState<DocumentRow[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string>('')
  const [savingFile, setSavingFile] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  // Reset al abrir
  useEffect(() => {
    if (!open) return
    setDocumentType('poder')
    setParams({})
    setAdditionalInstructions('')
    setSelectedDocIds(new Set())
    setResult('')
    setError(null)
    setInfo(null)
  }, [open])

  // Cargar documentos fundamentales al abrir
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const docs = await listFundamentalDocuments(client.id)
        if (!alive) return
        setFundamentalDocs(docs)
        // Por defecto marcar todos
        setSelectedDocIds(new Set(docs.map((d) => d.id)))
      } catch (err) {
        if (alive) setError((err as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [open, client.id])

  const setParam = (key: string, value: string) =>
    setParams((p) => ({ ...p, [key]: value }))

  const toggleDoc = (id: string) =>
    setSelectedDocIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectedDocs = useMemo(
    () => fundamentalDocs.filter((d) => selectedDocIds.has(d.id)),
    [fundamentalDocs, selectedDocIds],
  )

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError(null)
    setInfo(null)
    setResult('')
    setGenerating(true)
    try {
      // Descargar y convertir los documentos seleccionados a base64
      const attachments: GeneratedAttachment[] = []
      for (const doc of selectedDocs) {
        try {
          const att = await downloadDocumentAsBase64(doc)
          attachments.push(att)
        } catch (err) {
          throw new Error(
            `No se pudo descargar "${doc.name}": ${(err as Error).message}`,
          )
        }
      }

      // Perfil del autor (para los datos del abogado)
      const author: Profile | null = await getProfile(user.id).catch(() => null)

      const text = await generateDocumentWithAI({
        documentType,
        params: {
          ...params,
          additionalInstructions: additionalInstructions || undefined,
        },
        client,
        author,
        officeAddress: OFFICE_ADDRESS,
        attachments,
        writingStyle: author?.writing_style ?? null,
      })
      setResult(text)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result)
      setInfo('Texto copiado al portapapeles.')
      setTimeout(() => setInfo(null), 2000)
    } catch {
      setError('No se pudo copiar al portapapeles.')
    }
  }

  const handleDownload = () => {
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${documentType}_${client.name.replace(/[^\w]+/g, '_')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleSaveAsFile = async () => {
    if (!user) return
    try {
      setSavingFile(true)
      const label =
        DOC_TYPES.find((d) => d.key === documentType)?.label ?? documentType
      await saveGeneratedDocumentAsFile(
        result,
        `${label} - ${client.name}`,
        client,
        user.id,
      )
      setInfo('Guardado como archivo del cliente.')
      onSaved?.()
      setTimeout(() => setInfo(null), 2500)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingFile(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Generar documento">
      <form onSubmit={handleGenerate} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Tipo de documento
          </label>
          <select
            value={documentType}
            onChange={(e) => {
              setDocumentType(e.target.value as DocType)
              setParams({})
            }}
            className={inputClass}
          >
            {DOC_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Campos específicos por tipo */}
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-700">
            Parámetros del documento
          </legend>
          {documentType === 'poder' && <PoderFields params={params} setParam={setParam} />}
          {documentType === 'arrendamiento' && (
            <ArrendamientoFields params={params} setParam={setParam} />
          )}
          {documentType === 'laboral' && <LaboralFields params={params} setParam={setParam} />}
          {documentType === 'acta_asamblea' && (
            <ActaFields params={params} setParam={setParam} />
          )}
        </fieldset>

        {/* Documentos fundamentales a incluir como contexto */}
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-700">
            Documentos fundamentales del cliente
          </legend>
          <p className="mb-3 text-xs text-slate-500">
            La IA leerá el contenido (o hará OCR en las imágenes) para usar los
            datos exactos al redactar el documento.
          </p>
          {loading ? (
            <p className="text-sm text-slate-500">Cargando…</p>
          ) : fundamentalDocs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">
              No has subido documentos fundamentales a este cliente. Ciérralo,
              sube el Documento Constitutivo y/o las cédulas en la sección
              "Documentos fundamentales" y vuelve a intentarlo.
            </p>
          ) : (
            <ul className="space-y-1">
              {fundamentalDocs.map((doc) => (
                <li key={doc.id} className="flex items-center gap-2 rounded bg-white p-2">
                  <input
                    type="checkbox"
                    id={`fdoc-${doc.id}`}
                    checked={selectedDocIds.has(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label
                    htmlFor={`fdoc-${doc.id}`}
                    className="min-w-0 flex-1 truncate text-sm text-slate-700"
                  >
                    {doc.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Instrucciones adicionales (opcional)
          </label>
          <textarea
            rows={3}
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            className={inputClass}
            placeholder="Ej: incluir cláusula de arbitraje, usar denominación social específica…"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cerrar
          </button>
          <button
            type="submit"
            disabled={generating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? 'Generando con IA…' : 'Generar documento'}
          </button>
        </div>
      </form>

      {/* Resultado */}
      {result && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-700">
            Documento generado (editable)
          </h4>
          <textarea
            value={result}
            onChange={(e) => setResult(e.target.value)}
            rows={16}
            className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              Copiar
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              Descargar .txt
            </button>
            <button
              type="button"
              onClick={handleSaveAsFile}
              disabled={savingFile}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingFile ? 'Guardando…' : 'Guardar como archivo del cliente'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// =========================================================
// Campos específicos por tipo de documento
// =========================================================

interface FieldProps {
  params: Record<string, string>
  setParam: (key: string, value: string) => void
}

function Field({
  label,
  name,
  params,
  setParam,
  type = 'text',
  placeholder,
}: FieldProps & {
  label: string
  name: string
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        type={type}
        value={params[name] ?? ''}
        onChange={(e) => setParam(name, e.target.value)}
        className={inputClass}
        placeholder={placeholder}
      />
    </div>
  )
}

function TextArea({
  label,
  name,
  params,
  setParam,
  placeholder,
  rows = 2,
}: FieldProps & { label: string; name: string; placeholder?: string; rows?: number }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <textarea
        value={params[name] ?? ''}
        onChange={(e) => setParam(name, e.target.value)}
        className={inputClass}
        rows={rows}
        placeholder={placeholder}
      />
    </div>
  )
}

function Select({
  label,
  name,
  params,
  setParam,
  options,
}: FieldProps & {
  label: string
  name: string
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <select
        value={params[name] ?? options[0]?.value ?? ''}
        onChange={(e) => setParam(name, e.target.value)}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function PoderFields(props: FieldProps) {
  return (
    <div className="space-y-3">
      <Select
        {...props}
        label="Tipo de poder"
        name="powerType"
        options={[
          { value: 'general', label: 'General' },
          { value: 'especial', label: 'Especial' },
        ]}
      />
      <Field {...props} label="Nombre del apoderado" name="granteeName" />
      <Field {...props} label="Cédula del apoderado" name="granteeCedula" />
      <TextArea
        {...props}
        label="Facultades (si es especial)"
        name="powers"
        placeholder="Ej: Representar en juicio, cobrar sumas, firmar documentos…"
        rows={3}
      />
    </div>
  )
}

function ArrendamientoFields(props: FieldProps) {
  return (
    <div className="space-y-3">
      <Select
        {...props}
        label="Rol del cliente"
        name="clientRole"
        options={[
          { value: 'arrendador', label: 'Arrendador' },
          { value: 'arrendatario', label: 'Arrendatario' },
        ]}
      />
      <Field {...props} label="Nombre de la contraparte" name="counterpartyName" />
      <Field {...props} label="Cédula/RIF de la contraparte" name="counterpartyCedula" />
      <TextArea
        {...props}
        label="Descripción del inmueble"
        name="propertyDescription"
        placeholder="Dirección, linderos, superficie, características…"
        rows={3}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field {...props} label="Duración" name="duration" placeholder="Ej: 1 año" />
        <Field
          {...props}
          label="Canon mensual"
          name="monthlyRent"
          type="number"
        />
      </div>
      <Field {...props} label="Moneda" name="currency" placeholder="USD" />
      <TextArea
        {...props}
        label="Condiciones adicionales (opcional)"
        name="conditions"
        rows={2}
      />
    </div>
  )
}

function LaboralFields(props: FieldProps) {
  return (
    <div className="space-y-3">
      <Select
        {...props}
        label="Rol del cliente"
        name="clientRole"
        options={[
          { value: 'patrono', label: 'Patrono' },
          { value: 'trabajador', label: 'Trabajador' },
        ]}
      />
      <Field {...props} label="Nombre del trabajador" name="workerName" />
      <Field {...props} label="Cédula del trabajador" name="workerCedula" />
      <Field {...props} label="Cargo" name="position" />
      <div className="grid grid-cols-2 gap-2">
        <Field {...props} label="Salario" name="salary" type="number" />
        <Field {...props} label="Moneda" name="currency" placeholder="USD" />
      </div>
      <Select
        {...props}
        label="Tipo de contrato"
        name="contractType"
        options={[
          { value: 'tiempo indeterminado', label: 'Tiempo indeterminado' },
          { value: 'tiempo determinado', label: 'Tiempo determinado' },
          { value: 'por obra', label: 'Por obra determinada' },
        ]}
      />
      <Field {...props} label="Fecha de inicio" name="startDate" type="date" />
      <Field
        {...props}
        label="Jornada (opcional)"
        name="workingHours"
        placeholder="Ej: Lunes a viernes, 8 a.m. a 5 p.m."
      />
    </div>
  )
}

function ActaFields({ params, setParam }: FieldProps) {
  const selectedActs: string[] = params.selectedActs
    ? JSON.parse(params.selectedActs)
    : []

  const jdMembers: Array<{ name: string; cedula: string; position: string }> =
    params.jdMembers
      ? JSON.parse(params.jdMembers)
      : [{ name: '', cedula: '', position: '' }]

  const nombramientoJD = selectedActs.includes(ACT_NOMBRAMIENTO_JD)
  const ratificacionJD = selectedActs.includes(ACT_RATIFICACION_JD)
  const nombramientoComisario = selectedActs.includes(ACT_NOMBRAMIENTO_COMISARIO)

  const toggleAct = (act: string) => {
    const next = selectedActs.includes(act)
      ? selectedActs.filter((a) => a !== act)
      : [...selectedActs, act]
    setParam('selectedActs', JSON.stringify(next))
    // Auto-generar el orden del día a partir de los actos seleccionados
    if (next.length > 0) {
      setParam(
        'agenda',
        next.map((a, i) => `${i + 1}. ${a}`).join('\n'),
      )
    }
  }

  const updateJdMember = (
    i: number,
    patch: Partial<{ name: string; cedula: string; position: string }>,
  ) => {
    const next = jdMembers.map((m, idx) => (idx === i ? { ...m, ...patch } : m))
    setParam('jdMembers', JSON.stringify(next))
  }

  const addJdMember = () => {
    const next = [...jdMembers, { name: '', cedula: '', position: '' }]
    setParam('jdMembers', JSON.stringify(next))
  }

  const removeJdMember = (i: number) => {
    const next =
      jdMembers.length === 1
        ? [{ name: '', cedula: '', position: '' }]
        : jdMembers.filter((_, idx) => idx !== i)
    setParam('jdMembers', JSON.stringify(next))
  }

  return (
    <div className="space-y-3">
      <Select
        params={params}
        setParam={setParam}
        label="Tipo de asamblea"
        name="meetingType"
        options={[
          { value: 'ordinaria', label: 'Ordinaria' },
          { value: 'extraordinaria', label: 'Extraordinaria' },
        ]}
      />
      <Field
        params={params}
        setParam={setParam}
        label="Fecha de la asamblea"
        name="meetingDate"
        type="date"
      />

      {/* Actos predeterminados */}
      <div>
        <label className="mb-2 block text-xs font-medium text-slate-700">
          Actos a tratar (selecciona uno o varios)
        </label>
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          {COMMON_ASSEMBLY_ACTS.map((act) => {
            const checked = selectedActs.includes(act)
            return (
              <li key={act} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`act-${act}`}
                  checked={checked}
                  onChange={() => toggleAct(act)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor={`act-${act}`}
                  className="text-xs text-slate-700"
                >
                  {act}
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Nuevos miembros de la Junta Directiva */}
      {nombramientoJD && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Nuevos miembros de la Junta Directiva
          </legend>
          <ul className="space-y-2">
            {jdMembers.map((m, i) => (
              <li key={i} className="space-y-2 rounded-lg bg-white p-2">
                <div className="grid grid-cols-12 items-start gap-2">
                  <div className="col-span-11">
                    <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                      Cargo
                    </label>
                    <input
                      type="text"
                      value={m.position}
                      onChange={(e) =>
                        updateJdMember(i, { position: e.target.value })
                      }
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Presidente, Vicepresidente, Director…"
                    />
                  </div>
                  <div className="col-span-1 flex items-end justify-end pb-1">
                    <button
                      type="button"
                      onClick={() => removeJdMember(i)}
                      aria-label="Eliminar miembro"
                      className="text-lg text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-12 items-start gap-2">
                  <div className="col-span-7">
                    <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) => updateJdMember(i, { name: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-5">
                    <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                      Cédula
                    </label>
                    <input
                      type="text"
                      value={m.cedula}
                      onChange={(e) =>
                        updateJdMember(i, { cedula: e.target.value })
                      }
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addJdMember}
            className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
          >
            + Agregar miembro
          </button>
          <div className="mt-2">
            <Field
              params={params}
              setParam={setParam}
              label="Duración del nuevo período"
              name="newBoardDuration"
              placeholder="Ej: 5 años desde la inscripción en el Registro Mercantil"
            />
          </div>
        </fieldset>
      )}

      {/* Ratificación de JD: usa los datos del cliente */}
      {ratificacionJD && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
          <strong>Ratificación:</strong> se utilizarán los mismos miembros,
          cargos y duración registrados en los datos de la empresa. Si necesitas
          cambiarlos, edita el cliente desde su tarjeta.
        </div>
      )}

      {/* Comisario */}
      {nombramientoComisario && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Datos del Comisario
          </legend>
          <div className="space-y-2">
            <Field
              params={params}
              setParam={setParam}
              label="Nombre"
              name="comisarioName"
            />
            <Field
              params={params}
              setParam={setParam}
              label="Cédula"
              name="comisarioCedula"
            />
            <Field
              params={params}
              setParam={setParam}
              label="Colegio en el que está inscrito"
              name="comisarioColegio"
              placeholder="Ej: Colegio de Contadores Públicos del Estado Miranda"
            />
            <Field
              params={params}
              setParam={setParam}
              label="N° de carnet"
              name="comisarioCarnet"
            />
          </div>
        </fieldset>
      )}

      <TextArea
        params={params}
        setParam={setParam}
        label="Orden del día"
        name="agenda"
        placeholder="Se llena automáticamente con los actos seleccionados. Puedes editarlo."
        rows={3}
      />
      <TextArea
        params={params}
        setParam={setParam}
        label="Decisiones adoptadas"
        name="resolutions"
        placeholder="Resumen de cada punto aprobado por la asamblea"
        rows={4}
      />
      <TextArea
        params={params}
        setParam={setParam}
        label="Asistentes (opcional)"
        name="attendees"
        placeholder="Si se deja en blanco, la IA los extraerá de los datos de la empresa"
        rows={2}
      />
    </div>
  )
}
