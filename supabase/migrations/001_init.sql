-- =============================================
-- Office Drive - Esquema inicial de base de datos
-- =============================================

-- 1. PROFILES: datos públicos del usuario
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

-- 2. FOLDERS: carpetas compartidas para toda la oficina
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. DOCUMENTS: metadatos de archivos (el contenido se guarda en Storage)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null,
  size bigint,
  mime_type text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete cascade,
  is_personal boolean not null default true,
  created_at timestamptz not null default now(),
  constraint documents_folder_required check (
    (is_personal = true and folder_id is null) or
    (is_personal = false and folder_id is not null)
  )
);

create index if not exists documents_owner_idx on public.documents(owner_id);
create index if not exists documents_folder_idx on public.documents(folder_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;

-- Profiles: cualquier autenticado puede ver perfiles; cada uno modifica el suyo
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Folders: cualquier autenticado ve y crea; solo dueño o admin elimina
drop policy if exists "folders_select" on public.folders;
create policy "folders_select" on public.folders
  for select using (auth.role() = 'authenticated');

drop policy if exists "folders_insert" on public.folders;
create policy "folders_insert" on public.folders
  for insert with check (auth.uid() = created_by);

drop policy if exists "folders_delete" on public.folders;
create policy "folders_delete" on public.folders
  for delete using (
    created_by = auth.uid() or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Documents:
--   personal -> solo visible/editable por el dueño
--   compartido -> visible a todo autenticado, editable por dueño o admin
drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (
    (is_personal = true and owner_id = auth.uid()) or
    (is_personal = false and auth.role() = 'authenticated')
  );

drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (owner_id = auth.uid());

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (
    owner_id = auth.uid() or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- =============================================
-- Trigger: crear profile automáticamente al registrarse
-- =============================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
