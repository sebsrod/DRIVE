import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  Client,
  ClientFolder,
  DocumentRow,
  Proposal,
  createClientFolder,
  createProposal,
  deleteClientFolder,
  deleteProposal,
  formatCurrency,
  getClient,
  listClientDocuments,
  listClientFolders,
  listClientProposals,
  listFundamentalDocuments,
  proposalGrandTotal,
  scopeFromSlug,
  slugFromScope,
  uploadDocument,
} from '../lib/api'
import { proposalServiceLabel } from '../lib/services'
import DocumentList from '../components/DocumentList'
import UploadButton from '../components/UploadButton'
import FolderFormModal from '../components/FolderFormModal'
import ProposalFormModal, {
  ProposalFormValues,
} from '../components/ProposalFormModal'
import GenerateDocumentModal from '../components/GenerateDocumentModal'

export default function ClientView() {
  const { scope: scopeSlug, clientId } = useParams<{
    scope: string
    clientId: string
  }>()
  const { user } = useAuth()
  const scope = scopeFromSlug(scopeSlug)

  const [client, setClient] = useState<Client | null>(null)
  const [folders, setFolders] = useState<ClientFolder[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [fundamentalDocs, setFundamentalDocs] = useState<DocumentRow[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [proposalModalOpen, setProposalModalOpen] = useState(false)
  const [generateModalOpen, setGenerateModalOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!clientId) return
    try {
      setLoading(true)
      const [c, f, d, fd, p] = await Promise.all([
        getClient(clientId),
        listClientFolders(clientId),
        listClientDocuments(clientId),
        listFundamentalDocuments(clientId),
        listClientProposals(clientId),
      ])
      setClient(c)
      setFolders(f)
      setDocuments(d)
      setFundamentalDocs(fd)
      setProposals(p)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleUpload = async (file: File) => {
    if (!user || !client) return
    await uploadDocument({ file, client, subfolderId: null, ownerId: user.id })
    await refresh()
  }

  const handleUploadFundamental = async (file: File) => {
    if (!user || !client) return
    await uploadDocument({
      file,
      client,
      subfolderId: null,
      ownerId: user.id,
      isFundamental: true,
    })
    await refresh()
  }

  const handleCreateFolder = async (name: string) => {
    if (!clientId) return
    await createClientFolder(clientId, name)
    await refresh()
  }

  const handleDeleteFolder = async (folder: ClientFolder) => {
    if (!confirm(`¿Eliminar la carpeta "${folder.name}" y todos sus archivos?`))
      return
    try {
      await deleteClientFolder(folder, scope)
      await refresh()
    } catch (err) {
      alert('Error al eliminar la carpeta: ' + (err as Error).message)
    }
  }

  const handleCreateProposal = async (values: ProposalFormValues) => {
    if (!user || !clientId) return
    await createProposal({
      clientId,
      ownerId: user.id,
      serviceType: values.serviceType,
      subService: values.subService,
      subServices: values.subServices,
      description: values.description,
      hours: values.hours,
      hourlyRate: values.hourlyRate,
      currency: values.currency,
      notes: values.notes || null,
      expenses: values.expenses,
      honorariosItems: values.honorariosItems,
    })
    await refresh()
  }

  const handleDeleteProposal = async (proposal: Proposal) => {
    if (!confirm('¿Eliminar esta propuesta?')) return
    try {
      await deleteProposal(proposal.id)
      await refresh()
    } catch (err) {
      alert('Error al eliminar la propuesta: ' + (err as Error).message)
    }
  }

  if (!user) return null

  const scopeUrl = `/ejercicio/${slugFromScope(scope)}`
  const backUrl = scopeUrl

  return (
    <div>
      <Link to={backUrl} className="text-sm text-indigo-600 hover:underline">
        ← Volver a clientes
      </Link>

      <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-slate-900">
            📁 {client?.name ?? 'Cliente'}
          </h2>
          {client && (
            <dl className="mt-1 space-y-0.5 text-xs text-slate-600">
              {client.cedula_rif && (
                <div>
                  <dt className="inline font-medium">Cédula/RIF: </dt>
                  <dd className="inline">{client.cedula_rif}</dd>
                </div>
              )}
              {client.phone && (
                <div>
                  <dt className="inline font-medium">Tel: </dt>
                  <dd className="inline">{client.phone}</dd>
                </div>
              )}
              {client.address && (
                <div>
                  <dt className="inline font-medium">Dirección: </dt>
                  <dd className="inline">{client.address}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
        <div className="flex flex-col flex-wrap gap-2 sm:flex-row">
          <button
            onClick={() => setGenerateModalOpen(true)}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            ✨ Generar documento
          </button>
          <button
            onClick={() => setProposalModalOpen(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + Generar propuesta
          </button>
          <button
            onClick={() => setFolderModalOpen(true)}
            className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            + Nueva carpeta
          </button>
          <UploadButton onUpload={handleUpload} label="Subir archivo" />
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <>
          {client?.client_type === 'juridica' && (
            <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Datos de la empresa
              </h3>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {client.registry_office && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium uppercase text-slate-500">
                      Registro Mercantil
                    </dt>
                    <dd className="text-slate-800">{client.registry_office}</dd>
                  </div>
                )}
                {client.registry_date && (
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">
                      Fecha de registro
                    </dt>
                    <dd className="text-slate-800">
                      {new Date(client.registry_date).toLocaleDateString('es-VE')}
                    </dd>
                  </div>
                )}
                {(client.registry_number || client.registry_volume) && (
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">
                      Número / Tomo
                    </dt>
                    <dd className="text-slate-800">
                      {client.registry_number || '—'}
                      {client.registry_volume
                        ? ` / Tomo ${client.registry_volume}`
                        : ''}
                    </dd>
                  </div>
                )}
                {client.capital_social && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium uppercase text-slate-500">
                      Capital social
                    </dt>
                    <dd className="text-slate-800">{client.capital_social}</dd>
                  </div>
                )}
              </dl>

              {client.shareholders && client.shareholders.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase text-slate-500">
                    Accionistas
                  </h4>
                  <ul className="mt-1 divide-y divide-slate-100 text-sm">
                    {client.shareholders.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between py-1.5"
                      >
                        <div>
                          <span className="font-medium text-slate-800">
                            {s.name}
                          </span>
                          {s.cedula && (
                            <span className="ml-2 text-xs text-slate-500">
                              ({s.cedula})
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-slate-700">
                          {s.percentage}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {client.legal_representatives &&
                client.legal_representatives.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold uppercase text-slate-500">
                      Junta Directiva / Representantes legales
                    </h4>
                    {client.board_duration && (
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-medium">Duración:</span>{' '}
                        {client.board_duration}
                      </p>
                    )}
                    <ul className="mt-1 divide-y divide-slate-100 text-sm">
                      {client.legal_representatives.map((r, i) => (
                        <li key={i} className="py-1.5">
                          {r.position && (
                            <span className="mr-2 text-xs font-semibold uppercase text-indigo-700">
                              {r.position}:
                            </span>
                          )}
                          <span className="font-medium text-slate-800">
                            {r.name}
                          </span>
                          {r.cedula && (
                            <span className="ml-2 text-xs text-slate-500">
                              ({r.cedula})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </section>
          )}

          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Documentos fundamentales
              </h3>
              <UploadButton
                onUpload={handleUploadFundamental}
                label="+ Subir fundamental"
              />
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Documento constitutivo, cédulas de los representantes, poderes y
              demás documentos base. Se usan como contexto al generar nuevos
              documentos con la IA. Acepta PDF, JPEG y PNG.
            </p>
            {fundamentalDocs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                Aún no hay documentos fundamentales. Sube el documento
                constitutivo del cliente y las cédulas de sus representantes
                para que la IA pueda usar esos datos al redactar documentos.
              </p>
            ) : (
              <DocumentList
                documents={fundamentalDocs}
                onChange={refresh}
                currentUserId={user.id}
              />
            )}
          </section>

          <section className="mb-8">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Propuestas de Servicios
            </h3>
            {proposals.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                Sin propuestas. Pulsa <strong>Generar propuesta</strong> para crear
                una.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {proposals.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/ejercicio/${slugFromScope(scope)}/clientes/${
                          clientId
                        }/propuestas/${p.id}`}
                        className="block truncate font-medium text-indigo-700 hover:underline"
                      >
                        {proposalServiceLabel(p)}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {new Date(p.created_at).toLocaleDateString()} ·{' '}
                        {formatCurrency(proposalGrandTotal(p), p.currency)}
                      </p>
                    </div>
                    {p.owner_id === user.id && (
                      <button
                        onClick={() => handleDeleteProposal(p)}
                        className="self-start rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 sm:self-auto"
                      >
                        Eliminar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-8">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Carpetas
            </h3>
            {folders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                Sin carpetas. Crea una para organizar los archivos del cliente.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <Link
                      to={`/ejercicio/${slugFromScope(scope)}/clientes/${
                        clientId
                      }/carpetas/${folder.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-indigo-700 hover:underline"
                    >
                      📂 {folder.name}
                    </Link>
                    <button
                      onClick={() => handleDeleteFolder(folder)}
                      className="ml-2 flex-shrink-0 text-xs font-medium text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Archivos del cliente
            </h3>
            <DocumentList
              documents={documents}
              onChange={refresh}
              currentUserId={user.id}
            />
          </section>
        </>
      )}

      <FolderFormModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        onSubmit={handleCreateFolder}
      />

      <ProposalFormModal
        open={proposalModalOpen}
        onClose={() => setProposalModalOpen(false)}
        onSubmit={handleCreateProposal}
      />

      {client && (
        <GenerateDocumentModal
          open={generateModalOpen}
          onClose={() => setGenerateModalOpen(false)}
          client={client}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
