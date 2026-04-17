-- =============================================
-- Office Drive - Migración 009: Persona natural / jurídica
-- =============================================
-- Los clientes pueden ser persona natural (individual) o persona
-- jurídica (sociedad mercantil). Para las jurídicas guardamos
-- adicionalmente los datos de registro, el capital social y las
-- listas de accionistas y representantes legales.

alter table public.clients
  add column if not exists client_type text not null default 'natural'
    check (client_type in ('natural', 'juridica')),
  add column if not exists capital_social text,
  add column if not exists registry_office text,
  add column if not exists registry_date date,
  add column if not exists registry_number text,
  add column if not exists registry_volume text,
  add column if not exists shareholders jsonb not null default '[]'::jsonb,
  add column if not exists legal_representatives jsonb not null default '[]'::jsonb;
