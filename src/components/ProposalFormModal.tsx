import { FormEvent, useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { SERVICES, findService, findSubService } from '../lib/services'

export interface ProposalFormValues {
  serviceType: string
  subService: string | null
  description: string
  hours: number
  hourlyRate: number
  currency: string
  notes: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (values: ProposalFormValues) => Promise<void>
}

export default function ProposalFormModal({ open, onClose, onSubmit }: Props) {
  const [serviceType, setServiceType] = useState<string>(SERVICES[0].key)
  const [subService, setSubService] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [hours, setHours] = useState<string>('')
  const [hourlyRate, setHourlyRate] = useState<string>('')
  const [currency, setCurrency] = useState<string>('USD')
  const [notes, setNotes] = useState<string>('')
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
    setError(null)
  }, [open])

  // Cuando cambia el servicio, ajustar sub-servicio y descripción
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

  const total = useMemo(() => {
    const h = parseFloat(hours)
    const r = parseFloat(hourlyRate)
    if (isNaN(h) || isNaN(r)) return 0
    return +(h * r).toFixed(2)
  }, [hours, hourlyRate])

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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
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
            <label className="mb-1 block text-sm font-medium text-slate-700">
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
            <label className="mb-1 block text-sm font-medium text-slate-700">
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

        <div className="rounded-lg bg-indigo-50 p-3">
          <p className="text-sm font-medium text-indigo-900">
            Total estimado:{' '}
            <span className="text-lg font-bold">
              {currency || 'USD'}{' '}
              {new Intl.NumberFormat('es-VE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(total)}
            </span>
          </p>
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
