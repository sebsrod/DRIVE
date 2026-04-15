-- =============================================
-- Office Drive - Migración 008: Documentos fundamentales
-- =============================================
-- Los documentos fundamentales son los documentos base del cliente
-- (documento constitutivo, cédulas de los representantes, poderes,
-- etc.) que se usan como contexto cuando la IA genera documentos
-- nuevos. Viven en la tabla documents pero con un flag propio para
-- separarlos del expediente general.

alter table public.documents
  add column if not exists is_fundamental boolean not null default false;

create index if not exists documents_fundamental_idx
  on public.documents(client_id, is_fundamental);
