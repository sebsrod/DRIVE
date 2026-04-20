import { FormEvent, useEffect, useState } from 'react'
import Modal from './Modal'
import {
  ActTemplate,
  Client,
  Profile,
  generateDocumentWithAI,
  getProfile,
  listActTemplates,
  saveGeneratedDocumentAsFile,
  styleCategoryForDocumentType,
} from '../lib/api'
import { OFFICE_ADDRESS } from '../lib/officeInfo'
import { useAuth } from '../contexts/AuthContext'
import { downloadAsDocx } from '../lib/docxExport'
import DocumentPreviewModal from './DocumentPreviewModal'
import ChatPanel from './ChatPanel'

// Siempre incluir plantillas que cubran estructura general (encabezado,
// convocatoria, quórum, presidencia, cierre, firma).
const ALWAYS_KEYWORDS = [
  'encabezado',
  'header',
  'convocatoria',
  'quorum',
  'quórum',
  'presidencia',
  'presidente',
  'cierre',
  'firma',
  'final',
  'general',
  'introduccion',
  'introducción',
  'autorizacion',
  'autorización',
  'presentante',
]

// Mapeo heurístico: acto seleccionado (label) → palabras clave que debe
// contener act_key o act_label de la plantilla para ser incluida.
function keywordsForAct(actLabel: string): string[] {
  const l = actLabel.toLowerCase()
  if (l.includes('aumento de capital'))
    return ['aumento', 'capital', 'emision', 'emisión', 'suscripcion', 'suscripción']
  if (l.includes('disminución') || l.includes('disminucion'))
    return ['disminucion', 'disminución', 'reduccion', 'reducción', 'capital']
  if (l.includes('dividendos') || l.includes('utilidades'))
    return ['dividendos', 'utilidades', 'distribucion', 'distribución']
  if (l.includes('nombramiento de junta'))
    return ['nombramiento', 'junta', 'directiva', 'jd', 'directores']
  if (l.includes('ratificación de junta') || l.includes('ratificacion de junta'))
    return ['ratificacion', 'ratificación', 'junta', 'directiva']
  if (l.includes('comisario')) return ['comisario', 'comisaria', 'comisaría']
  if (l.includes('reforma')) return ['reforma', 'estatutos', 'clausula', 'cláusula']
  if (l.includes('venta') && l.includes('acciones'))
    return ['venta', 'cesion', 'cesión', 'acciones', 'traspaso']
  if (l.includes('cambio de domicilio')) return ['domicilio', 'sede', 'direccion', 'dirección']
  if (l.includes('objeto social'))
    return ['objeto', 'social', 'modificacion', 'modificación']
  if (l.includes('prórroga') || l.includes('prorroga'))
    return ['prorroga', 'prórroga', 'duracion', 'duración', 'extension', 'extensión']
  if (l.includes('disolución') || l.includes('disolucion'))
    return ['disolucion', 'disolución', 'liquidacion', 'liquidación', 'liquidador']
  if (l.includes('fusión') || l.includes('fusion'))
    return ['fusion', 'fusión', 'absorbente', 'absorbida']
  if (l.includes('transformación') || l.includes('transformacion'))
    return ['transformacion', 'transformación', 'tipo societario']
  if (l.includes('activos')) return ['activos', 'autorizacion', 'venta']
  if (l.includes('balances'))
    return ['balance', 'balances', 'aprobacion', 'aprobación', 'ejercicio']
  return [l]
}

function filterRelevantTemplates(
  templates: ActTemplate[],
  documentType: string,
  params: Record<string, string>,
): ActTemplate[] {
  if (templates.length === 0) return templates
  // Solo filtramos para actas; otros tipos usan todas sus plantillas.
  if (documentType !== 'acta_asamblea') return templates

  let selectedActs: string[] = []
  try {
    selectedActs = params.selectedActs ? JSON.parse(params.selectedActs) : []
  } catch {
    selectedActs = []
  }

  const actKeywords = selectedActs.flatMap(keywordsForAct)
  const allKeywords = [...ALWAYS_KEYWORDS, ...actKeywords]

  const filtered = templates.filter((t) => {
    const haystack = `${t.act_key} ${t.act_label}`.toLowerCase()
    return allKeywords.some((kw) => haystack.includes(kw))
  })

  // Si el filtro es demasiado agresivo y no dejó casi nada, envía todo
  // para no dejar al modelo sin contexto.
  if (filtered.length < 2) return templates
  return filtered
}

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
const ACT_APROBACION_BALANCES = 'Aprobación de balances y estados financieros'
const ACT_AUMENTO_CAPITAL = 'Aumento de capital social'
const ACT_DISMINUCION_CAPITAL = 'Disminución de capital social'
const ACT_DIVIDENDOS = 'Distribución de dividendos / utilidades'
const ACT_VENTA_ACCIONES = 'Venta / cesión de acciones'
const ACT_REFORMA_ESTATUTOS = 'Reforma parcial de estatutos'
const ACT_CAMBIO_DOMICILIO = 'Cambio de domicilio social'
const ACT_CAMBIO_OBJETO = 'Modificación del objeto social'
const ACT_PRORROGA = 'Prórroga de duración de la compañía'
const ACT_DISOLUCION = 'Disolución y liquidación'
const ACT_FUSION = 'Fusión'
const ACT_TRANSFORMACION = 'Transformación de tipo societario'

