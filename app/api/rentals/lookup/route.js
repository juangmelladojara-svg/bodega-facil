import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatRut, isValidRut } from "@/lib/rut";

export async function POST(request) {
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

  const now = new Date();
  const items = (rentals ?? []).map((rental) => ({
    rentalId: rental.id,
    warehouseCode: rental.warehouses?.code ?? null,
    warehouseName: rental.warehouses?.name ?? null,
    monthlyAmount: rental.monthly_amount,
    status: rental.status,
    validUntil: rental.valid_until,
    isUpToDate: Boolean(rental.valid_until && new Date(rental.valid_until) > now),
  }));

  return NextResponse.json({
    tenant: { fullName: tenant.full_name, rut: tenant.rut },
    rentals: items,
  });
}
