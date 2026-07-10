# Contexto para Antigravity — Control de acceso de bodegas con pago vinculado

> Pega este documento completo al agente de Antigravity al abrir este proyecto. Es el
> resultado de una fase de diseño/arquitectura ya cerrada (sesión previa en Claude Code);
> el código de esta carpeta aún no existe — hay que construirlo desde cero siguiendo
> exactamente estas decisiones, no reabrir el debate de arquitectura salvo que algo
> choque con la realidad del hardware en terreno.

## 0. Cliente y relación con el resto del repo

- Cliente: **Bodega Fácil** (bodegarfacil.cl, Temuco) — arriendo de bodegas (self-storage).
- Este repo fusiona dos piezas bajo un solo dominio/deploy: la landing pública de
  marketing (HTML estático en `content/index.html` + `public/valores.html`, ver
  [`../BRIEF.md`](../BRIEF.md)) y esta app de control de acceso + cobro (Next.js,
  `app/`, `lib/`). **Siguen siendo estilos y responsabilidades separadas** — no
  reutilizar el CSS de la landing en el portal ni viceversa — pero comparten
  repo, dominio y proyecto de Vercel. Ver [`README.md`](./README.md) para el mapa
  completo de archivos.

## 1. Problema y alcance

Empresa de arriendo de bodegas con **2 portones físicos**, cada uno con motor ya instalado.
Se necesita: cuando un arrendatario paga su mensualidad, su tarjeta RFID se habilita
automáticamente para abrir su portón; si no paga, se deshabilita. Todo esto sin depender de
un servidor corriendo 24/7 vigilando activamente.

## 2. Decisión de arquitectura (ya tomada, no reabrir sin motivo)

**ISAPI directo al controlador — NO HikCentral.**

- Se evaluó y descartó HikCentral (Access Control gratuito y Professional de pago): para
  2 puertas es una capa de software innecesaria, con costo de licencia (Professional) y
  complejidad de servidor Windows dedicado.
- Controlador Hikvision serie **DS-K2600** (sugerido: **DS-K2602T**, 2 puertas) permite
  asignar a cada tarjeta/persona un **periodo de validez** (fecha inicio/fin) directamente
  en el dispositivo.
- El controlador **deniega acceso automáticamente al vencer la fecha**, sin que el backend
  esté vigilando en tiempo real ni dependa de conectividad permanente.
- El backend solo necesita **extender esa fecha cuando se confirma un pago**.
- Protocolo: **ISAPI** (HTTP/REST nativo de Hikvision, autenticación **Digest**). Sin
  librería oficial — cliente propio con `digest-fetch`.

**Hardware:**
- Motor de portón ya instalado en ambos portones — el controlador solo simula el pulso de
  apertura (relé conectado a la entrada de "botón" que el motor ya recibe).
- Tecnología de tarjeta **sin confirmar** (EM 125kHz vs MIFARE) — pendiente de visita técnica.

**Conectividad:**
- Controlador vive en la LAN del cliente. Se expone al backend vía **Cloudflare Tunnel**
  (sin abrir puertos, TLS gratis) — evita VPN por sitio o port-forwarding.

## 3. Flujo de negocio completo

```
Cliente entra a la web
  → Ingresa RUT
  → Ve sus bodegas, estado (al día/vencido) y monto a pagar
  → Elige pagar → redirige a Webpay Plus
  → Paga
  → Webpay redirige de vuelta (confirmación)
  → Backend confirma la transacción con Transbank
  → Calcula nueva fecha de vigencia (extiende desde el vencimiento actual
    si paga adelantado, para no perder días ya pagados)
  → Guarda el pago como confirmado en la base de datos
    (esto ocurre SIEMPRE, independiente de si el hardware responde)
  → Llama al controlador vía ISAPI para extender la vigencia de la tarjeta
  → Si el controlador no responde (red caída, túnel caído, etc.):
      - Queda registrado en un log de auditoría con success=false
      - Un job de reintento (cron) lo vuelve a intentar más tarde
  → Si todo funciona: la tarjeta queda habilitada hasta la nueva fecha
```

**Principio de diseño que no se negocia**: pago y acceso físico están desacoplados. Un
fallo de conectividad con el controlador **nunca** debe hacer que un pago se pierda o quede
sin registrar. El peor escenario aceptable es que el acceso tarde en sincronizarse, nunca
que el pago desaparezca.

## 4. Stack técnico

- **Frontend**: Next.js 16 (App Router), React 19, TailwindCSS — consistente con el resto
  del workspace `webs_animadas`.
- **Backend**: API routes de Next.js (sin backend separado).
- **Base de datos**: Supabase (Postgres + RLS + Auth). `service_role key` solo en backend,
  nunca expuesta al frontend.
- **Pagos**: Transbank SDK oficial (Webpay Plus). Ambiente de integración (sandbox) por
  defecto hasta tener credenciales reales de producción.
- **Control de acceso**: cliente ISAPI propio (`digest-fetch` para la autenticación Digest).
- **Despliegue**: Vercel.

## 5. Modelo de datos (Supabase) — a crear en `sql/schema.sql`

