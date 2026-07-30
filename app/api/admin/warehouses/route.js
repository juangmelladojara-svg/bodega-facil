import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("warehouses").select("*").order("code");

  if (error) return NextResponse.json({ error: "Error al listar bodegas." }, { status: 500 });

  return NextResponse.json({ warehouses: data });
}

export async function POST(request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { code, name, gateId, sizeM3, monthlyAmount } = body ?? {};

  if (!code || !name || !gateId || !monthlyAmount) {
    return NextResponse.json({ error: "Faltan campos obligatorios." }, { status: 400 });
  }
  if (![1, 2].includes(Number(gateId))) {
    return NextResponse.json({ error: "El patio debe ser 1 o 2." }, { status: 400 });
  }
  if (!(Number(monthlyAmount) > 0)) {
    return NextResponse.json({ error: "El monto mensual debe ser mayor que 0." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("warehouses")
    .insert({
      code,
      name,
      gate_id: Number(gateId),
      size_m3: sizeM3 ? Number(sizeM3) : null,
      monthly_amount: Number(monthlyAmount),
    })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "Ya existe una bodega con ese código."
        : error.code === "23514"
          ? "Alguno de los valores no cumple las reglas (¿monto o patio inválido?)."
          : "No se pudo crear la bodega.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ warehouse: data });
}
