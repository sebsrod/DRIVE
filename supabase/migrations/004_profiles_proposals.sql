-- =============================================
-- Office Drive - Migración 004: Perfiles ampliados + Propuestas
-- =============================================

-- ---------- PROFILES: nuevos campos ----------

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists ipsa_number text;

-- Permitir UPSERT del propio perfil (insert) por si el trigger no lo creó
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- ---------- PROPUESTAS DE SERVICIOS ----------

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  service_type text not null,
  sub_service text,
  description text not null,
  hours numeric(10, 2) not null check (hours >= 0),
  hourly_rate numeric(14, 2) not null check (hourly_rate >= 0),
  total numeric(16, 2) not null check (total >= 0),
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists proposals_client_idx on public.proposals(client_id);

alter table public.proposals enable row level security;

drop policy if exists "proposals_select" on public.proposals;
create policy "proposals_select" on public.proposals
  for select using (
    exists (
      select 1 from public.clients c
      where c.id = proposals.client_id
        and (
          (c.scope = 'private' and c.owner_id = auth.uid()) or
          (c.scope = 'team' and auth.role() = 'authenticated')
        )
    )
  );

drop policy if exists "proposals_insert" on public.proposals;
create policy "proposals_insert" on public.proposals
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

drop policy if exists "proposals_delete" on public.proposals;
create policy "proposals_delete" on public.proposals
  for delete using (
    owner_id = auth.uid() or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
