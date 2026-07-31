-- Bodegar Fácil — Control de acceso
-- Esquema inicial. Ejecutar en el SQL editor de Supabase o vía `supabase db push`.
--
-- Modelo de acceso: TODAS las tablas se consultan exclusivamente desde el backend
-- (Next.js API routes) usando la service_role key, que ignora RLS por diseño.
-- RLS se deja ENABLED sin policies para anon/authenticated como defensa en profundidad:
-- si alguna vez se expone la anon key al cliente, nadie puede leer/escribir estas tablas
-- directamente sin pasar por la lógica de negocio del backend.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────
-- warehouses — bodegas físicas, cada una atada a un patio controlado por ISAPI
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists warehouses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,           -- ej. "B-014"
  name          text not null,                  -- ej. "Bodega 014 · 36 m³"
  gate_id       smallint not null check (gate_id in (1, 2)), -- patio físico (2 accesos)
  size_m3       numeric(8, 2),
  monthly_amount integer not null check (monthly_amount > 0), -- CLP, sin decimales
  created_at    timestamptz not null default now()
);

comment on table warehouses is 'Bodegas físicas y su patio asociado (gate_id 1 o 2).';

-- ─────────────────────────────────────────────────────────────────────────
-- tenants — arrendatarios
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  rut         text not null unique,             -- normalizado sin puntos, con guión
  full_name   text not null,
  phone       text,
  email       text,
  created_at  timestamptz not null default now()
);

comment on table tenants is 'Arrendatarios identificados por RUT.';

-- ─────────────────────────────────────────────────────────────────────────
-- rentals — relación arrendatario ↔ bodega ↔ tarjeta física
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists rentals (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete restrict,
  warehouse_id          uuid not null references warehouses(id) on delete restrict,
  card_uid              text,                   -- UID físico de la tarjeta RFID (EM/MIFARE, por confirmar)
  controller_person_id  text,                   -- ID asignado por el DS-K2602T al hacer createPerson
  monthly_amount        integer not null check (monthly_amount > 0),
  status                text not null default 'inactive'
                          check (status in ('inactive', 'active', 'overdue', 'suspended', 'ended')),
  valid_until           timestamptz,            -- vigencia actual de la tarjeta en el controlador
  ended_at              timestamptz,            -- cuándo se terminó el arriendo (liberó la bodega); null mientras está vigente
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table rentals is 'Arriendo de una bodega: quién, qué tarjeta, hasta cuándo tiene acceso. Una bodega puede acumular varios arriendos históricos (status=ended); solo uno no-terminado a la vez.';

-- Unicidad parcial: como máximo un arriendo NO terminado por bodega. Permite
-- conservar el historial de arriendos anteriores (pagos/cargos/contrato)
-- después de liberar la bodega para un nuevo arrendatario.
create unique index if not exists rentals_warehouse_active_idx
  on rentals(warehouse_id) where status <> 'ended';

create index if not exists rentals_tenant_id_idx on rentals(tenant_id);
create index if not exists rentals_status_idx on rentals(status);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = '';

drop trigger if exists rentals_set_updated_at on rentals;
create trigger rentals_set_updated_at
  before update on rentals
  for each row
  execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- payments — historial de pagos Webpay Plus
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists payments (
  id                  uuid primary key default gen_random_uuid(),
  rental_id           uuid not null references rentals(id) on delete restrict,
  method              text not null default 'webpay'
                        check (method in ('webpay', 'manual')),
  webpay_token        text unique,               -- clave de idempotencia frente a reintentos (solo method='webpay')
  buy_order           text,
  session_id          text,
  amount              integer not null check (amount > 0),
  status              text not null default 'pending'
                        -- 'committing': reclamado por un request que está llamando a Transbank
                        -- ahora mismo (ver app/api/payments/confirm/route.js) — evita que dos
                        -- POSTs concurrentes de Webpay hagan doble commit o pisen un 'confirmed'.
                        check (status in ('pending', 'committing', 'confirmed', 'failed')),
  authorization_code  text,
  transaction_date    timestamptz,
  period_start        timestamptz,              -- vigencia que este pago cubre (desde)
  period_end          timestamptz,              -- vigencia que este pago cubre (hasta)
  synced_at           timestamptz,              -- se setea cuando access_control_log registra un sync exitoso para este pago
  registered_by       text,                      -- email del admin que registró un pago manual
  notes               text,                      -- ej. "efectivo", "transferencia 12345"
  created_at          timestamptz not null default now()
);

comment on table payments is 'Historial de pagos (Webpay o registrados manualmente por un admin). webpay_token es la clave de idempotencia para method=webpay; Postgres permite múltiples NULL en una columna unique, así que los pagos manuales no chocan entre sí.';

create index if not exists payments_rental_id_idx on payments(rental_id);
create index if not exists payments_status_idx on payments(status);
-- pagos confirmados que todavía no sincronizaron con el controlador (cron de reintento)
create index if not exists payments_pending_sync_idx on payments(status) where synced_at is null;

-- ─────────────────────────────────────────────────────────────────────────
-- access_control_log — auditoría de cada llamada ISAPI al controlador
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists access_control_log (
  id                uuid primary key default gen_random_uuid(),
  rental_id         uuid references rentals(id) on delete set null,
  payment_id        uuid references payments(id) on delete set null,
  action            text not null
                      check (action in ('create_person', 'add_card', 'extend_validity', 'revoke_access')),
  request_payload   jsonb,
  response_payload  jsonb,
  success           boolean not null,
  error_message     text,
  created_at        timestamptz not null default now()
);

comment on table access_control_log is 'Auditoría de cada llamada ISAPI: qué se envió, qué respondió el controlador, éxito/fallo. Clave para debug en terreno.';

create index if not exists access_control_log_rental_id_idx on access_control_log(rental_id);
create index if not exists access_control_log_payment_id_idx on access_control_log(payment_id);
create index if not exists access_control_log_success_idx on access_control_log(success);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — enabled, sin policies (deny-all para anon/authenticated).
-- El backend usa service_role, que ignora RLS.
-- ─────────────────────────────────────────────────────────────────────────
alter table warehouses enable row level security;
alter table tenants enable row level security;
alter table rentals enable row level security;
alter table payments enable row level security;
alter table access_control_log enable row level security;

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
  payment_id        uuid references payments(id) on delete set null, -- se setea al reservarlo para un cobro; null = todavía no facturado
  created_at        timestamptz not null default now()
);

comment on table warehouse_charges is 'Cargos adicionales por bodega (flete, consumo eléctrico a $300/unidad, etc.). Se suman a la mensualidad al cobrar; payment_id marca cuáles ya se facturaron.';

create index if not exists warehouse_charges_warehouse_id_idx on warehouse_charges(warehouse_id);
create index if not exists warehouse_charges_status_idx on warehouse_charges(status);
-- cargos confirmados y todavía no facturados, por bodega (lookup del monto a cobrar)
create index if not exists warehouse_charges_unbilled_idx on warehouse_charges(warehouse_id)
  where status = 'confirmed' and payment_id is null;

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

alter table invoices enable row level security;
alter table warehouse_charges enable row level security;
alter table contracts enable row level security;

-- Storage — bucket privado para los PDF de contratos firmados. Se sirve
-- siempre vía URL firmada generada por el backend con service_role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
