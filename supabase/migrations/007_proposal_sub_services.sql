-- =============================================
-- Office Drive - Migración 007: Multi-selección de sub-servicios
-- =============================================
-- Las propuestas ahora pueden incluir varios "actos" dentro de un
-- mismo servicio principal (ej: Acta de Asamblea con varios tipos de
-- acto al mismo tiempo). Se almacenan en `sub_services` como un
-- arreglo JSON con la forma:
--   [
--     { "key": "aumento_capital", "label": "Aumento de Capital", "description": "..." },
--     { "key": "venta_acciones", "label": "Venta de Acciones", "description": "..." }
--   ]
--
-- La columna existente `sub_service` (text) se mantiene por
-- compatibilidad con las propuestas antiguas y se rellena con el
-- primer key seleccionado.

alter table public.proposals
  add column if not exists sub_services jsonb not null default '[]'::jsonb;
