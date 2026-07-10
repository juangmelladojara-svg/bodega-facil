import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { tenantId, warehouseId, cardUid, monthlyAmount } = body ?? {};

  if (!tenantId || !warehouseId) {
    return NextResponse.json({ error: "Falta tenantId o warehouseId." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: warehouse, error: warehouseError } = await supabase
    .from("warehouses")
    .select("monthly_amount")
    .eq("id", warehouseId)
    .maybeSingle();

  if (warehouseError || !warehouse) {
    return NextResponse.json({ error: "Bodega no encontrada." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("rentals")
    .insert({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      card_uid: cardUid || null,
      monthly_amount: monthlyAmount ? Number(monthlyAmount) : warehouse.monthly_amount,
      status: "inactive",
    })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505" ? "Esa bodega ya tiene un arriendo asignado." : "No se pudo crear el arriendo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ rental: data });
}
