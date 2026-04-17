-- =============================================
-- Office Drive - Migración 011: Duración y cargos de la Junta Directiva
-- =============================================
-- Para personas jurídicas añadimos la duración del período de la
-- Junta Directiva. El cargo de cada miembro se guarda dentro del
-- jsonb legal_representatives (no requiere migración de esquema).

alter table public.clients
  add column if not exists board_duration text;
