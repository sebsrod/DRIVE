import { supabase, PERSONAL_BUCKET, SHARED_BUCKET } from './supabase'

export type Scope = 'private' | 'team'

export type ClientType = 'natural' | 'juridica'

export interface Shareholder {
  name: string
  cedula: string
  percentage: number
}

export interface LegalRepresentative {
  name: string
  cedula: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  ipsa_number: string | null
  role: 'member' | 'admin'
  created_at: string
}

export interface Client {
  id: string
  name: string
  cedula_rif: string | null
  phone: string | null
  address: string | null
  scope: Scope
  owner_id: string
  client_type: ClientType
  capital_social: string | null
  registry_office: string | null
  registry_date: string | null
  registry_number: string | null
  registry_volume: string | null
  shareholders: Shareholder[]
  legal_representatives: LegalRepresentative[]
  created_at: string
}

export interface ClientFolder {
  id: string
  client_id: string
  name: string
  created_at: string
}

export interface DocumentRow {
  id: string
  name: string
  storage_path: string
  size: number | null
  mime_type: string | null
  client_id: string
  subfolder_id: string | null
  scope: Scope
  owner_id: string
  is_fundamental: boolean
  created_at: string
}

export interface ProposalExpense {
  label: string
  amount: number
}

export interface HonorariosItem {
  key: string
  label: string
  description: string
  hours: number
  rate: number
  total: number
}

export interface ProposalSubService {
  key: string
  label: string
  description: string
}

export interface Proposal {
  id: string
  client_id: string
  owner_id: string
  service_type: string
  sub_service: string | null
  sub_services: ProposalSubService[]
  description: string
  hours: number
  hourly_rate: number
  total: number
  currency: string
  notes: string | null
  expenses: ProposalExpense[]
  honorarios_items: HonorariosItem[]
  created_at: string
}

// ---------- URL <-> scope helpers ----------

export function scopeFromSlug(slug: string | undefined): Scope {
  return slug === 'equipo' ? 'team' : 'private'
}

export function slugFromScope(scope: Scope): 'privado' | 'equipo' {
  return scope === 'team' ? 'equipo' : 'privado'
}

export function scopeLabel(scope: Scope): string {
  return scope === 'team' ? 'Ejercicio en equipo' : 'Ejercicio privado'
}

function bucketForScope(scope: Scope) {
  return scope === 'private' ? PERSONAL_BUCKET : SHARED_BUCKET
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

// ---------- CLIENTES ----------

export async function listClients(scope: Scope): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('scope', scope)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Client[]
}

export async function getClient(clientId: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return (data as Client) ?? null
}

export async function createClient(
  scope: Scope,
  ownerId: string,
  values: {
    client_type: ClientType
    name: string
    cedula_rif?: string | null
    phone?: string | null
    address?: string | null
    capital_social?: string | null
    registry_office?: string | null
    registry_date?: string | null
    registry_number?: string | null
    registry_volume?: string | null
    shareholders?: Shareholder[]
    legal_representatives?: LegalRepresentative[]
  },
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      scope,
      owner_id: ownerId,
      client_type: values.client_type,
      name: values.name,
      cedula_rif: values.cedula_rif || null,
      phone: values.phone || null,
      address: values.address || null,
      capital_social: values.capital_social || null,
      registry_office: values.registry_office || null,
      registry_date: values.registry_date || null,
      registry_number: values.registry_number || null,
      registry_volume: values.registry_volume || null,
      shareholders: values.shareholders ?? [],
      legal_representatives: values.legal_representatives ?? [],
    })
    .select()
    .single()
  if (error) throw error
  return data as Client
}