| Tabla | Propósito |
|---|---|
| `warehouses` | Bodegas físicas, cada una asociada a un portón (`gate_id`) |
| `tenants` | Arrendatarios: RUT, nombre, contacto |
| `rentals` | Relación arrendatario↔bodega↔tarjeta física. Incluye `controller_person_id` (ID asignado por el controlador), monto mensual, estado (`inactive/active/overdue/suspended`), `valid_until` |
| `payments` | Historial de pagos. `webpay_token` único como clave de idempotencia frente a reintentos de Transbank |
| `access_control_log` | Auditoría de cada llamada al controlador (payload enviado, status de respuesta, éxito/fallo) — crítico para debug en terreno |

## 6. Endpoints a construir

| Endpoint | Función |
|---|---|
| `POST /api/rentals/lookup` | Busca bodegas y estado de pago asociadas a un RUT |
| `POST /api/payments/init` | Crea la transacción en Webpay Plus |
| `POST /api/payments/confirm` | Confirma el pago, calcula nueva vigencia, sincroniza con el controlador, **idempotente** |
| `POST /api/cron/retry-sync` | Reintenta sincronizaciones fallidas (pago confirmado pero controlador no respondió), protegido con secreto en header |

## 7. Módulos de librería (`lib/`)

- **`supabase.js`** — cliente con service_role key.
- **`transbank.js`** — wrapper de creación/confirmación de transacción Webpay, switch
  integración/producción vía variable de entorno.
- **`isapi.js`** — cliente ISAPI completo: `createPerson` (enrolamiento inicial),
  `addCardToPerson`, `extendCardValidity` (llamada central del flujo de pago),
  `revokeAccess` (uso administrativo manual).
- **`syncAccess.js`** — orquesta la llamada a ISAPI tras un pago, registra el resultado en
  `access_control_log`, calcula la nueva fecha de vigencia (`computeNewValidUntil`)
  respetando tiempo ya pagado si el usuario paga adelantado.

## 8. Frontend a construir

- **`/checkout`** — ingreso de RUT, selección de bodega (si tiene más de una), monto y
  estado, botón de pago que redirige a Webpay.
- **`/pago-exitoso`** — confirmación visual, con aviso especial si el pago se confirmó pero
  la sincronización con el hardware quedó pendiente.
- **`/pago-error`** — pantalla de rechazo/cancelación.

## 9. Riesgos y supuestos pendientes de validar

1. **Credenciales reales de Transbank** — falta afiliación de comercio; hoy correría contra
   ambiente de integración público.
2. **Conectividad al controlador** — falta levantar el Cloudflare Tunnel en la red del
   cliente y definir la URL pública real.
3. **Tecnología de tarjeta sin confirmar** — EM 125kHz vs MIFARE, pendiente de revisar en
   terreno con lector de prueba dual-frecuencia.
4. **Payload ISAPI sin validar contra hardware real** — los nombres de campo deben
   confirmarse contra el ISAPI Developer Guide del firmware específico instalado (cuenta
   aprobada en tpp.hikvision.com) antes de producción. No asumir que la doc pública genérica
   calza 1:1 con el DS-K2602T real.
5. **Datos reales del cliente** — poblar `warehouses`/`tenants`/`rentals` con RUT, tarjetas,
   montos y fechas de vencimiento reales.
6. **Enrolamiento físico** — cada tarjeta existente debe registrarse una vez en el
   controlador (`createPerson`), guardando el `controller_person_id` resultante.

## 10. Checklist de visita técnica (pendiente de ejecutar)

- Prueba de tecnología de tarjeta con lector dual-frecuencia.
- Datos del motor de cada portón (marca, voltaje, tipo de entrada de activación).
- Estado de la conectividad a internet en el sitio.
- Alimentación eléctrica y respaldo.
- Recopilación de datos reales de arrendatarios para poblar la base de datos.
- Verificación de la ubicación física segura para el controlador.

## 11. Estructura de archivos objetivo

```
control-acceso/
├── CONTEXTO.md              (este archivo)
├── README.md                (documentación + checklist de producción)
├── .env.example
├── package.json
├── sql/schema.sql
├── lib/
│   ├── supabase.js
│   ├── transbank.js
│   ├── isapi.js
│   └── syncAccess.js
└── app/
    ├── checkout/page.jsx
    ├── pago-exitoso/page.jsx
    ├── pago-error/page.jsx
    └── api/
        ├── rentals/lookup/route.js
        ├── payments/init/route.js
        ├── payments/confirm/route.js
        └── cron/retry-sync/route.js
```

## 12. Próximos pasos (orden sugerido)

1. Scaffold Next.js + Supabase + estructura de carpetas de arriba.
2. `sql/schema.sql` con las 5 tablas de la sección 5, RLS básico.
3. `lib/isapi.js` con cliente Digest + mock/stub para poder probar el flujo de pago sin
   hardware real conectado.
4. Endpoints de pago (`init`/`confirm`) contra Transbank sandbox, con idempotencia por
   `webpay_token`.
5. `lib/syncAccess.js` conectando pago confirmado → ISAPI → `access_control_log`.
6. Frontend `/checkout`, `/pago-exitoso`, `/pago-error`.
7. `POST /api/cron/retry-sync` + configurar cron en Vercel.
8. Tests de integración: pago exitoso + controlador OK; pago exitoso + controlador falla
   (verificar que el pago igual se guarda); reintento de token ya procesado (idempotencia).
9. Ejecutar visita técnica (sección 10) y traducir a `INSERT` reales.
10. Afiliación de comercio Transbank + ISAPI Developer Guide real (tpp.hikvision.com).
