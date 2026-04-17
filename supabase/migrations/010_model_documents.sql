-- =============================================
-- Office Drive - Migración 010: Modelos de estilo y guía de redacción
-- =============================================
-- Los usuarios pueden subir documentos "modelo" (PDFs de ejemplo) que
-- la IA analizará para aprender su estilo de redacción. El estilo
-- extraído se guarda en profiles.writing_style para no tener que
-- re-analizarlo cada vez que se genera un documento.

-- Documentos modelo (por usuario, no atados a un cliente)
create table if not exists public.model_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists model_documents_owner_idx
  on public.model_documents(owner_id);

alter table public.model_documents enable row level security;

drop policy if exists "model_docs_select_own" on public.model_documents;
create policy "model_docs_select_own" on public.model_documents
  for select using (owner_id = auth.uid());

drop policy if exists "model_docs_insert_own" on public.model_documents;
create policy "model_docs_insert_own" on public.model_documents
  for insert with check (owner_id = auth.uid());

drop policy if exists "model_docs_delete_own" on public.model_documents;
create policy "model_docs_delete_own" on public.model_documents
  for delete using (owner_id = auth.uid());

-- Estilo de redacción persistido en el perfil
alter table public.profiles
  add column if not exists writing_style text;
