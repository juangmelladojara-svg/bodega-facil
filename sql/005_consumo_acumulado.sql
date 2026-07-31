-- El consumo se carga como lectura acumulada de medidor (como luz/agua), no
-- como delta manual: se cobra la diferencia contra la última lectura
-- registrada, no el número completo cada vez.

alter table warehouses add column if not exists last_meter_reading numeric(10, 2) not null default 0;
comment on column warehouses.last_meter_reading is 'Última lectura de consumo registrada para esta bodega (acumulada). Se usa para calcular el delta a cobrar en la próxima carga.';

alter table warehouse_charges add column if not exists meter_reading numeric(10, 2);
comment on column warehouse_charges.meter_reading is 'Lectura acumulada del medidor al momento de este cargo (solo charge_type=consumo). `consumption` guarda el delta efectivamente cobrado.';
