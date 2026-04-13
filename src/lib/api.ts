import { supabase, PERSONAL_BUCKET, SHARED_BUCKET } from './supabase'

export type Scope = 'private' | 'team'

export interface Client {
  id: string
  name: string
  cedula_rif: string | null
  phone: string | null
  address: string | null
  scope: Scope
  owner_id: string
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
    name: string
    cedula_rif?: string | null
    phone?: string | null
    address?: string | null
  },
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      scope,
      owner_id: ownerId,
      name: values.name,
      cedula_rif: values.cedula_rif || null,
      phone: values.phone || null,
      address: values.address || null,
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
  // documentos en la raíz del cliente (subfolder_id = null)
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('client_id', clientId)
    .is('subfolder_id', null)
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
}

export async function uploadDocument({
  file,
  client,
  subfolderId,
  ownerId,
}: UploadParams): Promise<DocumentRow> {
  const bucket = bucketForScope(client.scope)
  const folderSegment = subfolderId ?? '_root'
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
      subfolder_id: subfolderId,
      scope: client.scope,
      owner_id: ownerId,
    })
    .select()
    .single()
  if (error) throw error
  return data as DocumentRow
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

export function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