export async function deleteClient(client: Client): Promise<void> {
  // Borrar archivos del storage primero (la BD hace cascade pero el storage no)
  const { data: docs, error: listError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('client_id', client.id)
  if (listError) throw listError

  if (docs && docs.length > 0) {
    const bucket = bucketForScope(client.scope)
    const paths = docs.map((d) => d.storage_path as string)
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
    if (removeError) throw removeError
  }

  const { error } = await supabase.from('clients').delete().eq('id', client.id)
  if (error) throw error
}

// ---------- SUBCARPETAS ----------

export async function listClientFolders(clientId: string): Promise<ClientFolder[]> {
  const { data, error } = await supabase
    .from('client_folders')
    .select('*')
    .eq('client_id', clientId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as ClientFolder[]
}

export async function getClientFolder(folderId: string): Promise<ClientFolder | null> {
  const { data, error } = await supabase
    .from('client_folders')
    .select('*')
    .eq('id', folderId)
    .maybeSingle()
  if (error) throw error
  return (data as ClientFolder) ?? null
}

export async function createClientFolder(
  clientId: string,
  name: string,
): Promise<ClientFolder> {
  const { data, error } = await supabase
    .from('client_folders')
    .insert({ client_id: clientId, name })
    .select()
    .single()
  if (error) throw error
  return data as ClientFolder
}

export async function deleteClientFolder(
  folder: ClientFolder,
  scope: Scope,
): Promise<void> {
  const { data: docs, error: listError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('subfolder_id', folder.id)
  if (listError) throw listError

  if (docs && docs.length > 0) {
    const bucket = bucketForScope(scope)
    const paths = docs.map((d) => d.storage_path as string)
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
    if (removeError) throw removeError
  }

  const { error } = await supabase.from('client_folders').delete().eq('id', folder.id)
  if (error) throw error
}

// ---------- DOCUMENTOS ----------

export async function listClientDocuments(clientId: string): Promise<DocumentRow[]> {
  // documentos en la raíz del cliente (subfolder_id = null) que no son
  // fundamentales (los fundamentales tienen su propia sección)
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('client_id', clientId)
    .is('subfolder_id', null)
    .eq('is_fundamental', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRow[]
}

export async function listFundamentalDocuments(
  clientId: string,
): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_fundamental', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRow[]
}

export async function listSubfolderDocuments(
  subfolderId: string,
): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('subfolder_id', subfolderId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRow[]
}

interface UploadParams {
  file: File
  client: Client
  subfolderId: string | null
  ownerId: string
  isFundamental?: boolean
}

export async function uploadDocument({
  file,
  client,
  subfolderId,
  ownerId,
  isFundamental = false,
}: UploadParams): Promise<DocumentRow> {
  const bucket = bucketForScope(client.scope)
  const folderSegment = isFundamental
    ? '_fundamental'
    : subfolderId ?? '_root'
  // Para el bucket personal, el primer segmento DEBE ser el user id (RLS)
  const prefix =
    client.scope === 'private' ? `${ownerId}/${client.id}` : `${client.id}`
  const path = `${prefix}/${folderSegment}/${Date.now()}-${sanitizeFilename(file.name)}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('documents')
    .insert({
      name: file.name,
      storage_path: path,
      size: file.size,
      mime_type: file.type,
      client_id: client.id,
      subfolder_id: isFundamental ? null : subfolderId,
      scope: client.scope,
      owner_id: ownerId,
      is_fundamental: isFundamental,
    })
    .select()
    .single()
  if (error) throw error
  return data as DocumentRow
}

// ---------- GENERACIÓN DE DOCUMENTOS CON GEMINI ----------

export interface GeneratedAttachment {
  filename: string
  mimeType: string
  base64: string
}

export async function downloadDocumentAsBase64(
  doc: DocumentRow,
): Promise<GeneratedAttachment> {
  const bucket = bucketForScope(doc.scope)
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(doc.storage_path)
  if (error) throw error
  const base64 = await blobToBase64(data)
  return {
    filename: doc.name,
    mimeType: doc.mime_type ?? 'application/octet-stream',
    base64,
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Error leyendo archivo'))
    reader.readAsDataURL(blob)
  })
}

export interface GenerateDocumentInput {
  documentType: string
  params: Record<string, unknown>
  client: Client
  author: Profile | null
  officeAddress: string
  attachments: GeneratedAttachment[]
}

export async function generateDocumentWithAI(
  input: GenerateDocumentInput,
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('No hay sesión activa.')

  const res = await fetch('/api/generate-document', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      documentType: input.documentType,
      params: input.params,
      client: {
        name: input.client.name,
        cedula_rif: input.client.cedula_rif,
        phone: input.client.phone,
        address: input.client.address,
        client_type: input.client.client_type,
        capital_social: input.client.capital_social,
        registry_office: input.client.registry_office,
        registry_date: input.client.registry_date,
        registry_number: input.client.registry_number,
        registry_volume: input.client.registry_volume,
        shareholders: input.client.shareholders,
        legal_representatives: input.client.legal_representatives,
      },
      author: {
        full_name: input.author?.full_name ?? null,
        ipsa_number: input.author?.ipsa_number ?? null,
        phone: input.author?.phone ?? null,
        email: input.author?.email ?? null,
      },
      officeAddress: input.officeAddress,
      attachments: input.attachments,
    }),
  })
  if (!res.ok) {
    let err = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) err = body.error
    } catch {
      // ignore
    }
    throw new Error(err)
  }
  const data = (await res.json()) as { text: string }
  return data.text
}

export async function saveGeneratedDocumentAsFile(
  text: string,
  filename: string,
  client: Client,
  ownerId: string,
): Promise<DocumentRow> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'documento'
  const fullName = safe.endsWith('.txt') ? safe : `${safe}.txt`
  const file = new File([text], fullName, { type: 'text/plain;charset=utf-8' })
  return uploadDocument({
    file,
    client,
    subfolderId: null,
    ownerId,
    isFundamental: false,
  })
}

export async function getDocumentDownloadUrl(doc: DocumentRow): Promise<string> {
  const bucket = bucketForScope(doc.scope)
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(doc.storage_path, 60 * 5)
  if (error) throw error
  return data.signedUrl
}

export async function deleteDocument(doc: DocumentRow): Promise<void> {
  const bucket = bucketForScope(doc.scope)
  const { error: storageError } = await supabase.storage
    .from(bucket)
    .remove([doc.storage_path])
  if (storageError) throw storageError
  const { error } = await supabase.from('documents').delete().eq('id', doc.id)
  if (error) throw error
}

// ---------- PERFILES ----------

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Profile) ?? null
}

export async function upsertProfile(
  userId: string,
  email: string,
  values: {
    full_name: string | null
    phone: string | null
    ipsa_number: string | null
  },
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        full_name: values.full_name,
        phone: values.phone,
        ipsa_number: values.ipsa_number,
      },
      { onConflict: 'id' },
    )
    .select()
    .single()
  if (error) throw error
  return data as Profile
}

// ---------- PROPUESTAS ----------

export async function listClientProposals(clientId: string): Promise<Proposal[]> {
  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Proposal[]
}

export async function getProposal(proposalId: string): Promise<Proposal | null> {
  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle()
  if (error) throw error
  return (data as Proposal) ?? null
}

interface CreateProposalParams {
  clientId: string
  ownerId: string
  serviceType: string
  subService: string | null
  subServices: ProposalSubService[]
  description: string
  hours: number
  hourlyRate: number
  currency: string
  notes: string | null
  expenses: ProposalExpense[]
  honorariosItems: HonorariosItem[]
}

export async function createProposal(
  params: CreateProposalParams,
): Promise<Proposal> {
  const total = +(params.hours * params.hourlyRate).toFixed(2)
  const { data, error } = await supabase
    .from('proposals')
    .insert({
      client_id: params.clientId,
      owner_id: params.ownerId,
      service_type: params.serviceType,
      sub_service: params.subService,
      sub_services: params.subServices,
      description: params.description,
      hours: params.hours,
      hourly_rate: params.hourlyRate,
      total,
      currency: params.currency,
      notes: params.notes,
      expenses: params.expenses,
      honorarios_items: params.honorariosItems,
    })
    .select()
    .single()
  if (error) throw error
  return data as Proposal
}

export function expensesTotal(expenses: ProposalExpense[]): number {
  return +expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0).toFixed(2)
}

export function honorariosItemsTotal(items: HonorariosItem[]): number {
  return +items.reduce((acc, i) => acc + (Number(i.total) || 0), 0).toFixed(2)
}

export function proposalGrandTotal(p: Proposal): number {
  return +(
    Number(p.total) +
    honorariosItemsTotal(p.honorarios_items ?? []) +
    expensesTotal(p.expenses ?? [])
  ).toFixed(2)
}

export async function deleteProposal(id: string): Promise<void> {
  const { error } = await supabase.from('proposals').delete().eq('id', id)
  if (error) throw error
}

export function formatCurrency(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${currency} ${formatted}`
}

export function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