interface Props {
  open: boolean
  onClose: () => void
  client: Client
  onSaved?: () => void
}

type DocType =
  | 'poder'
  | 'arrendamiento'
  | 'laboral'
  | 'acta_asamblea'
  | 'documento_constitutivo'

const DOC_TYPES: { key: DocType; label: string }[] = [
  { key: 'poder', label: 'Poder' },
  { key: 'arrendamiento', label: 'Contrato de Arrendamiento' },
  { key: 'laboral', label: 'Contrato Laboral' },
  { key: 'acta_asamblea', label: 'Acta de Asamblea' },
  { key: 'documento_constitutivo', label: 'Documento Constitutivo' },
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
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string>('')
  const [savingFile, setSavingFile] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  const draftKey = `draft-${client.id}`

  // Restaurar proyecto guardado al abrir, o limpiar
  useEffect(() => {
    if (!open) return
    const saved = localStorage.getItem(draftKey)
    if (saved) {
      try {
        const draft = JSON.parse(saved) as {
          documentType: DocType
          params: Record<string, string>
          additionalInstructions: string
        }
        setDocumentType(draft.documentType ?? 'poder')
        setParams(draft.params ?? {})
        setAdditionalInstructions(draft.additionalInstructions ?? '')
        setInfo('Proyecto guardado restaurado.')
        setTimeout(() => setInfo(null), 3000)
      } catch {
        setDocumentType('poder')
        setParams({})
        setAdditionalInstructions('')
      }
    } else {
      setDocumentType('poder')
      setParams({})
      setAdditionalInstructions('')
    }
    setResult('')
    setError(null)
  }, [open, draftKey])

  const handleSaveDraft = () => {
    const draft = {
      documentType,
      params,
      additionalInstructions,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(draftKey, JSON.stringify(draft))
    setInfo('Proyecto guardado.')
    setTimeout(() => setInfo(null), 2000)
  }

  const handleClearDraft = () => {
    localStorage.removeItem(draftKey)
    setDocumentType('poder')
    setParams({})
    setAdditionalInstructions('')
    setResult('')
    setInfo('Proyecto limpiado.')
    setTimeout(() => setInfo(null), 2000)
  }

  // Resumen del proyecto para el contexto del chat
  const projectSummary = JSON.stringify(
    {
      tipo: DOC_TYPES.find((d) => d.key === documentType)?.label,
      cliente: client.name,
      tipoCliente: client.client_type,
      parametros: params,
      instrucciones: additionalInstructions,
    },
    null,
    2,
  )

  const setParam = (key: string, value: string) =>
    setParams((p) => ({ ...p, [key]: value }))

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError(null)
    setInfo(null)
    setResult('')
    setGenerating(true)
    try {
      const author: Profile | null = await getProfile(user.id).catch(() => null)

      const styleCategory = styleCategoryForDocumentType(documentType)

      // Cargar plantillas extraídas de la categoría
      let userTemplates: ActTemplate[] = []
      try {
        userTemplates = await listActTemplates(styleCategory)
      } catch {
        // No es crítico: si no hay templates se genera libremente
      }

      // Filtrar plantillas a sólo las relevantes para los actos marcados.
      // Reduce el tamaño del prompt y ayuda a evitar 503 de Gemini.
      userTemplates = filterRelevantTemplates(
        userTemplates,
        documentType,
        params,
      )

      const text = await generateDocumentWithAI({
        documentType,
        params: {
          ...params,
          additionalInstructions: additionalInstructions || undefined,
        },
        client,
        author,
        officeAddress: OFFICE_ADDRESS,
        attachments: [],
        templates: userTemplates,
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

  const handleDownloadDocx = async () => {
    try {
      const author: Profile | null = await getProfile(user!.id).catch(
        () => null,
      )
      const label =
        DOC_TYPES.find((d) => d.key === documentType)?.label ?? documentType
      await downloadAsDocx(result, author, `${label} - ${client.name}`)
    } catch (err) {
      setError('Error al generar Word: ' + (err as Error).message)
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
            <ActaFields params={params} setParam={setParam} client={client} />
          )}
          {documentType === 'documento_constitutivo' && (
            <ConstitutivoFields params={params} setParam={setParam} />
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

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="rounded-lg border border-emerald-600 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
            >
              💾 Guardar proyecto
            </button>
            <button
              type="button"
              onClick={handleClearDraft}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              Limpiar
            </button>
          </div>
          <div className="flex gap-2">
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
              onClick={handleDownloadDocx}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              📄 Descargar Word
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700"
            >
              Ver con formato
            </button>
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
              {savingFile ? 'Guardando…' : 'Guardar como archivo'}
            </button>
          </div>
        </div>
      )}

      {/* Chat interactivo con Gemini */}
      <div className="mt-4">
        <ChatPanel
          systemContext={`Eres un asistente jurídico venezolano experto. El usuario está trabajando en un proyecto de documento legal.

DATOS DEL PROYECTO GUARDADO:
${projectSummary}

DATOS DEL CLIENTE:
Nombre: ${client.name}
Tipo: ${client.client_type === 'juridica' ? 'Persona jurídica' : 'Persona natural'}
${client.cedula_rif ? `RIF/Cédula: ${client.cedula_rif}` : ''}
${client.shareholders?.length ? `Accionistas: ${client.shareholders.map((s) => `${s.name} (${s.percentage}%)`).join(', ')}` : ''}

${result ? 'Ya se generó un borrador del documento. Puedes ayudar a revisarlo, corregirlo o completar datos faltantes.' : 'Aún no se ha generado el documento. Ayuda al usuario a completar los datos necesarios.'}

Responde siempre en español, de forma clara y concisa. Si detectas que falta información clave para el documento, pregunta específicamente por ella. Haz preguntas puntuales y precisas sobre los datos que faltan.`}
          placeholder="Pregunta a la IA sobre datos faltantes o pide ayuda…"
        />
      </div>

      <DocumentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        text={result}
        client={client}
      />
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

interface ActaFieldsProps extends FieldProps {
  client: Client
}

function ActaFields({ params, setParam, client }: ActaFieldsProps) {
  const selectedActs: string[] = params.selectedActs
    ? JSON.parse(params.selectedActs)
    : []

  const jdMembers: Array<{ name: string; cedula: string; position: string }> =
    params.jdMembers
      ? JSON.parse(params.jdMembers)
      : [{ name: '', cedula: '', position: '' }]

  // Accionistas presentes: arreglo de índices del client.shareholders
  const attendingIdxs: number[] = params.attendingIdxs
    ? JSON.parse(params.attendingIdxs)
    : []

  const nombramientoJD = selectedActs.includes(ACT_NOMBRAMIENTO_JD)
  const ratificacionJD = selectedActs.includes(ACT_RATIFICACION_JD)
  const nombramientoComisario = selectedActs.includes(ACT_NOMBRAMIENTO_COMISARIO)
  const aprobacionBalances = selectedActs.includes(ACT_APROBACION_BALANCES)
  const aumentoCapital = selectedActs.includes(ACT_AUMENTO_CAPITAL)
  const disminucionCapital = selectedActs.includes(ACT_DISMINUCION_CAPITAL)
  const dividendos = selectedActs.includes(ACT_DIVIDENDOS)
  const ventaAcciones = selectedActs.includes(ACT_VENTA_ACCIONES)
  const reformaEstatutos = selectedActs.includes(ACT_REFORMA_ESTATUTOS)
  const cambioDomicilio = selectedActs.includes(ACT_CAMBIO_DOMICILIO)
  const cambioObjeto = selectedActs.includes(ACT_CAMBIO_OBJETO)
  const prorroga = selectedActs.includes(ACT_PRORROGA)
  const disolucion = selectedActs.includes(ACT_DISOLUCION)
  const fusion = selectedActs.includes(ACT_FUSION)
  const transformacion = selectedActs.includes(ACT_TRANSFORMACION)

  // Cálculo automático del quórum presente
  const shareholders = client.shareholders ?? []
  const quorumPresent = attendingIdxs.reduce((acc, i) => {
    const s = shareholders[i]
    return acc + (s ? Number(s.percentage) || 0 : 0)
  }, 0)

  // Lista de personas disponibles para presidencia/secretaría
  // (accionistas + representantes legales del cliente)
  const eligiblePeople = [
    ...shareholders.map((s) => ({
      value: `${s.name}|${s.cedula}`,
      label: `${s.name}${s.cedula ? ` (${s.cedula})` : ''}`,
    })),
    ...(client.legal_representatives ?? []).map((r) => ({
      value: `${r.name}|${r.cedula}`,
      label: `${r.position ? `${r.position}: ` : ''}${r.name}${r.cedula ? ` (${r.cedula})` : ''}`,
    })),
  ]

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

  const toggleAttending = (idx: number) => {
    const next = attendingIdxs.includes(idx)
      ? attendingIdxs.filter((i) => i !== idx)
      : [...attendingIdxs, idx]
    setParam('attendingIdxs', JSON.stringify(next))
  }

  // -------- Cláusulas de reforma de estatutos (lista dinámica) --------
  const reformaClauses: Array<{ numero: string; textoNuevo: string }> =
    params.reformaClauses
      ? JSON.parse(params.reformaClauses)
      : [{ numero: '', textoNuevo: '' }]

  const updateReformaClause = (
    i: number,
    patch: Partial<{ numero: string; textoNuevo: string }>,
  ) => {
    const next = reformaClauses.map((c, idx) =>
      idx === i ? { ...c, ...patch } : c,
    )
    setParam('reformaClauses', JSON.stringify(next))
  }
  const addReformaClause = () => {
    setParam(
      'reformaClauses',
      JSON.stringify([...reformaClauses, { numero: '', textoNuevo: '' }]),
    )
  }
  const removeReformaClause = (i: number) => {
    const next =
      reformaClauses.length === 1
        ? [{ numero: '', textoNuevo: '' }]
        : reformaClauses.filter((_, idx) => idx !== i)
    setParam('reformaClauses', JSON.stringify(next))
  }

  // -------- Facultades del liquidador (checkboxes) --------
  const disolucionFacultades: string[] = params.disolucionFacultades
    ? JSON.parse(params.disolucionFacultades)
    : []
  const toggleDisolucionFacultad = (f: string) => {
    const next = disolucionFacultades.includes(f)
      ? disolucionFacultades.filter((x) => x !== f)
      : [...disolucionFacultades, f]
    setParam('disolucionFacultades', JSON.stringify(next))
  }

  // -------- Años de balances aprobados --------
  const balanceYears: number[] = params.balanceYears
    ? JSON.parse(params.balanceYears)
    : []
  const toggleBalanceYear = (y: number) => {
    const next = balanceYears.includes(y)
      ? balanceYears.filter((x) => x !== y)
      : [...balanceYears, y].sort()
    setParam('balanceYears', JSON.stringify(next))
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
    <div className="space-y-4">
      {/* -------- Datos generales de la asamblea -------- */}
      <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <legend className="px-2 text-xs font-semibold text-slate-700">
          Datos generales de la asamblea
        </legend>
        <div className="grid grid-cols-2 gap-2">
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
          <Select
            params={params}
            setParam={setParam}
            label="Tipo de convocatoria"
            name="convocationType"
            options={[
              { value: 'universal', label: 'Universal (sin convocatoria previa)' },
              { value: 'prensa', label: 'Convocada por prensa' },
              { value: 'carta', label: 'Convocada por carta' },
            ]}
          />
          <Field
            params={params}
            setParam={setParam}
            label="Fecha"
            name="meetingDate"
            type="date"
          />
          <Field
            params={params}
            setParam={setParam}
            label="Hora"
            name="meetingTime"
            type="time"
          />
        </div>
        <div className="mt-2">
          <Field
            params={params}
            setParam={setParam}
            label="Lugar"
            name="meetingPlace"
            placeholder={
              client.address
                ? `Por defecto: ${client.address}`
                : 'Dirección donde se celebra la asamblea'
            }
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Si lo dejas vacío, la IA usa el domicilio del cliente.
          </p>
        </div>
      </fieldset>

      {/* -------- Presidencia de la asamblea -------- */}
      <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <legend className="px-2 text-xs font-semibold text-slate-700">
          Presidencia de la asamblea
        </legend>
        <div>
          <Select
            params={params}
            setParam={setParam}
            label="Presidente de la asamblea"
            name="assemblyPresident"
            options={[
              { value: '', label: '— seleccionar —' },
              ...eligiblePeople,
            ]}
          />
        </div>
        {eligiblePeople.length === 0 && (
          <p className="mt-2 text-[11px] text-amber-700">
            Este cliente no tiene accionistas ni representantes registrados.
            Añádelos desde la tarjeta del cliente para poder elegir
            presidencia y secretaría.
          </p>
        )}
      </fieldset>

      {/* -------- Asistentes y quórum -------- */}
      <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <legend className="px-2 text-xs font-semibold text-slate-700">
          Accionistas presentes
        </legend>
        {shareholders.length === 0 ? (
          <p className="text-xs text-slate-500">
            No hay accionistas registrados en el cliente. La IA usará los datos
            que tenga disponibles o los extraerá de los documentos fundamentales.
          </p>
        ) : (
          <>
            <ul className="space-y-1 rounded-lg bg-white p-2">
              {shareholders.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`att-${i}`}
                    checked={attendingIdxs.includes(i)}
                    onChange={() => toggleAttending(i)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label
                    htmlFor={`att-${i}`}
                    className="flex-1 text-xs text-slate-700"
                  >
                    {s.name}
                    {s.cedula ? ` (${s.cedula})` : ''} — {s.percentage}%
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2">
              <span className="text-xs font-medium text-indigo-900">
                Quórum presente
              </span>
              <span className="text-sm font-bold text-indigo-900">
                {quorumPresent.toFixed(2)}%
              </span>
            </div>
          </>
        )}
      </fieldset>

      {/* -------- Votación y lectura -------- */}
      <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <legend className="px-2 text-xs font-semibold text-slate-700">
          Votación y cierre
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <Select
            params={params}
            setParam={setParam}
            label="Tipo de votación"
            name="votingType"
            options={[
              { value: 'unanime', label: 'Unánime' },
              { value: 'mayoria', label: 'Por mayoría' },
              { value: 'disidencia', label: 'Con disidencia' },
            ]}
          />
          <Field
            params={params}
            setParam={setParam}
            label="% de votos a favor (opcional)"
            name="votingPercentage"
            type="number"
            placeholder="100"
          />
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={params.actaReading === 'true'}
            onChange={(e) =>
              setParam('actaReading', e.target.checked ? 'true' : 'false')
            }
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Incluir constancia de lectura y aprobación del acta al cierre
        </label>
      </fieldset>

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

      {/* -------- Aprobación de balances -------- */}
      {aprobacionBalances && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Aprobación de balances y estados financieros
          </legend>
          <p className="mb-2 text-[11px] text-slate-500">
            Selecciona los ejercicios económicos cuyos balances se
            aprueban en esta asamblea.
          </p>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
            {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map(
              (y) => {
                const checked = balanceYears.includes(y)
                return (
                  <label
                    key={y}
                    className={`flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs ${
                      checked
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBalanceYear(y)}
                      className="h-3 w-3"
                    />
                    {y}
                  </label>
                )
              },
            )}
          </div>
          {balanceYears.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-600">
              Años seleccionados:{' '}
              <strong>{balanceYears.sort().join(', ')}</strong>
            </p>
          )}
        </fieldset>
      )}

      {/* -------- Aumento de capital -------- */}
      {aumentoCapital && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Aumento de capital social
          </legend>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field
                params={params}
                setParam={setParam}
                label="Capital anterior"
                name="aumentoPrevCapital"
                placeholder={
                  client.capital_social ? `Actual: ${client.capital_social}` : ''
                }
              />
              <Field
                params={params}
                setParam={setParam}
                label="Capital nuevo"
                name="aumentoNewCapital"
              />
            </div>
            <Select
              params={params}
              setParam={setParam}
              label="Modalidad del aumento"
              name="aumentoModalidad"
              options={[
                { value: 'emision_nuevas_acciones', label: 'Emisión de nuevas acciones' },
                { value: 'anulacion_nuevas_acciones', label: 'Anulación y emisión de nuevas acciones' },
                { value: 'capitalizacion_utilidades', label: 'Capitalización de utilidades' },
                { value: 'aporte_adicional', label: 'Aporte adicional de accionistas' },
                { value: 'otro', label: 'Otra modalidad' },
              ]}
            />
            <Field
              params={params}
              setParam={setParam}
              label="Valor nominal por acción (nuevo)"
              name="aumentoValorNominal"
              placeholder="Ej: Bs. 1,00"
            />
            <Select
              params={params}
              setParam={setParam}
              label="Derecho de preferencia"
              name="aumentoRenunciaPreferencia"
              options={[
                { value: 'renunciado', label: 'Renunciado por los accionistas' },
                { value: 'ejercido', label: 'Ejercido por los accionistas' },
                { value: 'no_aplica', label: 'No aplica / no se pronunció' },
              ]}
            />

            {/* Campos específicos de "Anulación y emisión de nuevas acciones" */}
            {params.aumentoModalidad === 'anulacion_nuevas_acciones' && (
              <div className="rounded-lg border border-indigo-200 bg-white p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase text-indigo-700">
                  Anulación y emisión de nuevas acciones
                </p>
                <p className="mb-2 text-[11px] text-slate-500">
                  Las acciones anteriores se anulan y se emiten nuevas. Indica
                  la cantidad y el valor de las acciones que se emitirán.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    params={params}
                    setParam={setParam}
                    label="N° de acciones nuevas"
                    name="aumentoNuevasAccionesCantidad"
                    type="number"
                    placeholder="Ej: 1000"
                  />
                  <Field
                    params={params}
                    setParam={setParam}
                    label="Valor de cada acción nueva"
                    name="aumentoNuevasAccionesValor"
                    placeholder="Ej: Bs. 0,000001"
                  />
                </div>
              </div>
            )}
          </div>
        </fieldset>
      )}

      {/* -------- Disminución de capital -------- */}
      {disminucionCapital && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Disminución de capital social
          </legend>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field
                params={params}
                setParam={setParam}
                label="Capital anterior"
                name="disminucionPrevCapital"
                placeholder={
                  client.capital_social ? `Actual: ${client.capital_social}` : ''
                }
              />
              <Field
                params={params}
                setParam={setParam}
                label="Capital nuevo"
                name="disminucionNewCapital"
              />
            </div>
            <Select
              params={params}
              setParam={setParam}
              label="Causa de la disminución"
              name="disminucionCausa"
              options={[
                { value: 'devolucion_accionistas', label: 'Devolución a accionistas' },
                { value: 'absorcion_perdidas', label: 'Absorción de pérdidas' },
                { value: 'otro', label: 'Otra causa' },
              ]}
            />
          </div>
        </fieldset>
      )}

      {/* -------- Distribución de dividendos -------- */}
      {dividendos && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Distribución de dividendos
          </legend>
          <div className="space-y-2">
            <Field
              params={params}
              setParam={setParam}
              label="Monto total a distribuir"
              name="dividendosMonto"
              placeholder="Ej: Bs. 500.000,00"
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                params={params}
                setParam={setParam}
                label="Ejercicio económico"
                name="dividendosEjercicio"
                placeholder="Ej: 2025"
              />
              <Field
                params={params}
                setParam={setParam}
                label="Fecha de pago"
                name="dividendosFecha"
                type="date"
              />
            </div>
          </div>
        </fieldset>
      )}

      {/* -------- Venta / cesión de acciones -------- */}
      {ventaAcciones && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Venta / cesión de acciones
          </legend>
          <div className="space-y-2">
            <Select
              params={params}
              setParam={setParam}
              label="Vendedor (accionista cedente)"
              name="ventaVendedor"
              options={[
                { value: '', label: '— seleccionar —' },
                ...shareholders.map((s) => ({
                  value: `${s.name}|${s.cedula}`,
                  label: `${s.name}${s.cedula ? ` (${s.cedula})` : ''} — ${s.percentage}%`,
                })),
              ]}
            />
            <div className="rounded-lg bg-white p-2">
              <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                Datos del comprador (cesionario)
              </p>
              <div className="space-y-2">
                <Field
                  params={params}
                  setParam={setParam}
                  label="Nombre completo"
                  name="ventaCompradorNombre"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    params={params}
                    setParam={setParam}
                    label="Cédula"
                    name="ventaCompradorCedula"
                  />
                  <Field
                    params={params}
                    setParam={setParam}
                    label="Estado civil"
                    name="ventaCompradorEstadoCivil"
                    placeholder="Soltero, casado…"
                  />
                </div>
                <Field
                  params={params}
                  setParam={setParam}
                  label="Domicilio"
                  name="ventaCompradorDomicilio"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field
                params={params}
                setParam={setParam}
                label="N° de acciones transferidas"
                name="ventaNumeroAcciones"
                type="number"
              />
              <Field
                params={params}
                setParam={setParam}
                label="Precio total"
                name="ventaPrecio"
                placeholder="Ej: Bs. 50.000,00"
              />
            </div>
            <Select
              params={params}
              setParam={setParam}
              label="Derecho de preferencia de los demás accionistas"
              name="ventaRenunciaPreferencia"
              options={[
                { value: 'renunciado', label: 'Renunciado' },
                { value: 'ejercido', label: 'Ejercido' },
                { value: 'no_aplica', label: 'No aplica' },
              ]}
            />
          </div>
        </fieldset>
      )}

      {/* -------- Cambio de domicilio social -------- */}
      {cambioDomicilio && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Cambio de domicilio social
          </legend>
          <Field
            params={params}
            setParam={setParam}
            label="Nueva dirección"
            name="cambioDomicilioNuevo"
            placeholder="Nueva dirección completa"
          />
          {client.address && (
            <p className="mt-1 text-[11px] text-slate-400">
              Domicilio actual: {client.address}
            </p>
          )}
        </fieldset>
      )}

      {/* -------- Modificación del objeto social -------- */}
      {cambioObjeto && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Modificación del objeto social
          </legend>
          <TextArea
            params={params}
            setParam={setParam}
            label="Nuevo objeto social"
            name="cambioObjetoNuevo"
            placeholder="Describe brevemente el nuevo objeto; la IA lo redactará en estilo estatutario."
            rows={3}
          />
        </fieldset>
      )}

      {/* -------- Prórroga de duración -------- */}
      {prorroga && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Prórroga de duración de la compañía
          </legend>
          <Field
            params={params}
            setParam={setParam}
            label="Nueva duración"
            name="prorrogaNueva"
            placeholder="Ej: 20 años adicionales, o hasta 2050"
          />
        </fieldset>
      )}

      {/* -------- Disolución y liquidación -------- */}
      {disolucion && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Disolución y liquidación
          </legend>
          <div className="space-y-2">
            <Field
              params={params}
              setParam={setParam}
              label="Nombre del liquidador"
              name="disolucionLiquidadorNombre"
            />
            <Field
              params={params}
              setParam={setParam}
              label="Cédula del liquidador"
              name="disolucionLiquidadorCedula"
            />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Facultades del liquidador
              </label>
              <ul className="space-y-1 rounded-lg bg-white p-2">
                {[
                  'Representación judicial y extrajudicial',
                  'Venta de activos',
                  'Cobro de acreencias',
                  'Pago de pasivos',
                  'Distribución del remanente',
                  'Cancelación de inscripciones fiscales',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`fac-${f}`}
                      checked={disolucionFacultades.includes(f)}
                      onChange={() => toggleDisolucionFacultad(f)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label
                      htmlFor={`fac-${f}`}
                      className="text-xs text-slate-700"
                    >
                      {f}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </fieldset>
      )}

      {/* -------- Fusión -------- */}
      {fusion && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Fusión
          </legend>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field
                params={params}
                setParam={setParam}
                label="Sociedad absorbente"
                name="fusionAbsorbente"
              />
              <Field
                params={params}
                setParam={setParam}
                label="Sociedad absorbida"
                name="fusionAbsorbida"
              />
            </div>
            <Field
              params={params}
              setParam={setParam}
              label="Fecha efectiva"
              name="fusionFechaEfectiva"
              type="date"
            />
          </div>
        </fieldset>
      )}

      {/* -------- Transformación societaria -------- */}
      {transformacion && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Transformación de tipo societario
          </legend>
          <Field
            params={params}
            setParam={setParam}
            label="Nuevo tipo societario"
            name="transformacionTipoNuevo"
            placeholder="Ej: de C.A. a S.R.L."
          />
        </fieldset>
      )}

      {/* -------- Reforma parcial de estatutos -------- */}
      {reformaEstatutos && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-2 text-xs font-semibold text-slate-700">
            Reforma parcial de estatutos
          </legend>
          <p className="mb-2 text-[11px] text-slate-500">
            Indica qué cláusula se reforma y el nuevo texto. La IA lo redactará
            en estilo estatutario.
          </p>
          <ul className="space-y-2">
            {reformaClauses.map((c, i) => (
              <li key={i} className="space-y-1 rounded-lg bg-white p-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                      Cláusula N°
                    </label>
                    <input
                      type="text"
                      value={c.numero}
                      onChange={(e) =>
                        updateReformaClause(i, { numero: e.target.value })
                      }
                      placeholder="Ej: QUINTA, 5, Art. 8"
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeReformaClause(i)}
                    aria-label="Eliminar cláusula"
                    className="mt-5 text-lg text-red-500 hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
                <label className="block text-[10px] uppercase text-slate-500">
                  Texto nuevo de la cláusula
                </label>
                <textarea
                  value={c.textoNuevo}
                  onChange={(e) =>
                    updateReformaClause(i, { textoNuevo: e.target.value })
                  }
                  rows={3}
                  placeholder="Puedes describir el cambio en lenguaje simple; la IA redacta la cláusula final en estilo jurídico."
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addReformaClause}
            className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
          >
            + Agregar cláusula
          </button>
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

      {/* Participación (persona que firma/presenta al Registro Mercantil) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field
          params={params}
          setParam={setParam}
          label="Persona que participa el acta (firma el documento)"
          name="notaryPresenter"
          placeholder="Nombre completo"
        />
        <Field
          params={params}
          setParam={setParam}
          label="Cédula del participante"
          name="notaryPresenterCedula"
          placeholder="V-12345678"
        />
      </div>
    </div>
  )
}

// =========================================================
// DOCUMENTO CONSTITUTIVO
// =========================================================

interface ConstitShareholderRow {
  name: string
  cedula: string
  civilStatus: string
  domicile: string
  percentage: string
}

interface ConstitRepRow {
  name: string
  cedula: string
  position: string
}

const emptyConstitShareholder: ConstitShareholderRow = {
  name: '',
  cedula: '',
  civilStatus: '',
  domicile: '',
  percentage: '',
}
const emptyConstitRep: ConstitRepRow = { name: '', cedula: '', position: '' }

function ConstitutivoFields({ params, setParam }: FieldProps) {
  const shareholders: ConstitShareholderRow[] = params.cShareholders
    ? JSON.parse(params.cShareholders)
    : [{ ...emptyConstitShareholder }]

  const reps: ConstitRepRow[] = params.cReps
    ? JSON.parse(params.cReps)
    : [{ ...emptyConstitRep }]

  const updateSh = (i: number, patch: Partial<ConstitShareholderRow>) => {
    const next = shareholders.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    setParam('cShareholders', JSON.stringify(next))
  }
  const addSh = () =>
    setParam(
      'cShareholders',
      JSON.stringify([...shareholders, { ...emptyConstitShareholder }]),
    )
  const removeSh = (i: number) => {
    const next =
      shareholders.length === 1
        ? [{ ...emptyConstitShareholder }]
        : shareholders.filter((_, idx) => idx !== i)
    setParam('cShareholders', JSON.stringify(next))
  }

  const updateRep = (i: number, patch: Partial<ConstitRepRow>) => {
    const next = reps.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    setParam('cReps', JSON.stringify(next))
  }
  const addRep = () =>
    setParam('cReps', JSON.stringify([...reps, { ...emptyConstitRep }]))
  const removeRep = (i: number) => {
    const next =
      reps.length === 1
        ? [{ ...emptyConstitRep }]
        : reps.filter((_, idx) => idx !== i)
    setParam('cReps', JSON.stringify(next))
  }

  const smallInput =
    'w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="space-y-4">
      <Field
        params={params}
        setParam={setParam}
        label="Denominación social de la compañía"
        name="companyName"
        placeholder="Ej: INVERSIONES EJEMPLO, C.A."
      />

      <TextArea
        params={params}
        setParam={setParam}
        label="Objeto social (breve — la IA lo desarrollará)"
        name="businessPurpose"
        placeholder="Ej: compra, venta, importación y exportación de bienes y servicios"
        rows={3}
      />

      <Field
        params={params}
        setParam={setParam}
        label="Domicilio de la empresa"
        name="companyDomicile"
        placeholder="Ej: Caracas, Municipio Chacao del Estado Miranda"
      />

      <Field
        params={params}
        setParam={setParam}
        label="Registro Mercantil de inscripción"
        name="targetRegistry"
        placeholder="Ej: Registro Mercantil Primero del Distrito Capital"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          params={params}
          setParam={setParam}
          label="Capital suscrito"
          name="capitalSuscrito"
          placeholder="Ej: USD 50.000"
        />
        <Field
          params={params}
          setParam={setParam}
          label="Capital pagado"
          name="capitalPagado"
          placeholder="Ej: USD 50.000"
        />
      </div>

      <Field
        params={params}
        setParam={setParam}
        label="Duración de la compañía"
        name="companyDuration"
        placeholder="Ej: 30 años contados desde su inscripción"
      />

      {/* Accionistas */}
      <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <legend className="px-2 text-xs font-semibold text-slate-700">
          Accionistas
        </legend>
        <ul className="space-y-3">
          {shareholders.map((s, i) => (
            <li key={i} className="space-y-2 rounded-lg bg-white p-2">
              <div className="grid grid-cols-12 items-start gap-2">
                <div className="col-span-6">
                  <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) => updateSh(i, { name: e.target.value })}
                    className={smallInput}
                  />
                </div>
                <div className="col-span-3">
                  <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                    Cédula
                  </label>
                  <input
                    type="text"
                    value={s.cedula}
                    onChange={(e) => updateSh(i, { cedula: e.target.value })}
                    className={smallInput}
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                    %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={s.percentage}
                    onChange={(e) => updateSh(i, { percentage: e.target.value })}
                    className={`${smallInput} text-right`}
                  />
                </div>
                <div className="col-span-1 flex items-end justify-end pb-1">
                  <button
                    type="button"
                    onClick={() => removeSh(i)}
                    aria-label="Eliminar accionista"
                    className="text-lg text-red-500 hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                    Estado civil
                  </label>
                  <input
                    type="text"
                    value={s.civilStatus}
                    onChange={(e) => updateSh(i, { civilStatus: e.target.value })}
                    className={smallInput}
                    placeholder="Ej: soltero, casado"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                    Domicilio
                  </label>
                  <input
                    type="text"
                    value={s.domicile}
                    onChange={(e) => updateSh(i, { domicile: e.target.value })}
                    className={smallInput}
                    placeholder="Ej: Caracas"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addSh}
          className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
        >
          + Agregar accionista
        </button>
      </fieldset>

      {/* Administración */}
      <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <legend className="px-2 text-xs font-semibold text-slate-700">
          Administración de la sociedad
        </legend>
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Tipo de representación
          </label>
          <select
            value={params.representationType ?? 'separada'}
            onChange={(e) => setParam('representationType', e.target.value)}
            className={inputClass}
          >
            <option value="separada">Separada (cada uno actúa individualmente)</option>
            <option value="conjunta">Conjunta (deben actuar juntos)</option>
          </select>
        </div>
        <ul className="space-y-2">
          {reps.map((r, i) => (
            <li key={i} className="space-y-2 rounded-lg bg-white p-2">
              <div className="grid grid-cols-12 items-start gap-2">
                <div className="col-span-11">
                  <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                    Cargo
                  </label>
                  <input
                    type="text"
                    value={r.position}
                    onChange={(e) => updateRep(i, { position: e.target.value })}
                    className={smallInput}
                    placeholder="Presidente, Vicepresidente, Director…"
                  />
                </div>
                <div className="col-span-1 flex items-end justify-end pb-1">
                  <button
                    type="button"
                    onClick={() => removeRep(i)}
                    aria-label="Eliminar representante"
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
                    value={r.name}
                    onChange={(e) => updateRep(i, { name: e.target.value })}
                    className={smallInput}
                  />
                </div>
                <div className="col-span-5">
                  <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                    Cédula
                  </label>
                  <input
                    type="text"
                    value={r.cedula}
                    onChange={(e) => updateRep(i, { cedula: e.target.value })}
                    className={smallInput}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addRep}
          className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
        >
          + Agregar representante
        </button>
      </fieldset>

      {/* Comisario */}
      <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <legend className="px-2 text-xs font-semibold text-slate-700">
          Comisario
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
            placeholder="Ej: Colegio de Contadores Públicos del Distrito Capital"
          />
          <Field
            params={params}
            setParam={setParam}
            label="N° de carnet"
            name="comisarioCarnet"
          />
        </div>
      </fieldset>

      {/* Persona que presenta al Registro Mercantil */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field
          params={params}
          setParam={setParam}
          label="Persona autorizada para presentar al Registro Mercantil"
          name="notaryPresenter"
          placeholder="Nombre completo"
        />
        <Field
          params={params}
          setParam={setParam}
          label="Cédula del presentante"
          name="notaryPresenterCedula"
          placeholder="V-12345678"
        />
      </div>
    </div>
  )
}
