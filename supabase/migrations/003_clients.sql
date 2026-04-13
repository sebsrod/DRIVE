-- =============================================
-- Office Drive - Migración 003: Modelo de Clientes
-- =============================================
-- Reemplaza el modelo anterior (folders + documents con is_personal)
-- por uno basado en clientes con subcarpetas.
--
-- IMPORTANTE: Esta migración elimina los datos de las tablas
-- `folders` y `documents` originales. Si hay archivos en los buckets
-- de storage, no se borran automáticamente; bórralos manualmente
-- desde la UI de Supabase si quieres limpiar.

drop table if exists public.documents cascade;
drop table if exists public.folders cascade;

-- ---------- CLIENTES ----------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cedula_rif text,
  phone text,
  address text,
  scope text not null check (scope in ('private', 'team')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists clients_scope_owner_idx on public.clients(scope, owner_id);

-- ---------- SUBCARPETAS DEL CLIENTE ----------

create table public.client_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_folders_client_idx on public.client_folders(client_id);

-- ---------- DOCUMENTOS ----------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null,
  size bigint,
  mime_type text,
  client_id uuid not null references public.clients(id) on delete cascade,
  subfolder_id uuid references public.client_folders(id) on delete cascade,
  scope text not null check (scope in ('private', 'team')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists documents_client_idx on public.documents(client_id);
create index if not exists documents_subfolder_idx on public.documents(subfolder_id);

-- ---------- RLS ----------

alter table public.clients enable row level security;
alter table public.client_folders enable row level security;
alter table public.documents enable row level security;

-- CLIENTES
drop policy if exists "clients_select" on public.clients;
create policy "clients_select" on public.clients
  for select using (
    (scope = 'private' and owner_id = auth.uid()) or
    (scope = 'team' and auth.role() = 'authenticated')
  );

drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert" on public.clients
  for insert with check (owner_id = auth.uid());

drop policy if exists "clients_update" on public.clients;
create policy "clients_update" on public.clients
  for update using (
    owner_id = auth.uid() or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "clients_delete" on public.clients;
create policy "clients_delete" on public.clients
  for delete using (
    owner_id = auth.uid() or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- SUBCARPETAS (heredan visibilidad del cliente)
drop policy if exists "client_folders_select" on public.client_folders;
create policy "client_folders_select" on public.client_folders
  for select using (
    exists (
      select 1 from public.clients c
      where c.id = client_folders.client_id
        and (
          (c.scope = 'private' and c.owner_id = auth.uid()) or
          (c.scope = 'team' and auth.role() = 'authenticated')
        )
    )
  );

drop policy if exists "client_folders_insert" on public.client_folders;
create policy "client_folders_insert" on public.client_folders
  for insert with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and (
          (c.scope = 'private' and c.owner_id = auth.uid()) or
          (c.scope = 'team' and auth.role() = 'authenticated')
        )
    )
  );

drop policy if exists "client_folders_delete" on public.client_folders;
create policy "client_folders_delete" on public.client_folders
  for delete using (
    exists (
      select 1 from public.clients c
      where c.id = client_folders.client_id
        and (
          c.owner_id = auth.uid() or
          exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
        )
    )
  );

-- DOCUMENTOS
drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (
    exists (
      select 1 from public.clients c
      where c.id = documents.client_id
        and (
          (c.scope = 'private' and c.owner_id = auth.uid()) or
          (c.scope = 'team' and auth.role() = 'authenticated')
        )
    )
  );

drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (
    owner_id = auth.uid() and
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and (
          (c.scope = 'private' and c.owner_id = auth.uid()) or
          (c.scope = 'team' and auth.role() = 'authenticated')
        )
    )
  );

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (
    owner_id = auth.uid() or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
