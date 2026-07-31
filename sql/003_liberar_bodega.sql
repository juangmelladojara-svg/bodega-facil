-- Permite terminar un arriendo y liberar la bodega para un nuevo arrendatario,
-- conservando el historial (pagos, cargos, contrato) del arriendo anterior.
--
-- Antes: `unique (warehouse_id)` en `rentals` significaba que una bodega
-- solo podía tener UN arriendo en toda su vida. Ahora: unique parcial que
-- solo exige unicidad entre arriendos NO terminados — puede haber varios
-- arriendos históricos ('ended') para la misma bodega, pero nunca dos
-- activos a la vez.

alter table rentals add column if not exists ended_at timestamptz;

do $$
declare
  cons text;
begin
  select conname into cons
  from pg_constraint
  where conrelid = 'rentals'::regclass
    and contype = 'u'
    and conkey = (
      select array_agg(attnum)
      from pg_attribute
      where attrelid = 'rentals'::regclass and attname = 'warehouse_id'
    );
  if cons is not null then
    execute format('alter table rentals drop constraint %I', cons);
  end if;
end $$;

alter table rentals drop constraint if exists rentals_status_check;
alter table rentals add constraint rentals_status_check
  check (status in ('inactive', 'active', 'overdue', 'suspended', 'ended'));

create unique index if not exists rentals_warehouse_active_idx
  on rentals(warehouse_id)
  where status <> 'ended';

comment on column rentals.ended_at is 'Cuándo se terminó el arriendo (liberó la bodega). Null mientras está vigente.';
