-- =============================================
-- Office Drive - Migración 005: Gastos en propuestas
-- =============================================
-- Añade un campo `expenses` (JSONB) a la tabla de propuestas para
-- almacenar la lista de gastos seleccionados por el usuario al
-- generar la propuesta. Cada elemento tiene la forma:
--   { "label": "Aranceles de registro", "amount": 250 }

alter table public.proposals
  add column if not exists expenses jsonb not null default '[]'::jsonb;
