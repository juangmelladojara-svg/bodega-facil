import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Marca el contrato como "enviado a firma". Hoy es un paso manual (se
 * descarga/envía por fuera); cuando se conecte un proveedor real de firma
 * electrónica, este endpoint es el punto donde se dispara esa llamada
 * (`esignature_provider`/`esignature_envelope_id` ya están en el modelo).
 */
export async function POST(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("contracts")
    .update({ status: "sent_for_signature" })
    .eq("id", id)
    .eq("status", "draft")
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "No se pudo marcar como enviado (¿ya no está en borrador?)." }, { status: 400 });
  }

  return NextResponse.json({ contract: data });
}
