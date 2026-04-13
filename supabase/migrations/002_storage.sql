-- =============================================
-- Office Drive - Buckets de Storage y políticas
-- =============================================

-- Crear buckets (privados)
insert into storage.buckets (id, name, public)
values ('personal-documents', 'personal-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('shared-documents', 'shared-documents', false)
on conflict (id) do nothing;

-- =============================================
-- Políticas para bucket personal-documents
-- Cada usuario solo accede a su propia carpeta (nombre = su user id)
-- =============================================

drop policy if exists "personal_select_own" on storage.objects;
create policy "personal_select_own" on storage.objects
  for select using (
    bucket_id = 'personal-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "personal_insert_own" on storage.objects;
create policy "personal_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'personal-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "personal_delete_own" on storage.objects;
create policy "personal_delete_own" on storage.objects
  for delete using (
    bucket_id = 'personal-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- =============================================
-- Políticas para bucket shared-documents
-- Todo autenticado puede ver y subir; solo dueño/admin pueden borrar
-- =============================================

drop policy if exists "shared_select" on storage.objects;
create policy "shared_select" on storage.objects
  for select using (
    bucket_id = 'shared-documents'
    and auth.role() = 'authenticated'
  );

drop policy if exists "shared_insert" on storage.objects;
create policy "shared_insert" on storage.objects
  for insert with check (
    bucket_id = 'shared-documents'
    and auth.role() = 'authenticated'
  );

drop policy if exists "shared_delete" on storage.objects;
create policy "shared_delete" on storage.objects
  for delete using (
    bucket_id = 'shared-documents'
    and (
      owner = auth.uid()
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    )
  );
