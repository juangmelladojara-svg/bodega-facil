import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Cargo manual asociado a una bodega (ej. "Traslado flete a Temuco"). */
export async function POST(request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { warehouseId, description, amount } = body ?? {};

  if (!warehouseId || !description?.trim() || !(Number(amount) > 0)) {
    return NextResponse.json(
      { error: "Falta bodega, descripción, o el monto debe ser mayor que 0." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("warehouse_charges")
    .insert({
      warehouse_id: warehouseId,
      charge_type: "manual",
      description: description.trim(),
      amount: Number(amount),
      status: "confirmed",
      created_by: admin.email,
      confirmed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "No se pudo registrar el cargo." }, { status: 500 });

  return NextResponse.json({ charge: data });
}
