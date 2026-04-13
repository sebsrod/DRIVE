import { FormEvent, useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { HonorariosItem, ProposalExpense, ProposalSubService } from '../lib/api'
import { AdditiveSubService, SERVICES, findService } from '../lib/services'

export interface ProposalFormValues {
  serviceType: string
  subService: string | null
  subServices: ProposalSubService[]
  description: string
  hours: number
  hourlyRate: number
  currency: string
  notes: string
  expenses: ProposalExpense[]
  honorariosItems: HonorariosItem[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (values: ProposalFormValues) => Promise<void>
}

interface ExpenseRow {
  label: string
  amount: string
  checked: boolean
}

interface AdditiveRow {
  key: string
  label: string
  description: string
  checked: boolean
  hours: string
  expense: string
}

const DEFAULT_EXPENSES: ExpenseRow[] = [
  { label: 'Aranceles de registro', amount: '250', checked: false },
  { label: 'Timbre fiscal', amount: '20', checked: false },
  { label: 'Publicación mercantil', amount: '20', checked: false },
  { label: 'Copias certificadas', amount: '20', checked: false },
  { label: 'Habilitación', amount: '', checked: false },
]

function buildAdditiveRows(serviceKey: string): AdditiveRow[] {
  const svc = findService(serviceKey)
  if (!svc?.additiveSubServices) return []
  return svc.additiveSubServices.map((sub: AdditiveSubService) => ({
    key: sub.key,
    label: sub.label,
    description: sub.description,
    checked: false,
    hours: '',
    expense: sub.suggestedExpense != null ? String(sub.suggestedExpense) : '',
  }))
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export default function ProposalFormModal({ open, onClose, onSubmit }: Props) {
  const [serviceType, setServiceType] = useState<string>(SERVICES[0].key)
  const [subServiceKeys, setSubServiceKeys] = useState<string[]>([])
  const [description, setDescription] = useState<string>('')
  const [hours, setHours] = useState<string>('')
  const [hourlyRate, setHourlyRate] = useState<string>('')
  const [currency, setCurrency] = useState<string>('USD')
  const [notes, setNotes] = useState<string>('')
  const [expenses, setExpenses] = useState<ExpenseRow[]>(DEFAULT_EXPENSES)
  const [additiveRows, setAdditiveRows] = useState<AdditiveRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const service = findService(serviceType)
  const hasSubServices = (service?.subServices?.length ?? 0) > 0
  const hasAdditives = (service?.additiveSubServices?.length ?? 0) > 0

  // Reset al abrir
  useEffect(() => {
    if (!open) return
    const first = SERVICES[0]
    setServiceType(first.key)
    // Si el servicio tiene actos, dejar todos sin marcar; el usuario elige.
    setSubServiceKeys([])
    setDescription(first.description ?? '')
    setHours('')
    setHourlyRate('')
    setCurrency('USD')
    setNotes('')
    setExpenses(DEFAULT_EXPENSES.map((e) => ({ ...e })))
    setAdditiveRows(buildAdditiveRows(first.key))
    setError(null)
  }, [open])

  const handleServiceChange = (key: string) => {
    setServiceType(key)
    const svc = findService(key)
    setSubServiceKeys([])
    setDescription(svc?.description ?? '')
    setAdditiveRows(buildAdditiveRows(key))
  }

  const toggleSubService = (key: string) => {
    setSubServiceKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    )
  }

  const updateExpense = (index: number, patch: Partial<ExpenseRow>) => {
    setExpenses((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  const updateAdditive = (index: number, patch: Partial<AdditiveRow>) => {
    setAdditiveRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  const honorariosPrincipal = useMemo(() => {
    const h = parseFloat(hours)
    const r = parseFloat(hourlyRate)
    if (isNaN(h) || isNaN(r)) return 0
    return +(h * r).toFixed(2)
  }, [hours, hourlyRate])

  const honorariosComplementarios = useMemo(() => {
    const r = parseFloat(hourlyRate)
    if (isNaN(r)) return 0
    return +additiveRows
      .filter((a) => a.checked)
      .reduce((acc, a) => {
        const h = parseFloat(a.hours)
        if (isNaN(h)) return acc
        return acc + h * r
      }, 0)
      .toFixed(2)
  }, [additiveRows, hourlyRate])

  const honorariosTotal = useMemo(
    () => +(honorariosPrincipal + honorariosComplementarios).toFixed(2),
    [honorariosPrincipal, honorariosComplementarios],
  )

  const gastosPredeterminados = useMemo(() => {
    return +expenses
      .filter((e) => e.checked)
      .reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0)
      .toFixed(2)
  }, [expenses])

  const gastosComplementarios = useMemo(() => {
    return +additiveRows
      .filter((a) => a.checked)
      .reduce((acc, a) => acc + (parseFloat(a.expense) || 0), 0)
      .toFixed(2)
  }, [additiveRows])

  const gastosTotal = useMemo(
    () => +(gastosPredeterminados + gastosComplementarios).toFixed(2),
    [gastosPredeterminados, gastosComplementarios],
  )

  const grandTotal = useMemo(
    () => +(honorariosTotal + gastosTotal).toFixed(2),
    [honorariosTotal, gastosTotal],
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const h = parseFloat(hours)
    const r = parseFloat(hourlyRate)
    if (isNaN(h) || h <= 0) {
      setError('Indica un número de horas válido para los honorarios principales.')
      return
    }
    if (isNaN(r) || r < 0) {
      setError('Indica un costo por hora válido para los honorarios principales.')
      return
    }
    if (!description.trim()) {
      setError('La descripción no puede estar vacía.')
      return
    }

    // Validar y construir items complementarios.
    // Todos los items complementarios usan el mismo costo por hora que los
    // honorarios principales, así el usuario solo lo escribe una vez.
    const honorariosItems: HonorariosItem[] = []
    const additiveExpenses: ProposalExpense[] = []
    for (const row of additiveRows) {
      if (!row.checked) continue
      const ah = parseFloat(row.hours)
      if (isNaN(ah) || ah <= 0) {
        setError(`Indica las horas para "${row.label}".`)
        return
      }
      const itemTotal = +(ah * r).toFixed(2)
      honorariosItems.push({
        key: row.key,
        label: row.label,
        description: row.description,
        hours: ah,
        rate: r,
        total: itemTotal,
      })
      const expAmt = parseFloat(row.expense)
      if (!isNaN(expAmt) && expAmt > 0) {
        additiveExpenses.push({
          label: `${row.label} (gastos)`,
          amount: +expAmt.toFixed(2),
        })
      }
    }

    // Validar gastos predeterminados marcados
    const selectedExpenses: ProposalExpense[] = []
    for (const row of expenses) {
      if (!row.checked) continue
      const amt = parseFloat(row.amount)
      if (isNaN(amt) || amt < 0) {
        setError(`Indica un monto válido para "${row.label}".`)
        return
      }
      selectedExpenses.push({ label: row.label, amount: +amt.toFixed(2) })
    }

    // Construir array de sub-servicios seleccionados con su descripción
    const subServicesArr: ProposalSubService[] = subServiceKeys
      .map((key) => {
        const sub = service?.subServices?.find((s) => s.key === key)
        if (!sub) return null
        return { key: sub.key, label: sub.label, description: sub.description }
      })
      .filter((x): x is ProposalSubService => x !== null)

    try {
      setSubmitting(true)
      setError(null)
      await onSubmit({
        serviceType,
        // Mantener la columna legacy con el primer key (o null si ninguno)
        subService: hasSubServices ? subServicesArr[0]?.key ?? null : null,
        subServices: subServicesArr,
        description: description.trim(),
        hours: h,
        hourlyRate: r,
        currency: currency.trim() || 'USD',
        notes: notes.trim(),
        expenses: [...selectedExpenses, ...additiveExpenses],
        honorariosItems,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
  const smallInputClass =
    'w-full rounded-md border border-slate-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400'

  const cur = currency || 'USD'

  return (
    <Modal open={open} onClose={onClose} title="Generar Propuesta de Servicios">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Tipo de servicio
          </label>
          <select
            value={serviceType}
            onChange={(e) => handleServiceChange(e.target.value)}
            className={inputClass}
          >
            {SERVICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {hasSubServices && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Tipos de acto
            </label>
            <p className="mb-2 text-xs text-slate-500">
              Selecciona uno o varios actos a tramitar. Todos los marcados se
              incluirán en la propuesta con su descripción.
            </p>
            <ul className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {service?.subServices?.map((s) => {
                const checked = subServiceKeys.includes(s.key)
                return (
                  <li key={s.key} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id={`subservice-${s.key}`}
                      checked={checked}
                      onChange={() => toggleSubService(s.key)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label
                      htmlFor={`subservice-${s.key}`}
                      className="text-sm text-slate-800"
                    >
                      {s.label}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Descripción del servicio
          </label>
          <textarea
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            placeholder="Describe brevemente el alcance del servicio…"
          />
          <p className="mt-1 text-xs text-slate-400">
            Puedes editar la descripción sugerida antes de generar la propuesta.
          </p>
        </div>

        {/* ---------- TARJETA: HONORARIOS PROFESIONALES ---------- */}
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-700">
            Honorarios Profesionales
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Horas
              </label>
              <input
                type="number"
                min="0"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Costo por hora
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Moneda
              </label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputClass}
                placeholder="USD"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2">
            <span className="text-xs font-medium text-slate-600">
              Subtotal honorarios principales
            </span>
            <span className="text-sm font-bold text-slate-900">
              {cur} {formatMoney(honorariosPrincipal)}
            </span>
          </div>
        </fieldset>

        {/* ---------- TARJETA: SERVICIOS COMPLEMENTARIOS ---------- */}
        {hasAdditives && (
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-700">
              Servicios complementarios
            </legend>
            <p className="mb-3 text-xs text-slate-500">
              Marca los servicios adicionales que se incluirán. Cada uno tiene sus
              propios honorarios y gasto sugerido editables.
            </p>
            <ul className="space-y-3">
              {additiveRows.map((row, i) => (
                <li
                  key={row.key}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={(e) =>
                        updateAdditive(i, { checked: e.target.checked })
                      }
                      className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-800">
                      {row.label}
                    </span>
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
                        Horas
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={row.hours}
                        onChange={(e) =>
                          updateAdditive(i, { hours: e.target.value })
                        }
                        disabled={!row.checked}
                        className={smallInputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
                        Gasto
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.expense}
                        onChange={(e) =>
                          updateAdditive(i, { expense: e.target.value })
                        }
                        disabled={!row.checked}
                        className={smallInputClass}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] italic text-slate-500">
                    El costo por hora es el indicado en Honorarios Profesionales.
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2">
              <span className="text-xs font-medium text-slate-600">
                Subtotal servicios complementarios
              </span>
              <span className="text-sm font-bold text-slate-900">
                {cur}{' '}
                {formatMoney(honorariosComplementarios + gastosComplementarios)}
              </span>
            </div>
          </fieldset>
        )}

        {/* ---------- TARJETA: GASTOS ---------- */}
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-700">Gastos</legend>
          <p className="mb-3 text-xs text-slate-500">
            Marca los gastos que se incluirán en la propuesta. Los montos son
            sugeridos y puedes editarlos.
          </p>
          <ul className="space-y-2">
            {expenses.map((row, i) => (
              <li
                key={row.label}
                className="flex items-center gap-3 rounded-lg bg-white p-2"
              >
                <input
                  type="checkbox"
                  id={`expense-${i}`}
                  checked={row.checked}
                  onChange={(e) =>
                    updateExpense(i, { checked: e.target.checked })
                  }
                  className="h-4 w-4 flex-shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor={`expense-${i}`}
                  className="min-w-0 flex-1 truncate text-sm text-slate-700"
                >
                  {row.label}
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">{cur}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateExpense(i, { amount: e.target.value })}
                    placeholder="0.00"
                    disabled={!row.checked}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2">
            <span className="text-xs font-medium text-slate-600">
              Subtotal gastos predeterminados
            </span>
            <span className="text-sm font-bold text-slate-900">
              {cur} {formatMoney(gastosPredeterminados)}
            </span>
          </div>
        </fieldset>

        {/* TOTAL GENERAL */}
        <div className="rounded-xl bg-indigo-50 px-4 py-3">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-700">
              <dt>Honorarios totales</dt>
              <dd className="font-medium">
                {cur} {formatMoney(honorariosTotal)}
              </dd>
            </div>
            <div className="flex justify-between text-slate-700">
              <dt>Gastos totales</dt>
              <dd className="font-medium">
                {cur} {formatMoney(gastosTotal)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-indigo-200 pt-2 text-indigo-900">
              <dt className="text-base font-bold">Total general</dt>
              <dd className="text-xl font-bold">
                {cur} {formatMoney(grandTotal)}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Notas adicionales (opcional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Generando…' : 'Generar propuesta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
