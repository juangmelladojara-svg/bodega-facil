import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

const PAYMENT_DEADLINE_HOURS = 24;

/**
 * Marca el contrato como "enviado a firma" (por WhatsApp o mail, hoy manual
 * fuera del sistema) y fija el plazo de pago de 24h desde el envío. Si se
 * vence sin pago, el panel del contrato muestra una alarma — no hay
 * cancelación automática, el administrador decide si libera la bodega.
 * Cuando se conecte un proveedor real de firma electrónica, este endpoint
 * es el punto donde se dispara esa llamada (`esignature_provider`/
 * `esignature_envelope_id` ya están en el modelo).
 */
export async function POST(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const sentAt = new Date();
  const paymentDeadline = new Date(sentAt.getTime() + PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("contracts")
    .update({
      status: "sent_for_signature",
      sent_at: sentAt.toISOString(),
      payment_deadline: paymentDeadline.toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "No se pudo marcar como enviado (¿ya no está en borrador?)." }, { status: 400 });
  }

  return NextResponse.json({ contract: data });
}
