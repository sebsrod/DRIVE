import { FormEvent, useEffect, useState } from 'react'
import Modal from './Modal'
import {
  Client,
  ClientType,
  LegalRepresentative,
  Shareholder,
  parseCapitalAmount,
} from '../lib/api'

interface ShareholderRow {
  name: string
  cedula: string
  percentage: string
}

interface RepresentativeRow {
  name: string
  cedula: string
  position: string
}

export interface ClientFormValues {
  client_type: ClientType
  name: string
  cedula_rif: string
  phone: string
  address: string
  capital_social: string
  registry_office: string
  registry_date: string
  registry_number: string
  registry_volume: string
  board_duration: string
  total_shares: number | null
  shareholders: Shareholder[]
  legal_representatives: LegalRepresentative[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (values: ClientFormValues) => Promise<void>
  initialClient?: Client | null
}

const emptyShareholder: ShareholderRow = {
  name: '',
  cedula: '',
  percentage: '',
}
const emptyRep: RepresentativeRow = { name: '', cedula: '', position: '' }

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

const smallInputClass =
  'w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

export default function ClientFormModal({
  open,
  onClose,
  onSubmit,
  initialClient,
}: Props) {
  const isEdit = !!initialClient
  const [clientType, setClientType] = useState<ClientType>('natural')
  const [name, setName] = useState('')
  const [cedulaRif, setCedulaRif] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [capitalSocial, setCapitalSocial] = useState('')
  const [registryOffice, setRegistryOffice] = useState('')
  const [registryDate, setRegistryDate] = useState('')
  const [registryNumber, setRegistryNumber] = useState('')
  const [registryVolume, setRegistryVolume] = useState('')
  const [boardDuration, setBoardDuration] = useState('')
  const [totalShares, setTotalShares] = useState('')
  const [shareholders, setShareholders] = useState<ShareholderRow[]>([
    { ...emptyShareholder },
  ])
  const [representatives, setRepresentatives] = useState<RepresentativeRow[]>([
    { ...emptyRep },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (initialClient) {
      // Modo edición: prellenar con los datos actuales del cliente
      setClientType(initialClient.client_type)
      setName(initialClient.name)
      setCedulaRif(initialClient.cedula_rif ?? '')
      setPhone(initialClient.phone ?? '')
      setAddress(initialClient.address ?? '')
      setCapitalSocial(initialClient.capital_social ?? '')
      setRegistryOffice(initialClient.registry_office ?? '')
      setRegistryDate(initialClient.registry_date ?? '')
      setRegistryNumber(initialClient.registry_number ?? '')
      setRegistryVolume(initialClient.registry_volume ?? '')
      setBoardDuration(initialClient.board_duration ?? '')
      setTotalShares(
        initialClient.total_shares != null
          ? String(initialClient.total_shares)
          : '',
      )
      const existingShareholders = initialClient.shareholders ?? []
      setShareholders(
        existingShareholders.length > 0
          ? existingShareholders.map((s) => ({
              name: s.name,
              cedula: s.cedula,
              percentage: String(s.percentage ?? ''),
            }))
          : [{ ...emptyShareholder }],
      )
      const existingReps = initialClient.legal_representatives ?? []
      setRepresentatives(
        existingReps.length > 0
          ? existingReps.map((r) => ({
              name: r.name,
              cedula: r.cedula,
              position: r.position ?? '',
            }))
          : [{ ...emptyRep }],
      )
    } else {
      // Modo creación: limpiar todo
      setClientType('natural')
      setName('')
      setCedulaRif('')
      setPhone('')
      setAddress('')
      setCapitalSocial('')
      setRegistryOffice('')
      setRegistryDate('')
      setRegistryNumber('')
      setRegistryVolume('')
      setBoardDuration('')
      setTotalShares('')
      setShareholders([{ ...emptyShareholder }])
      setRepresentatives([{ ...emptyRep }])
    }
    setError(null)
  }, [open, initialClient])

  const updateShareholder = (
    i: number,
    patch: Partial<ShareholderRow>,
  ) =>
    setShareholders((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    )

  const updateRep = (i: number, patch: Partial<RepresentativeRow>) =>
    setRepresentatives((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    if (clientType === 'juridica' && !cedulaRif.trim()) {
      setError('Para personas jurídicas el RIF es obligatorio.')
      return
    }

    const cleanedShareholders: Shareholder[] = []
    const cleanedReps: LegalRepresentative[] = []
    if (clientType === 'juridica') {
      for (const s of shareholders) {
        const n = s.name.trim()
        if (!n && !s.cedula.trim() && !s.percentage.trim()) continue
        const pct = parseFloat(s.percentage)
        if (isNaN(pct) || pct < 0 || pct > 100) {
          setError(
            `Indica un porcentaje válido (0–100) para el accionista "${n || '(sin nombre)'}".`,
          )
          return
        }
        if (!n) {
          setError('Cada accionista debe tener nombre.')
          return
        }
        cleanedShareholders.push({
          name: n,
          cedula: s.cedula.trim(),
          percentage: pct,
        })
      }
      for (const r of representatives) {
        const n = r.name.trim()
        if (!n && !r.cedula.trim() && !r.position.trim()) continue
        if (!n) {
          setError('Cada representante debe tener nombre.')
          return
        }
        cleanedReps.push({
          name: n,
          cedula: r.cedula.trim(),
          position: r.position.trim(),
        })
      }
    }

    try {
      setSubmitting(true)
      setError(null)
      await onSubmit({
        client_type: clientType,
        name: name.trim(),
        cedula_rif: cedulaRif.trim(),
        phone: phone.trim(),
        address: address.trim(),
        capital_social: clientType === 'juridica' ? capitalSocial.trim() : '',
        registry_office: clientType === 'juridica' ? registryOffice.trim() : '',
        registry_date: clientType === 'juridica' ? registryDate : '',
        registry_number: clientType === 'juridica' ? registryNumber.trim() : '',
        registry_volume: clientType === 'juridica' ? registryVolume.trim() : '',
        board_duration: clientType === 'juridica' ? boardDuration.trim() : '',
        total_shares:
          clientType === 'juridica' && totalShares.trim()
            ? parseFloat(totalShares)
            : null,
        shareholders: cleanedShareholders,
        legal_representatives: cleanedReps,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const isJuridica = clientType === 'juridica'
  const cedulaLabel = isJuridica ? 'RIF' : 'Cédula de identidad'
  const nameLabel = isJuridica ? 'Razón social' : 'Nombre completo'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar cliente' : 'Agregar cliente'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo de cliente */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Tipo de cliente
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                !isJuridica
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-300 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="client-type"
                value="natural"
                checked={!isJuridica}
                onChange={() => setClientType('natural')}
                className="h-4 w-4"
              />
              Persona natural
            </label>
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                isJuridica
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-300 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="client-type"
                value="juridica"
                checked={isJuridica}
                onChange={() => setClientType('juridica')}
                className="h-4 w-4"
              />
              Persona jurídica
            </label>
          </div>
        </div>

        {/* Datos comunes */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {nameLabel} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {cedulaLabel}
            {isJuridica && <span className="text-red-500"> *</span>}
          </label>
          <input
            type="text"
            required={isJuridica}
            value={cedulaRif}
            onChange={(e) => setCedulaRif(e.target.value)}
            className={inputClass}
            placeholder={isJuridica ? 'J-12345678-9' : 'V-12345678'}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Teléfono
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Dirección
          </label>
          <textarea
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Campos extra para jurídica */}
        {isJuridica && (
          <>
            <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <legend className="px-2 text-sm font-semibold text-slate-700">
                Datos de registro
              </legend>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Registro Mercantil
                  </label>
                  <input
                    type="text"
                    value={registryOffice}
                    onChange={(e) => setRegistryOffice(e.target.value)}
                    className={inputClass}
                    placeholder="Ej: Registro Mercantil Primero del Distrito Capital"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Fecha
                    </label>
                    <input
                      type="date"
                      value={registryDate}
                      onChange={(e) => setRegistryDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Número
                    </label>
                    <input
                      type="text"
                      value={registryNumber}
                      onChange={(e) => setRegistryNumber(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Tomo
                    </label>
                    <input
                      type="text"
                      value={registryVolume}
                      onChange={(e) => setRegistryVolume(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Capital social
                    </label>
                    <input
                      type="text"
                      value={capitalSocial}
                      onChange={(e) => setCapitalSocial(e.target.value)}
                      className={inputClass}
                      placeholder="Ej: USD 50.000 / Bs. 1.000.000"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Cantidad total de acciones
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={totalShares}
                      onChange={(e) => setTotalShares(e.target.value)}
                      className={inputClass}
                      placeholder="Ej: 1000"
                    />
                  </div>
                </div>
                {(() => {
                  const totalCapital = parseCapitalAmount(capitalSocial)
                  const totalSh = parseFloat(totalShares)
                  if (
                    !isNaN(totalCapital) &&
                    !isNaN(totalSh) &&
                    totalSh > 0
                  ) {
                    const valorAccion = totalCapital / totalSh
                    return (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Valor nominal por acción ≈{' '}
                        <strong>
                          {new Intl.NumberFormat('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 10,
                          }).format(valorAccion)}
                        </strong>
                      </p>
                    )
                  }
                  return null
                })()}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <legend className="px-2 text-sm font-semibold text-slate-700">
                Accionistas
              </legend>
              <ul className="space-y-2">
                {shareholders.map((s, i) => {
                  const totalSh = parseFloat(totalShares)
                  const pct = parseFloat(s.percentage)
                  const sharesCount =
                    !isNaN(totalSh) && !isNaN(pct) && totalSh > 0
                      ? Math.round((pct / 100) * totalSh)
                      : null
                  return (
                  <li
                    key={i}
                    className="grid grid-cols-12 items-start gap-2 rounded-lg bg-white p-2"
                  >
                    <div className="col-span-5">
                      <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                        Nombre
                      </label>
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) =>
                          updateShareholder(i, { name: e.target.value })
                        }
                        className={smallInputClass}
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                        Cédula
                      </label>
                      <input
                        type="text"
                        value={s.cedula}
                        onChange={(e) =>
                          updateShareholder(i, { cedula: e.target.value })
                        }
                        className={smallInputClass}
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
                        onChange={(e) =>
                          updateShareholder(i, { percentage: e.target.value })
                        }
                        className={`${smallInputClass} text-right`}
                      />
                    </div>
                    <div className="col-span-1 pb-1 text-right">
                      <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                        Acc.
                      </label>
                      <p className="px-1 py-1 text-[11px] font-medium text-slate-700">
                        {sharesCount ?? '—'}
                      </p>
                    </div>
                    <div className="col-span-1 flex items-end justify-end pb-1">
                      <button
                        type="button"
                        onClick={() =>
                          setShareholders((rows) =>
                            rows.length === 1
                              ? [{ ...emptyShareholder }]
                              : rows.filter((_, idx) => idx !== i),
                          )
                        }
                        aria-label="Eliminar accionista"
                        className="text-lg text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() =>
                  setShareholders((rows) => [...rows, { ...emptyShareholder }])
                }
                className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
              >
                + Agregar accionista
              </button>
            </fieldset>

            <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <legend className="px-2 text-sm font-semibold text-slate-700">
                Junta Directiva / Representantes legales
              </legend>
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Duración del período de la Junta Directiva
                </label>
                <input
                  type="text"
                  value={boardDuration}
                  onChange={(e) => setBoardDuration(e.target.value)}
                  className={inputClass}
                  placeholder="Ej: 5 años contados desde la inscripción en el Registro Mercantil"
                />
              </div>
              <ul className="space-y-2">
                {representatives.map((r, i) => (
                  <li
                    key={i}
                    className="space-y-2 rounded-lg bg-white p-2"
                  >
                    <div className="grid grid-cols-12 items-start gap-2">
                      <div className="col-span-11">
                        <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                          Cargo
                        </label>
                        <input
                          type="text"
                          value={r.position}
                          onChange={(e) =>
                            updateRep(i, { position: e.target.value })
                          }
                          className={smallInputClass}
                          placeholder="Ej: Presidente, Vicepresidente, Director"
                        />
                      </div>
                      <div className="col-span-1 flex items-end justify-end pb-1">
                        <button
                          type="button"
                          onClick={() =>
                            setRepresentatives((rows) =>
                              rows.length === 1
                                ? [{ ...emptyRep }]
                                : rows.filter((_, idx) => idx !== i),
                            )
                          }
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
                          onChange={(e) =>
                            updateRep(i, { name: e.target.value })
                          }
                          className={smallInputClass}
                        />
                      </div>
                      <div className="col-span-5">
                        <label className="mb-0.5 block text-[10px] uppercase text-slate-500">
                          Cédula
                        </label>
                        <input
                          type="text"
                          value={r.cedula}
                          onChange={(e) =>
                            updateRep(i, { cedula: e.target.value })
                          }
                          className={smallInputClass}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  setRepresentatives((rows) => [...rows, { ...emptyRep }])
                }
                className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
              >
                + Agregar miembro
              </button>
            </fieldset>
          </>
        )}

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
            {submitting
              ? 'Guardando…'
              : isEdit
                ? 'Guardar cambios'
                : 'Agregar cliente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
