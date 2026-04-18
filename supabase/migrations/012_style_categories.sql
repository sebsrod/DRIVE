-- =============================================
-- Office Drive - Migración 012: Categorías de modelos y guías de estilo
-- =============================================
-- Los documentos modelo se categorizan por tipo (documento constitutivo,
-- acta de asamblea, poder, contrato). Cada categoría se analiza por
-- separado y se guarda una guía de estilo independiente en
-- profiles.writing_styles (jsonb con una clave por categoría).
--
-- Se mantiene profiles.writing_style (text) de la migración 010 como
-- fallback legacy hasta que el usuario genere guías por categoría.

alter table public.model_documents
  add column if not exists category text;

create index if not exists model_documents_category_idx
  on public.model_documents(owner_id, category);

alter table public.profiles
  add column if not exists writing_styles jsonb not null default '{}'::jsonb;
