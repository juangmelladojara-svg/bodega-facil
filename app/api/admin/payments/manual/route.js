import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncAccessAfterPayment } from "@/lib/syncAccess";

/**
 * Registra un pago que no pasó por Webpay (efectivo, transferencia) y
 * sincroniza el acceso igual que el flujo automático — mismo principio: el
 * pago se guarda confirmado ANTES de tocar el controlador.
 */
export async function POST(request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { rentalId, amount, notes } = body ?? {};

  if (!rentalId || !amount) {
    return NextResponse.json({ error: "Falta rentalId o amount." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: rental, error: rentalError } = await supabase
    .from("rentals")
    .select("*, warehouses(*)")
    .eq("id", rentalId)
    .maybeSingle();

  if (rentalError || !rental) {
    return NextResponse.json({ error: "Arriendo no encontrado." }, { status: 404 });
  }

  const now = new Date();

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      rental_id: rentalId,
      method: "manual",
      amount: Number(amount),
      status: "confirmed",
      transaction_date: now.toISOString(),
      registered_by: admin.email,
      notes: notes || null,
    })
    .select()
    .single();

  if (paymentError || !payment) {
    return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 500 });
  }

  const syncResult = await syncAccessAfterPayment({ rental, payment });

  await supabase
    .from("payments")
    .update({
      period_start: now.toISOString(),
      period_end: syncResult.newValidUntil.toISOString(),
    })
    .eq("id", payment.id);

  return NextResponse.json({ payment, syncSuccess: syncResult.success });
}
