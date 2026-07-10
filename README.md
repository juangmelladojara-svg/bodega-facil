# Bodega Fácil — sitio + control de acceso

Un solo proyecto Next.js que sirve todo bajo el mismo dominio:

- **Landing pública** (`content/index.html`, `public/valores.html`): HTML estático
  hecho a mano (GSAP por CDN, sin build), servido tal cual — `/` pasa por
  [`app/route.js`](./app/route.js), `valores.html` se sirve directo desde `public/`.
- **Portal de control de acceso** (`/checkout`, `/api/*`): cobro mensual (Webpay
  Plus) vinculado a la habilitación automática de tarjetas RFID en 2 portones
  (controlador Hikvision DS-K2602T vía ISAPI). Ver [`CONTEXTO.md`](./CONTEXTO.md)
  para el detalle completo de arquitectura y flujo de negocio de esta parte.

La landing y el portal son deliberadamente independientes en estilos (la landing
usa su propio CSS inline "Organic Tech/industrial"; el portal usa Tailwind v4) —
comparten dominio y despliegue, no diseño ni componentes.

## Arquitectura en una línea

Pago confirmado en Webpay → se guarda en Supabase **siempre** → se intenta extender
la vigencia de la tarjeta en el controlador vía ISAPI → si el controlador no
responde, queda en `access_control_log` con `success=false` y un cron lo reintenta.
El pago nunca depende de que el hardware esté en línea.

## Setup local

```bash
npm install
cp .env.example .env.local   # completar valores (ver comentarios en el archivo)
npm run dev
```

Con `ISAPI_MOCK=true` (default) el flujo de pago completo se puede probar de punta
a punta sin controlador conectado — `lib/isapi.js` simula respuestas exitosas sobre
un store en memoria.

Con `TRANSBANK_ENVIRONMENT=integration` (default) los pagos usan las credenciales
públicas de prueba de Transbank — no mueven dinero real y no requieren afiliación.

## Datos de prueba

El esquema (`sql/schema.sql`) no incluye seed data. Para probar `/checkout` hace
falta al menos un `tenant`, un `warehouse` y un `rental` en la base:

```sql
insert into warehouses (code, name, gate_id, size_m3, monthly_amount)
values ('B-014', 'Bodega 014 · 36 m³', 1, 36, 45000);

insert into tenants (rut, full_name, phone, email)
values ('11111111-1', 'Cliente de Prueba', '+56911111111', 'test@example.com');

insert into rentals (tenant_id, warehouse_id, monthly_amount, status)
select t.id, w.id, w.monthly_amount, 'overdue'
from tenants t, warehouses w
where t.rut = '11111111-1' and w.code = 'B-014';
```

## Estructura

```
content/index.html          landing pública (servida en "/" vía app/route.js)
public/valores.html         página de valores/precios (servida en "/valores.html")
public/assets/               imágenes de la landing
sql/schema.sql              warehouses, tenants, rentals, payments, access_control_log
lib/supabase.js             cliente admin (service_role, solo backend)
lib/transbank.js            Webpay Plus (create/commit), switch integración/producción
lib/isapi.js                cliente ISAPI Digest + modo mock (ISAPI_MOCK)
lib/syncAccess.js           pago confirmado → ISAPI → access_control_log → rentals.valid_until
lib/rut.js                  validación/normalización de RUT chileno
app/checkout                RUT → bodegas del cliente → pagar
app/pago-exitoso            confirmación (avisa si la sync de acceso quedó pendiente)
app/pago-error              rechazo/cancelación
app/api/rentals/lookup      POST { rut } → bodegas + estado de pago
app/api/payments/init       POST { rentalId } → crea transacción Webpay
app/api/payments/confirm    POST (retorno de Webpay) → confirma pago + sincroniza acceso
app/api/cron/retry-sync     GET/POST protegido → reintenta syncs fallidas
```

## Checklist antes de producción

Ver también CONTEXTO.md §9 (riesgos) y §10 (checklist de visita técnica).

- [ ] **Visita técnica ejecutada**: tecnología de tarjeta confirmada (EM 125kHz vs
      MIFARE), datos del motor de cada portón, conectividad del sitio.
- [ ] **Payload ISAPI validado contra hardware real.** `lib/isapi.js` implementa el
      formato público del ISAPI Developer Guide (`UserInfo`, `Valid.beginTime/endTime`,
      `CardInfo`), pero no está confirmado contra el firmware específico del
      DS-K2602T instalado. Verificar con la cuenta aprobada en tpp.hikvision.com y
      con pruebas reales antes de poner `ISAPI_MOCK=false` en producción.
- [ ] **Cloudflare Tunnel** levantado en la red del cliente, apuntando al
      controlador; `ISAPI_BASE_URL` seteado a esa URL pública.
- [ ] **Enrolamiento inicial de tarjetas existentes**: cada tarjeta física debe
      registrarse una vez en el controlador. `syncAccessAfterPayment` hace
      `createPerson` automáticamente en el primer pago de una `rental` sin
      `controller_person_id`, pero si hay tarjetas que ya deben tener acceso HOY
      (sin esperar el próximo ciclo de pago), hay que enrolarlas manualmente.
- [ ] **Afiliación de comercio Transbank real** + credenciales de producción
      (`TRANSBANK_ENVIRONMENT=production`, `TRANSBANK_COMMERCE_CODE`,
      `TRANSBANK_API_KEY`).
- [ ] **Datos reales** de `warehouses` / `tenants` / `rentals` (RUT, tarjetas,
      montos, fechas de vencimiento).
- [ ] **`CRON_SECRET`** seteado en Vercel (env var) — Vercel Cron agrega
      automáticamente el header `Authorization: Bearer $CRON_SECRET` al invocar
      `/api/cron/retry-sync` si la env var existe con ese nombre exacto.
- [ ] **Frecuencia del cron** (`vercel.json`, cada 15 min por defecto): en el plan
      Hobby de Vercel los crons corren máximo 1 vez al día — si se necesita más
      frecuencia, requiere plan Pro.
- [ ] **`NEXT_PUBLIC_SITE_URL`** apuntando al dominio real de producción (se usa
      como `returnUrl` de Webpay — si queda mal seteado, Webpay no puede redirigir
      de vuelta al usuario).
- [ ] Revisar RLS (`sql/schema.sql`): queda `enabled` sin policies para
      anon/authenticated por diseño (solo el backend con `service_role` accede).
      Confirmar que ninguna key pública (`anon`) se filtre al frontend.

## Principio de diseño (no reabrir sin motivo)

Pago y acceso físico están desacoplados. Un fallo de conectividad con el
controlador **nunca** debe hacer que un pago se pierda o quede sin registrar. El
peor escenario aceptable es que el acceso tarde en sincronizarse, nunca que el
pago desaparezca. Ver CONTEXTO.md §3.
