import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatRut, isValidRut } from "@/lib/rut";
import { generateContractContent } from "@/lib/contractTemplate";

/**
 * Crea un nuevo arriendo. El flujo parte del contrato: el contrato ya trae
 * todos los datos del cliente (RUT, nombre, teléfono, email, dirección de
 * referencia y —si es empresa— sus datos), así que en vez de exigir crear
 * primero una ficha de arrendatario aparte, este endpoint la crea (o
 * reutiliza una existente por RUT) como parte de la misma operación, junto
 * con el arriendo y el contrato en borrador.
 *
 * Acepta `tenantId` (arrendatario ya existente, ej. una segunda bodega
 * desde Arrendatarios) o los datos crudos (`rut`/`fullName`/`phone`/`email`/
 * `referenceAddress`) para crear/actualizar el arrendatario por RUT.
 *
 * `company` (opcional): { companyRut, razonSocial, giro, companyAddress,
 * legalRepRut, legalRepName, companyEmail } — si viene, se guarda en
 * tenant_companies (1-a-1 con el arrendatario) y se incluye en el contrato.
 */
export async function POST(request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const {
    tenantId,
    rut,
    fullName,
    phone,
    email,
    referenceAddress,
    company,
    warehouseId,
    cardUid,
    monthlyAmount,
    rentalTerm,
  } = body ?? {};

  if (!warehouseId) {
    return NextResponse.json({ error: "Falta warehouseId." }, { status: 400 });
  }
  if (!tenantId && (!rut || !isValidRut(rut) || !fullName)) {
    return NextResponse.json({ error: "Falta tenantId, o RUT válido y nombre del arrendatario." }, { status: 400 });
  }
  if (monthlyAmount !== undefined && monthlyAmount !== null && !(Number(monthlyAmount) > 0)) {
    return NextResponse.json({ error: "El monto mensual debe ser mayor que 0." }, { status: 400 });
  }
  if (rentalTerm !== undefined && rentalTerm !== "mensual" && rentalTerm !== "diario") {
    return NextResponse.json({ error: "rentalTerm debe ser 'mensual' o 'diario'." }, { status: 400 });
  }
  if (company && (!company.companyRut || !company.razonSocial || !company.legalRepRut || !company.legalRepName)) {
    return NextResponse.json(
      { error: "Si es empresa, faltan datos: RUT empresa, razón social, RUT y nombre del representante legal." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: warehouse, error: warehouseError } = await supabase
    .from("warehouses")
    .select("*")
    .eq("id", warehouseId)
    .maybeSingle();

  if (warehouseError || !warehouse) {
    return NextResponse.json({ error: "Bodega no encontrada." }, { status: 404 });
  }

  // ── Arrendatario: usa el existente o crea/actualiza por RUT ────────────
  let tenant;
  if (tenantId) {
    const { data, error } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Arrendatario no encontrado." }, { status: 404 });
    tenant = data;
  } else {
    const normalizedRut = formatRut(rut);
    const { data: existing } = await supabase.from("tenants").select("*").eq("rut", normalizedRut).maybeSingle();
    const tenantFields = {
      full_name: fullName,
      phone: phone || null,
      email: email || null,
      reference_address: referenceAddress || null,
    };

    if (existing) {
      const { data, error } = await supabase
        .from("tenants")
        .update(tenantFields)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: "No se pudo actualizar el arrendatario." }, { status: 500 });
      tenant = data;
    } else {
      const { data, error } = await supabase
        .from("tenants")
        .insert({ rut: normalizedRut, ...tenantFields })
        .select()
        .single();
      if (error) return NextResponse.json({ error: "No se pudo crear el arrendatario." }, { status: 500 });
      tenant = data;
    }
  }

  // ── Datos de empresa (si corresponde) ───────────────────────────────
  let tenantCompany = null;
  if (company) {
    const { data, error } = await supabase
      .from("tenant_companies")
      .upsert(
        {
          tenant_id: tenant.id,
          company_rut: formatRut(company.companyRut),
          razon_social: company.razonSocial,
          giro: company.giro || null,
          company_address: company.companyAddress || null,
          legal_rep_rut: formatRut(company.legalRepRut),
          legal_rep_name: company.legalRepName,
          company_email: company.companyEmail || null,
        },
        { onConflict: "tenant_id" }
      )
      .select()
      .single();
    if (error) return NextResponse.json({ error: "No se pudieron guardar los datos de la empresa." }, { status: 500 });
    tenantCompany = data;
  }

  // ── Arriendo ─────────────────────────────────────────────────────────
  const { data: rental, error: rentalError } = await supabase
    .from("rentals")
    .insert({
      tenant_id: tenant.id,
      warehouse_id: warehouseId,
      card_uid: cardUid || null,
      monthly_amount: monthlyAmount ? Number(monthlyAmount) : warehouse.monthly_amount,
      rental_term: rentalTerm || "mensual",
      status: "inactive",
    })
    .select()
    .single();

  if (rentalError) {
    const message =
      rentalError.code === "23505"
        ? "Esa bodega ya tiene un arriendo asignado."
        : rentalError.code === "23514"
          ? "El monto mensual debe ser mayor que 0."
          : "No se pudo crear el arriendo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // ── Contrato (borrador) ─────────────────────────────────────────────
  const content = generateContractContent({ tenant, warehouse, rental, company: tenantCompany });
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .insert({
      rental_id: rental.id,
      warehouse_id: warehouseId,
      tenant_id: tenant.id,
      content,
      status: "draft",
      created_by: admin.email,
    })
    .select()
    .single();

  // El arriendo ya quedó creado y persistido — si el contrato falla, no se
  // pierde el arriendo; queda sin contrato y se puede generar después desde
  // la ficha de la bodega.
  if (contractError) {
    return NextResponse.json({ tenant, rental, contract: null, contractError: "No se pudo generar el contrato." });
  }

  return NextResponse.json({ tenant, rental, contract });
}
