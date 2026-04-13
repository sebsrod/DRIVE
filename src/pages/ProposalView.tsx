import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Client,
  Profile,
  Proposal,
  expensesTotal,
  formatCurrency,
  getClient,
  getProfile,
  getProposal,
  proposalGrandTotal,
} from '../lib/api'
import { OFFICE_ADDRESS } from '../lib/officeInfo'
import { serviceLabel } from '../lib/services'

export default function ProposalView() {
  const { scope: scopeSlug, clientId, proposalId } = useParams<{
    scope: string
    clientId: string
    proposalId: string
  }>()

  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [author, setAuthor] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!proposalId || !clientId) return
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const [p, c] = await Promise.all([
          getProposal(proposalId),
          getClient(clientId),
        ])
        if (!alive) return
        setProposal(p)
        setClient(c)
        if (p) {
          const a = await getProfile(p.owner_id)
          if (alive) setAuthor(a)
        }
        setError(null)
      } catch (err) {
        if (alive) setError((err as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [proposalId, clientId])

  if (loading) return <p className="text-slate-500">Cargando propuesta…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!proposal || !client) return <p className="text-slate-500">No encontrada.</p>

  const date = new Date(proposal.created_at)
  const dateLong = date.toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const backUrl = `/ejercicio/${scopeSlug}/clientes/${clientId}`

  const profileMissing =
    !author?.full_name && !author?.phone && !author?.ipsa_number

  return (
    <div>
      {/* Barra de acciones (oculta al imprimir) */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link to={backUrl} className="text-sm text-indigo-600 hover:underline">
          ← Volver al cliente
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {profileMissing && (
        <div className="no-print mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Tu perfil no tiene datos. Ve a <strong>Perfil</strong> y completa nombre,
          teléfono y número de I.P.S.A. para que aparezcan en la propuesta.
        </div>
      )}

      {/* Hoja imprimible */}
      <article className="print-sheet mx-auto max-w-3xl bg-white p-8 shadow sm:p-12 print:max-w-none print:shadow-none">
        {/* Encabezado del despacho */}
        <header className="border-b border-slate-300 pb-4 text-center">
          <h1 className="text-xl font-bold uppercase text-slate-900">
            {author?.full_name ?? 'Abogado'}
          </h1>
          {author?.ipsa_number && (
            <p className="text-sm text-slate-700">
              Abogado · I.P.S.A. N° {author.ipsa_number}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-600">{OFFICE_ADDRESS}</p>
          {author?.phone && (
            <p className="text-xs text-slate-600">Teléfono: {author.phone}</p>
          )}
          {author?.email && (
            <p className="text-xs text-slate-600">{author.email}</p>
          )}
        </header>

        <p className="mt-6 text-right text-sm text-slate-700">
          Caracas, {dateLong}
        </p>

        {/* Destinatario */}
        <section className="mt-6">
          <p className="text-sm text-slate-700">Señores</p>
          <p className="text-base font-semibold text-slate-900">{client.name}</p>
          {client.cedula_rif && (
            <p className="text-sm text-slate-700">C.I./RIF: {client.cedula_rif}</p>
          )}
          {client.address && (
            <p className="text-sm text-slate-700">{client.address}</p>
          )}
          {client.phone && (
            <p className="text-sm text-slate-700">Teléfono: {client.phone}</p>
          )}
          <p className="mt-2 text-sm font-semibold text-slate-900">Presente.-</p>
        </section>

        {/* Saludo */}
        <p className="mt-6 text-justify text-sm text-slate-800">
          Reciban un cordial saludo. Por medio de la presente, me complace someter a
          su consideración la siguiente <strong>Propuesta de Servicios Profesionales</strong>:
        </p>

        {/* Servicio */}
        <section className="mt-6">
          <h2 className="border-b border-slate-300 pb-1 text-base font-bold uppercase text-slate-900">
            {serviceLabel(proposal.service_type, proposal.sub_service)}
          </h2>
          <p className="mt-3 whitespace-pre-line text-justify text-sm leading-relaxed text-slate-800">
            {proposal.description}
          </p>
        </section>

        {/* Honorarios Profesionales */}
        <section className="mt-6">
          <h3 className="text-sm font-bold uppercase text-slate-900">
            Honorarios Profesionales
          </h3>
          <table className="mt-2 w-full border border-slate-300 text-sm">
            <tbody>
              <tr className="border-b border-slate-300">
                <td className="px-3 py-2 text-slate-700">Horas estimadas</td>
                <td className="px-3 py-2 text-right font-medium text-slate-900">
                  {proposal.hours}
                </td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="px-3 py-2 text-slate-700">Costo por hora</td>
                <td className="px-3 py-2 text-right font-medium text-slate-900">
                  {formatCurrency(proposal.hourly_rate, proposal.currency)}
                </td>
              </tr>
              <tr className="bg-slate-100">
                <td className="px-3 py-2 font-bold text-slate-900">
                  Subtotal honorarios
                </td>
                <td className="px-3 py-2 text-right text-base font-bold text-slate-900">
                  {formatCurrency(proposal.total, proposal.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Gastos */}
        {proposal.expenses && proposal.expenses.length > 0 && (
          <section className="mt-6">
            <h3 className="text-sm font-bold uppercase text-slate-900">Gastos</h3>
            <table className="mt-2 w-full border border-slate-300 text-sm">
              <tbody>
                {proposal.expenses.map((e, i) => (
                  <tr key={i} className="border-b border-slate-300">
                    <td className="px-3 py-2 text-slate-700">{e.label}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900">
                      {formatCurrency(e.amount, proposal.currency)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-100">
                  <td className="px-3 py-2 font-bold text-slate-900">
                    Subtotal gastos
                  </td>
                  <td className="px-3 py-2 text-right text-base font-bold text-slate-900">
                    {formatCurrency(
                      expensesTotal(proposal.expenses),
                      proposal.currency,
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* Total general */}
        <section className="mt-6">
          <table className="w-full border border-slate-700 text-sm">
            <tbody>
              <tr className="bg-slate-800 text-white">
                <td className="px-3 py-3 font-bold uppercase">Total general</td>
                <td className="px-3 py-3 text-right text-lg font-bold">
                  {formatCurrency(proposalGrandTotal(proposal), proposal.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {proposal.notes && (
          <section className="mt-6">
            <h3 className="text-sm font-bold uppercase text-slate-900">
              Notas adicionales
            </h3>
            <p className="mt-1 whitespace-pre-line text-justify text-sm text-slate-800">
              {proposal.notes}
            </p>
          </section>
        )}

        {/* Cierre */}
        <p className="mt-8 text-justify text-sm text-slate-800">
          Quedamos a su entera disposición para ampliar cualquier información que
          consideren pertinente. Agradeciendo de antemano la confianza depositada
          en nuestros servicios, nos suscribimos.
        </p>

        <p className="mt-2 text-sm text-slate-800">Atentamente,</p>

        <div className="mt-12">
          <div className="mx-auto w-64 border-t border-slate-700 text-center">
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {author?.full_name ?? '________________________'}
            </p>
            {author?.ipsa_number && (
              <p className="text-xs text-slate-700">
                Abogado · I.P.S.A. N° {author.ipsa_number}
              </p>
            )}
          </div>
        </div>
      </article>
    </div>
  )
}
