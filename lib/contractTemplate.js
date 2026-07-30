/**
 * Plantilla de contrato FICTICIA — texto de relleno para dejar el flujo
 * completo (generación → firma → PDF adjunto) probado antes de tener el
 * contrato legal real de Bodegar Fácil. Reemplazar `TEMPLATE` cuando el
 * cliente entregue el texto definitivo; el resto del pipeline no cambia.
 */
const TEMPLATE = `CONTRATO DE ARRIENDO DE BODEGA
Bodegar Fácil — Camino Temuco–Labranza KM 12, Temuco

Entre BODEGAR FÁCIL SpA, en adelante "el Arrendador", y {{tenantName}}, RUT {{tenantRut}},
en adelante "el Arrendatario", se acuerda el presente contrato de arriendo bajo las
siguientes condiciones:

PRIMERO — Objeto del contrato
El Arrendador entrega en arriendo al Arrendatario la bodega identificada como
{{warehouseCode}} ({{warehouseName}}), con acceso controlado mediante tarjeta RFID
asociada al patio {{gateId}} del recinto.

SEGUNDO — Renta y forma de pago
El valor mensual del arriendo es de {{monthlyAmount}}, pagadero por adelantado a través
del portal de pago de Bodegar Fácil (Webpay Plus) o mediante pago manual registrado por
administración. El atraso en el pago genera una multa de $15.000 (quince mil pesos) por
día de atraso, la que requiere autorización expresa de un administrador antes de poder
facturarse.

TERCERO — Vigencia
El presente contrato entra en vigencia el {{startDate}} y se renueva mes a mes mientras
se mantenga vigente el pago de la renta.

CUARTO — Acceso
El acceso físico a la bodega queda condicionado al pago vigente de la renta. El
Arrendador podrá suspender el acceso de la tarjeta RFID en caso de atraso prolongado o
incumplimiento grave de este contrato.

QUINTO — Firma
Este documento se firma electrónicamente por ambas partes como constancia de aceptación
de las condiciones aquí descritas.

Arrendador: Bodegar Fácil SpA
Arrendatario: {{tenantName}}
Fecha: {{startDate}}

[Documento generado automáticamente — CONTRATO FICTICIO de demostración]`;

export function generateContractContent({ tenant, warehouse, rental }) {
  const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  const startDate = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });

  return TEMPLATE.replace(/{{tenantName}}/g, tenant.full_name)
    .replace(/{{tenantRut}}/g, tenant.rut)
    .replace(/{{warehouseCode}}/g, warehouse.code)
    .replace(/{{warehouseName}}/g, warehouse.name)
    .replace(/{{gateId}}/g, String(warehouse.gate_id))
    .replace(/{{monthlyAmount}}/g, clp.format(rental.monthly_amount))
    .replace(/{{startDate}}/g, startDate);
}
