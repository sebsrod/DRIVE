-- =============================================
-- Office Drive - Migración 014: Cantidad total de acciones
-- =============================================
-- Para personas jurídicas, almacenamos la cantidad total de
-- acciones de la compañía. Esto permite calcular en la app:
--   - Valor nominal por acción = capital_social / total_shares
--   - N° de acciones de cada accionista = porcentaje * total_shares / 100

alter table public.clients
  add column if not exists total_shares numeric;
