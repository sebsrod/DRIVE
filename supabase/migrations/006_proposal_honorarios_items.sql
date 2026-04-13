-- =============================================
-- Office Drive - Migración 006: Servicios complementarios
-- =============================================
-- Las propuestas pueden incluir servicios adicionales con sus propios
-- honorarios (horas, costo por hora, total) además del servicio
-- principal. Se almacenan en `honorarios_items` como un arreglo JSON
-- con la forma:
--   [
--     {
--       "key": "registro_libros",
--       "label": "Registro de Libros",
--       "description": "...",
--       "hours": 2,
--       "rate": 80,
--       "total": 160
--     }
--   ]

alter table public.proposals
  add column if not exists honorarios_items jsonb not null default '[]'::jsonb;
