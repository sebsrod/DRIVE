import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Profile as ProfileT, getProfile, upsertProfile } from '../lib/api'
import { OFFICE_ADDRESS } from '../lib/officeInfo'

export default function Profile() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [ipsaNumber, setIpsaNumber] = useState('')

  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      try {
        const profile = await getProfile(user.id)
        if (!alive) return
        if (profile) {
          setFullName(profile.full_name ?? '')
          setPhone(profile.phone ?? '')
          setIpsaNumber(profile.ipsa_number ?? '')
        }
      } catch (err) {
        if (alive) setError((err as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [user])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      await upsertProfile(user.id, user.email ?? '', {
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        ipsa_number: ipsaNumber.trim() || null,
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-2xl font-bold text-slate-900">Perfil</h2>
      <p className="mb-6 text-sm text-slate-500">
        Estos datos aparecerán como encabezado en las propuestas de servicios que
        generes.
      </p>

      {loading ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              value={user.email ?? ''}
              disabled
              className={`${inputClass} bg-slate-100 text-slate-500`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Nombre completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
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
              Número de I.P.S.A.
            </label>
            <input
              type="text"
              value={ipsaNumber}
              onChange={(e) => setIpsaNumber(e.target.value)}
              className={inputClass}
              placeholder="Ej: 123.456"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Dirección del despacho
            </label>
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {OFFICE_ADDRESS}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Esta dirección es común a todos los usuarios y no puede ser editada.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && (
            <p className="text-sm text-green-600">Perfil guardado correctamente.</p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
