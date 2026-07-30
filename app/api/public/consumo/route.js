import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const AMOUNT_PER_UNIT = 300; // CLP por unidad de consumo

/**
 * Endpoint público (sin login) para cargar una lectura de consumo desde el
 * terreno — ver /cargos/consumo. Genera un `warehouse_charges` confirmado
 * automáticamente (consumption × $300), sin pasar por autorización de
 * admin: es una lectura de medidor, no una multa.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("warehouses").select("id, code, name").order("code");
  return NextResponse.json({ warehouses: data ?? [] });
}

export async function POST(request) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`consumo:${clientIp}`, { limit: 30, windowMs: 5 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Demasiados envíos. Espera unos minutos." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const warehouseId = body?.warehouseId;
  const consumption = Number(body?.consumption);

  if (!warehouseId || !(consumption > 0)) {
    return NextResponse.json({ error: "Falta bodega o el consumo debe ser mayor que 0." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: warehouse } = await supabase.from("warehouses").select("id, code").eq("id", warehouseId).maybeSingle();
  if (!warehouse) return NextResponse.json({ error: "Bodega no encontrada." }, { status: 404 });

  const amount = Math.round(consumption * AMOUNT_PER_UNIT);

  const { error } = await supabase.from("warehouse_charges").insert({
    warehouse_id: warehouseId,
    charge_type: "consumo",
    description: `Consumo — ${consumption} unidades × $${AMOUNT_PER_UNIT.toLocaleString("es-CL")}`,
    consumption,
    amount,
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: "No se pudo registrar el consumo." }, { status: 500 });

  return NextResponse.json({ warehouseCode: warehouse.code, amount });
}
