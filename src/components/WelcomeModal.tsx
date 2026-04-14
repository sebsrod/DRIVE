import { useState, useEffect } from 'react'
import Modal from './Modal'
import ManualContent from './ManualContent'

interface Props {
  open: boolean
  onClose: (dontShowAgain: boolean) => void
}

export default function WelcomeModal({ open, onClose }: Props) {
  const [dontShow, setDontShow] = useState(false)

  useEffect(() => {
    if (open) setDontShow(false)
  }, [open])

  return (
    <Modal
      open={open}
      onClose={() => onClose(dontShow)}
      title="Bienvenido a Office Drive"
    >
      <p className="mb-4 text-sm text-slate-600">
        Esta breve guía te explica cómo organizar a tus clientes, sus archivos y
        cómo generar Propuestas de Servicios. Puedes volver a ella en cualquier
        momento desde el menú <strong>Manual</strong>.
      </p>
      <ManualContent />
      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          No mostrar más al iniciar sesión
        </label>
        <button
          type="button"
          onClick={() => onClose(dontShow)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Entendido
        </button>
      </div>
    </Modal>
  )
}
