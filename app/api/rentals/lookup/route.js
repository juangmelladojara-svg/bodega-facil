import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatRut, isValidRut } from "@/lib/rut";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Endpoint público: dado un RUT válido devuelve nombre + bodegas + estado de
 * pago. Los RUT chilenos son enumerables, así que sin fricción esto permite
 * armar una base de datos de clientes/morosidad barriendo rangos. El rate
 * limit es la mitigación principal (ver lib/rateLimit.js — best-effort, no
 * reemplaza un WAF real si el tráfico crece).
 */
export async function POST(request) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`rentals-lookup:${clientIp}`, { limit: 8, windowMs: 5 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas. Espera unos minutos e intenta de nuevo." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const rut = body?.rut;

  if (!rut || !isValidRut(rut)) {
    return NextResponse.json({ error: "RUT inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const normalizedRut = formatRut(rut);

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("*")
    .eq("rut", normalizedRut)
    .maybeSingle();

  if (tenantError) {
    return NextResponse.json({ error: "Error al buscar el RUT." }, { status: 500 });
  }

  if (!tenant) {
    return NextResponse.json(
      { error: "No encontramos arriendos asociados a ese RUT." },
      { status: 404 }
    );
  }

  const { data: rentals, error: rentalsError } = await supabase
    .from("rentals")
    .select("*, warehouses(*)")
    .eq("tenant_id", tenant.id);

  if (rentalsError) {
    return NextResponse.json({ error: "Error al buscar arriendos." }, { status: 500 });
  }

  // Cargos confirmados y todavía no facturados, por bodega — se suman al
  // monto a pagar. Defensivo: si la tabla no existe todavía, seguir sin cargos.
  let chargesByWarehouse = new Map();
  try {
    const warehouseIds = (rentals ?? []).map((r) => r.warehouse_id);
    if (warehouseIds.length > 0) {
      const { data: charges } = await supabase
        .from("warehouse_charges")
        .select("warehouse_id, amount")
        .in("warehouse_id", warehouseIds)
        .eq("status", "confirmed")
        .is("payment_id", null);
      for (const c of charges ?? []) {
        chargesByWarehouse.set(c.warehouse_id, (chargesByWarehouse.get(c.warehouse_id) ?? 0) + c.amount);
      }
    }
  } catch {
    chargesByWarehouse = new Map();
  }

  const now = new Date();
  const items = (rentals ?? []).map((rental) => {
    const chargesTotal = chargesByWarehouse.get(rental.warehouse_id) ?? 0;
    return {
      rentalId: rental.id,
      warehouseCode: rental.warehouses?.code ?? null,
      warehouseName: rental.warehouses?.name ?? null,
      monthlyAmount: rental.monthly_amount,
      chargesTotal,
      totalDue: rental.monthly_amount + chargesTotal,
      status: rental.status,
      validUntil: rental.valid_until,
      isUpToDate: Boolean(rental.valid_until && new Date(rental.valid_until) > now),
    };
  });

  return NextResponse.json({
    tenant: { fullName: tenant.full_name, rut: tenant.rut },
    rentals: items,
  });
}
