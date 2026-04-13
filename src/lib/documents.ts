import { supabase, PERSONAL_BUCKET, SHARED_BUCKET } from './supabase'

export interface DocumentRow {
  id: string
  name: string
  storage_path: string
  size: number | null
  mime_type: string | null
  owner_id: string
  folder_id: string | null
  is_personal: boolean
  created_at: string
}

export interface FolderRow {
  id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
}

export async function listPersonalDocuments(userId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('is_personal', true)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRow[]
}

export async function listFolderDocuments(folderId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('folder_id', folderId)
    .eq('is_personal', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRow[]
}

export async function listFolders() {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as FolderRow[]
}

export async function createFolder(name: string, description: string | null, userId: string) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ name, description, created_by: userId })
    .select()
    .single()
  if (error) throw error
  return data as FolderRow
}

export async function deleteFolder(id: string) {
  const { error } = await supabase.from('folders').delete().eq('id', id)
  if (error) throw error
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function uploadPersonalDocument(file: File, userId: string) {
  const path = `${userId}/${Date.now()}-${sanitizeFilename(file.name)}`
  const { error: uploadError } = await supabase.storage
    .from(PERSONAL_BUCKET)
    .upload(path, file, { upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('documents')
    .insert({
      name: file.name,
      storage_path: path,
      size: file.size,
      mime_type: file.type,
      owner_id: userId,
      is_personal: true,
    })
    .select()
    .single()
  if (error) throw error
  return data as DocumentRow
}

export async function uploadSharedDocument(file: File, folderId: string, userId: string) {
  const path = `${folderId}/${Date.now()}-${sanitizeFilename(file.name)}`
  const { error: uploadError } = await supabase.storage
    .from(SHARED_BUCKET)
    .upload(path, file, { upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('documents')
    .insert({
      name: file.name,
      storage_path: path,
      size: file.size,
      mime_type: file.type,
      owner_id: userId,
      folder_id: folderId,
      is_personal: false,
    })
    .select()
    .single()
  if (error) throw error
  return data as DocumentRow
}

export async function getDocumentDownloadUrl(doc: DocumentRow) {
  const bucket = doc.is_personal ? PERSONAL_BUCKET : SHARED_BUCKET
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(doc.storage_path, 60 * 5)
  if (error) throw error
  return data.signedUrl
}

export async function deleteDocument(doc: DocumentRow) {
  const bucket = doc.is_personal ? PERSONAL_BUCKET : SHARED_BUCKET
  const { error: storageError } = await supabase.storage.from(bucket).remove([doc.storage_path])
  if (storageError) throw storageError
  const { error } = await supabase.from('documents').delete().eq('id', doc.id)
  if (error) throw error
}

export function formatSize(bytes: number | null) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
