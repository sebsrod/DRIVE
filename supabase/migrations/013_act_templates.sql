-- =============================================
-- Office Drive - Migración 013: Plantillas de actos por usuario
-- =============================================
-- Cada usuario puede tener plantillas textuales extraídas de sus
-- modelos, una por cada tipo de acto (ej: "aumento_capital",
-- "nombramiento_junta_directiva", "encabezado_acta", etc.).
-- Las plantillas incluyen placeholders como {{capital_anterior}},
-- {{nombre_accionista}} que se sustituyen con datos reales al generar.
--
-- Adicionalmente se guarda una plantilla de "estructura general" del
-- documento (encabezado, cierre, formato de convocatoria, etc.).

create table if not exists public.act_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  act_key text not null,
  act_label text not null,
  template_text text not null,
  placeholders text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, category, act_key)
);

create index if not exists act_templates_owner_idx
  on public.act_templates(owner_id, category);

alter table public.act_templates enable row level security;

drop policy if exists "act_templates_select_own" on public.act_templates;
create policy "act_templates_select_own" on public.act_templates
  for select using (owner_id = auth.uid());

drop policy if exists "act_templates_insert_own" on public.act_templates;
create policy "act_templates_insert_own" on public.act_templates
  for insert with check (owner_id = auth.uid());

drop policy if exists "act_templates_update_own" on public.act_templates;
create policy "act_templates_update_own" on public.act_templates
  for update using (owner_id = auth.uid());

drop policy if exists "act_templates_delete_own" on public.act_templates;
create policy "act_templates_delete_own" on public.act_templates
  for delete using (owner_id = auth.uid());
