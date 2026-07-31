-- Captura de identidad (cédula, dirección de referencia, datos de empresa) y
-- el modelo de cobro real: primer pago prorrateado + vencimiento el día 10 de
-- cada mes calendario desde el tercer período (ver lib/computeValidUntil.js).

alter table tenants add column if not exists reference_address text;
alter table tenants add column if not exists id_photo_front_path text; -- ruta en el bucket privado "tenant-documents"
alter table tenants add column if not exists id_photo_back_path text;

comment on column tenants.reference_address is 'Dirección de referencia entregada al momento de tomar la bodega.';
comment on column tenants.id_photo_front_path is 'Ruta (no URL pública) en el bucket privado tenant-documents — cédula anverso.';
comment on column tenants.id_photo_back_path is 'Ruta (no URL pública) en el bucket privado tenant-documents — cédula reverso.';

-- ─────────────────────────────────────────────────────────────────────────
-- tenant_companies — datos de empresa, 1-a-1 opcional con tenants. Separado
-- en vez de columnas nullable en tenants: la mayoría de los arrendatarios
-- son persona natural y no necesitan estos campos.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists tenant_companies (
  tenant_id       uuid primary key references tenants(id) on delete cascade,
  company_rut     text not null,
  razon_social    text not null,
  giro            text,
  company_address text,
  legal_rep_rut   text not null,
  legal_rep_name  text not null,
  company_email   text,
  created_at      timestamptz not null default now()
);

comment on table tenant_companies is 'Datos de empresa cuando el arrendatario arrienda a nombre de una empresa (rut, razón social, giro, representante legal).';

alter table rentals add column if not exists rental_term text not null default 'mensual'
  check (rental_term in ('mensual', 'diario'));

comment on column rentals.rental_term is 'mensual = plazo mínimo 3 meses (solo advertencia visual). diario = arriendo por día, sin plazo mínimo ni ciclo de facturación mensual.';

alter table contracts add column if not exists sent_at timestamptz;
alter table contracts add column if not exists payment_deadline timestamptz; -- sent_at + 24h; informativo, no cancela nada automáticamente

comment on column contracts.payment_deadline is 'sent_at + 24h. Si se vence sin pago, el panel muestra una alarma — no hay cancelación automática, el administrador decide.';
