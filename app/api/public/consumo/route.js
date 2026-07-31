import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const AMOUNT_PER_UNIT = 300; // CLP por unidad de consumo

/**
 * Endpoint público (sin login) para cargar una lectura de consumo desde el
 * terreno — ver /cargos/consumo. El número que se ingresa es la lectura
 * ACUMULADA del medidor (como luz o agua), no el consumo del período: se
 * cobra el delta contra `warehouses.last_meter_reading`, nunca la lectura
 * completa de nuevo. Genera un `warehouse_charges` confirmado
 * automáticamente, sin pasar por autorización de admin — es una lectura de
 * medidor, no una multa.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("warehouses").select("id, code, name, last_meter_reading").order("code");
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
  const reading = Number(body?.reading);

  if (!warehouseId || !Number.isFinite(reading) || reading < 0) {
    return NextResponse.json({ error: "Falta bodega o la lectura no es válida." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id, code, last_meter_reading")
    .eq("id", warehouseId)
    .maybeSingle();
  if (!warehouse) return NextResponse.json({ error: "Bodega no encontrada." }, { status: 404 });

  const previousReading = warehouse.last_meter_reading ?? 0;
  if (reading < previousReading) {
    return NextResponse.json(
      { error: `La lectura no puede ser menor a la anterior (${previousReading}).` },
      { status: 400 }
    );
  }

  const delta = Math.round((reading - previousReading) * 100) / 100;

  if (delta === 0) {
    return NextResponse.json({ warehouseCode: warehouse.code, delta: 0, amount: 0, noCharge: true });
  }

  const amount = Math.round(delta * AMOUNT_PER_UNIT);

  const { error: chargeError } = await supabase.from("warehouse_charges").insert({
    warehouse_id: warehouseId,
    charge_type: "consumo",
    description: `Consumo — lectura ${reading} (+${delta} unidades) × $${AMOUNT_PER_UNIT.toLocaleString("es-CL")}`,
    consumption: delta,
    meter_reading: reading,
    amount,
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
  });

  if (chargeError) return NextResponse.json({ error: "No se pudo registrar el consumo." }, { status: 500 });

  const { error: warehouseError } = await supabase
    .from("warehouses")
    .update({ last_meter_reading: reading })
    .eq("id", warehouseId);

  if (warehouseError) {
    return NextResponse.json({ error: "El cargo se registró, pero no se pudo actualizar la lectura del medidor." }, { status: 500 });
  }

  return NextResponse.json({ warehouseCode: warehouse.code, delta, amount, noCharge: false });
}
