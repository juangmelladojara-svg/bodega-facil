/**
 * Plantilla de contrato FICTICIA — texto de relleno para dejar el flujo
 * completo (generación → firma → PDF adjunto) probado antes de tener el
 * contrato legal real de Bodegar Fácil. Reemplazar `TEMPLATE` cuando el
 * cliente entregue el texto definitivo; el resto del pipeline no cambia.
 */
const TEMPLATE = `CONTRATO DE ARRIENDO DE BODEGA
Bodegar Fácil — Camino Temuco–Labranza KM 12, Temuco

Entre BODEGAR FÁCIL SpA, en adelante "el Arrendador", y {{tenantName}}, RUT {{tenantRut}},
en adelante "el Arrendatario"{{companyClause}}, se acuerda el presente contrato de arriendo
bajo las siguientes condiciones:

PRIMERO — Objeto del contrato
El Arrendador entrega en arriendo al Arrendatario la bodega identificada como
{{warehouseCode}} ({{warehouseName}}), con acceso controlado mediante tarjeta RFID
asociada al patio {{gateId}} del recinto.

SEGUNDO — Renta y forma de pago
El valor mensual del arriendo es de {{monthlyAmount}}, pagadero por adelantado a través
del portal de pago de Bodegar Fácil (Webpay Plus) o mediante pago manual registrado por
administración. El primer pago corresponde al proporcional del mes en curso más el mes
siguiente completo; desde el tercer período en adelante, la renta se paga dentro de los
primeros diez (10) días de cada mes. El atraso en el pago genera una multa de $15.000
(quince mil pesos) por día de atraso, la que requiere autorización expresa de un
administrador antes de poder facturarse.

TERCERO — Vigencia y plazo mínimo
El presente contrato entra en vigencia el {{startDate}} y se renueva mes a mes mientras
se mantenga vigente el pago de la renta. {{termClause}}

CUARTO — Datos de contacto
Se deja constancia de la dirección de referencia {{referenceAddress}}, el teléfono de
contacto asociado a WhatsApp {{tenantPhone}} y el correo electrónico {{tenantEmail}} del
Arrendatario, medios por los cuales el Arrendador enviará avisos de pago, vouchers y
comunicaciones relevantes de la plataforma.

QUINTO — Acceso
El acceso físico a la bodega queda condicionado al pago vigente de la renta. El
Arrendador podrá suspender el acceso de la tarjeta RFID en caso de atraso prolongado o
incumplimiento grave de este contrato.

SEXTO — Firma
Este documento se firma electrónicamente por ambas partes como constancia de aceptación
de las condiciones aquí descritas.

Arrendador: Bodegar Fácil SpA
Arrendatario: {{tenantName}}
Fecha: {{startDate}}

[Documento generado automáticamente — CONTRATO FICTICIO de demostración]`;

export function generateContractContent({ tenant, warehouse, rental, company }) {
  const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  const startDate = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });

  const companyClause = company
    ? `, en representación de ${company.razon_social}, RUT ${company.company_rut}` +
      (company.giro ? `, giro ${company.giro}` : "") +
      (company.company_address ? `, con domicilio en ${company.company_address}` : "") +
      `, representada por ${company.legal_rep_name}, RUT ${company.legal_rep_rut}`
    : "";

  const termClause =
    rental.rental_term === "diario"
      ? "Este arriendo es de modalidad diaria, sin plazo mínimo de permanencia."
      : "La duración mínima de este arriendo es de tres (3) meses.";

  return TEMPLATE.replace(/{{tenantName}}/g, tenant.full_name)
    .replace(/{{tenantRut}}/g, tenant.rut)
    .replace(/{{companyClause}}/g, companyClause)
    .replace(/{{warehouseCode}}/g, warehouse.code)
    .replace(/{{warehouseName}}/g, warehouse.name)
    .replace(/{{gateId}}/g, String(warehouse.gate_id))
    .replace(/{{monthlyAmount}}/g, clp.format(rental.monthly_amount))
    .replace(/{{termClause}}/g, termClause)
    .replace(/{{referenceAddress}}/g, tenant.reference_address || "(no informada)")
    .replace(/{{tenantPhone}}/g, tenant.phone || "(no informado)")
    .replace(/{{tenantEmail}}/g, tenant.email || "(no informado)")
    .replace(/{{startDate}}/g, startDate);
}
