import { FormEvent, useEffect, useState } from 'react'
import Modal from './Modal'

export interface ClientFormValues {
  name: string
  cedula_rif: string
  phone: string
  address: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (values: ClientFormValues) => Promise<void>
}

const empty: ClientFormValues = {
  name: '',
  cedula_rif: '',
  phone: '',
  address: '',
}

export default function ClientFormModal({ open, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<ClientFormValues>(empty)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValues(empty)
      setError(null)
    }
  }, [open])

  const handleChange = (field: keyof ClientFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!values.name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      await onSubmit({ ...values, name: values.name.trim() })
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
    <Modal open={open} onClose={onClose} title="Agregar cliente">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={values.name}
            onChange={handleChange('name')}
            className={inputClass}
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Cédula o RIF
          </label>
          <input
            type="text"
            value={values.cedula_rif}
            onChange={handleChange('cedula_rif')}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Teléfono
          </label>
          <input
            type="tel"
            value={values.phone}
            onChange={handleChange('phone')}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Dirección
          </label>
          <textarea
            rows={2}
            value={values.address}
            onChange={handleChange('address')}
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
            {submitting ? 'Guardando…' : 'Agregar cliente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
