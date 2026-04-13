import { FormEvent, useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { ProposalExpense } from '../lib/api'
import { SERVICES, findService, findSubService } from '../lib/services'

export interface ProposalFormValues {
  serviceType: string
  subService: string | null
  description: string
  hours: number
  hourlyRate: number
  currency: string
  notes: string
  expenses: ProposalExpense[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (values: ProposalFormValues) => Promise<void>
}

interface ExpenseRow {
  label: string
  amount: string // string para el input controlado
  checked: boolean
}

const DEFAULT_EXPENSES: ExpenseRow[] = [
  { label: 'Aranceles de registro', amount: '250', checked: false },
  { label: 'Timbre fiscal', amount: '20', checked: false },
  { label: 'Publicación mercantil', amount: '20', checked: false },
  { label: 'Copias certificadas', amount: '20', checked: false },
  { label: 'Habilitación', amount: '', checked: false },
]

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export default function ProposalFormModal({ open, onClose, onSubmit }: Props) {
  const [serviceType, setServiceType] = useState<string>(SERVICES[0].key)
  const [subService, setSubService] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [hours, setHours] = useState<string>('')
  const [hourlyRate, setHourlyRate] = useState<string>('')
  const [currency, setCurrency] = useState<string>('USD')
  const [notes, setNotes] = useState<string>('')
  const [expenses, setExpenses] = useState<ExpenseRow[]>(DEFAULT_EXPENSES)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const service = findService(serviceType)
  const hasSubServices = (service?.subServices?.length ?? 0) > 0

  // Reset al abrir
  useEffect(() => {
    if (!open) return
    const first = SERVICES[0]
    setServiceType(first.key)
    setSubService(first.subServices?.[0]?.key ?? '')
    setDescription(
      first.subServices?.[0]?.description ?? first.description ?? '',
    )
    setHours('')
    setHourlyRate('')
    setCurrency('USD')
    setNotes('')
    setExpenses(DEFAULT_EXPENSES.map((e) => ({ ...e })))
    setError(null)
  }, [open])

  const handleServiceChange = (key: string) => {
    setServiceType(key)
    const svc = findService(key)
    if (svc?.subServices && svc.subServices.length > 0) {
      const first = svc.subServices[0]
      setSubService(first.key)
      setDescription(first.description)
    } else {
      setSubService('')
      setDescription(svc?.description ?? '')
    }
  }

  const handleSubServiceChange = (key: string) => {
    setSubService(key)
    const sub = findSubService(serviceType, key)
    setDescription(sub?.description ?? '')
  }

  const updateExpense = (index: number, patch: Partial<ExpenseRow>) => {
    setExpenses((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  const honorariosTotal = useMemo(() => {
    const h = parseFloat(hours)
    const r = parseFloat(hourlyRate)
    if (isNaN(h) || isNaN(r)) return 0
    return +(h * r).toFixed(2)
  }, [hours, hourlyRate])

  const gastosTotal = useMemo(() => {
    return +expenses
      .filter((e) => e.checked)
      .reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0)
      .toFixed(2)
  }, [expenses])

  const grandTotal = useMemo(
    () => +(honorariosTotal + gastosTotal).toFixed(2),
    [honorariosTotal, gastosTotal],
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const h = parseFloat(hours)
    const r = parseFloat(hourlyRate)
    if (isNaN(h) || h <= 0) {
      setError('Indica un número de horas válido.')
      return
    }
    if (isNaN(r) || r < 0) {
      setError('Indica un costo por hora válido.')
      return
    }
    if (!description.trim()) {
      setError('La descripción no puede estar vacía.')
      return
    }
    // Validar gastos seleccionados: deben tener monto numérico ≥ 0
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
    try {
      setSubmitting(true)
      setError(null)
      await onSubmit({
        serviceType,
        subService: hasSubServices ? subService || null : null,
        description: description.trim(),
        hours: h,
        hourlyRate: r,
        currency: currency.trim() || 'USD',
        notes: notes.trim(),
        expenses: selectedExpenses,
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
              Tipo de acto
            </label>
            <select
              value={subService}
              onChange={(e) => handleSubServiceChange(e.target.value)}
              className={inputClass}
            >
              {service?.subServices?.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
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
              Subtotal honorarios
            </span>
            <span className="text-sm font-bold text-slate-900">
              {cur} {formatMoney(honorariosTotal)}
            </span>
          </div>
        </fieldset>

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
              Subtotal gastos
            </span>
            <span className="text-sm font-bold text-slate-900">
              {cur} {formatMoney(gastosTotal)}
            </span>
          </div>
        </fieldset>

        {/* TOTAL GENERAL */}
        <div className="rounded-xl bg-indigo-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-indigo-900">
              Total general
            </span>
            <span className="text-xl font-bold text-indigo-900">
              {cur} {formatMoney(grandTotal)}
            </span>
          </div>
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
