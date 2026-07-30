-- Migración: facturas/multas con autorización, cargos por bodega, contratos.
-- Ejecutar completo en Supabase Dashboard → SQL Editor → Run.
-- Es aditiva: no toca warehouses/tenants/rentals/payments/access_control_log.

-- ─────────────────────────────────────────────────────────────────────────
-- invoices — facturas de multa por atraso. Se generan cuando un arriendo
-- lleva días vencido, y quedan en 'pending_authorization' hasta que un
-- admin las autoriza (nunca se cobran solas). Una vez autorizadas se pueden
-- pagar (vía pago manual del admin) y quedan enlazadas al payment que las
-- saldó.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists invoices (
  id                  uuid primary key default gen_random_uuid(),
  rental_id           uuid not null references rentals(id) on delete restrict,
  base_amount         integer not null check (base_amount >= 0),   -- mensualidad adeudada
  late_fee_amount     integer not null default 0 check (late_fee_amount >= 0), -- multa ($15.000/día)
  days_late           integer not null default 0 check (days_late >= 0),
  total_amount        integer not null check (total_amount >= 0),
  status              text not null default 'pending_authorization'
                        check (status in ('pending_authorization', 'authorized', 'paid', 'cancelled')),
  authorized_by       text,
  authorized_at       timestamptz,
  payment_id          uuid references payments(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table invoices is 'Facturas de multa por atraso (mensualidad + multa diaria), requieren autorización de un admin antes de poder cobrarse.';

create index if not exists invoices_rental_id_idx on invoices(rental_id);
create index if not exists invoices_status_idx on invoices(status);
-- una sola factura de atraso "viva" (no pagada/cancelada) por arriendo a la vez
create unique index if not exists invoices_one_open_per_rental_idx on invoices(rental_id)
  where status in ('pending_authorization', 'authorized');

drop trigger if exists invoices_set_updated_at on invoices;
create trigger invoices_set_updated_at
  before update on invoices
  for each row
  execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- warehouse_charges — cargos asociados a una bodega (flete, consumo eléctrico,
-- etc.). 'consumo' se genera desde la página pública de carga de consumo
-- (consumption × $300); 'manual' se crea desde la ficha de la bodega.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists warehouse_charges (
  id                uuid primary key default gen_random_uuid(),
  warehouse_id      uuid not null references warehouses(id) on delete restrict,
  charge_type       text not null default 'manual' check (charge_type in ('manual', 'consumo')),
  description       text not null,               -- ej. "Traslado flete a Temuco"
  consumption       numeric(10, 2),               -- solo si charge_type = 'consumo'
  amount            integer not null check (amount > 0),
  status            text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_by        text,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now()
);

comment on table warehouse_charges is 'Cargos adicionales por bodega (flete, consumo eléctrico a $300/unidad, etc.), pendientes de confirmar antes de facturarse.';

create index if not exists warehouse_charges_warehouse_id_idx on warehouse_charges(warehouse_id);
create index if not exists warehouse_charges_status_idx on warehouse_charges(status);

-- ─────────────────────────────────────────────────────────────────────────
-- contracts — contrato generado desde una plantilla para un arriendo
-- específico. Flujo: draft → sent_for_signature → signed (con el PDF
-- firmado adjunto). `esignature_provider`/`esignature_envelope_id` quedan
-- null mientras se usa el modo manual (subir PDF ya firmado); se llenan
-- cuando se conecte un proveedor real de firma electrónica.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists contracts (
  id                      uuid primary key default gen_random_uuid(),
  rental_id               uuid not null references rentals(id) on delete restrict,
  warehouse_id            uuid not null references warehouses(id) on delete restrict,
  tenant_id               uuid not null references tenants(id) on delete restrict,
  content                 text not null,          -- contrato generado (texto) desde la plantilla
  status                  text not null default 'draft'
                            check (status in ('draft', 'sent_for_signature', 'signed', 'cancelled')),
  esignature_provider     text,                    -- null = modo manual; futuro: 'docusign', 'firmafacil', etc.
  esignature_envelope_id  text,                    -- id externo del proveedor real, cuando exista
  signed_pdf_path         text,                    -- path en Supabase Storage (bucket "contracts")
  signed_at               timestamptz,
  created_by              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table contracts is 'Contrato generado desde plantilla por arriendo. Preparado para firma electrónica real (proveedor externo) — hoy opera en modo manual: se sube el PDF ya firmado por fuera del sistema.';

create index if not exists contracts_rental_id_idx on contracts(rental_id);
create index if not exists contracts_warehouse_id_idx on contracts(warehouse_id);
create index if not exists contracts_status_idx on contracts(status);

drop trigger if exists contracts_set_updated_at on contracts;
create trigger contracts_set_updated_at
  before update on contracts
  for each row
  execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — mismo patrón que el resto: enabled, sin policies (deny-all para
-- anon/authenticated). El backend usa service_role, que ignora RLS.
-- ─────────────────────────────────────────────────────────────────────────
alter table invoices enable row level security;
alter table warehouse_charges enable row level security;
alter table contracts enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- Storage — bucket privado para los PDF de contratos firmados. Ya creado
-- directo vía Storage API (no requiere correr esto), se deja por si hay
-- que recrearlo. Privado (no público): se sirve siempre a través de una
-- URL firmada generada por el backend con service_role.
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
