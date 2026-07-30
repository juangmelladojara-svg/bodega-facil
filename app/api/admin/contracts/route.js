import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateContractContent } from "@/lib/contractTemplate";

/**
 * Genera un contrato (texto, modo ficticio) a partir de un arriendo. Queda
 * identificado por rental_id/warehouse_id/tenant_id — así siempre se sabe
 * a qué bodega corresponde. status='draft' hasta marcarlo enviado a firma.
 */
export async function POST(request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const rentalId = body?.rentalId;
  if (!rentalId) return NextResponse.json({ error: "Falta rentalId." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: rental, error } = await supabase
    .from("rentals")
    .select("*, tenants(*), warehouses(*)")
    .eq("id", rentalId)
    .maybeSingle();

  if (error || !rental) return NextResponse.json({ error: "Arriendo no encontrado." }, { status: 404 });

  const content = generateContractContent({
    tenant: rental.tenants,
    warehouse: rental.warehouses,
    rental,
  });

  const { data: contract, error: insertError } = await supabase
    .from("contracts")
    .insert({
      rental_id: rental.id,
      warehouse_id: rental.warehouse_id,
      tenant_id: rental.tenant_id,
      content,
      status: "draft",
      created_by: admin.email,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: "No se pudo generar el contrato." }, { status: 500 });

  return NextResponse.json({ contract });
}
