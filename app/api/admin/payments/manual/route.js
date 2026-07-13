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

  if (!rentalId || !(Number(amount) > 0)) {
    return NextResponse.json({ error: "Falta rentalId o el monto debe ser mayor que 0." }, { status: 400 });
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

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      rental_id: rentalId,
      method: "manual",
      amount: Number(amount),
      status: "confirmed",
      transaction_date: new Date().toISOString(),
      registered_by: admin.email,
      notes: notes || null,
    })
    .select()
    .single();

  if (paymentError || !payment) {
    return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 500 });
  }

  // El pago YA quedó confirmado y persistido. syncAccessAfterPayment también
  // guarda period_start/period_end/synced_at sobre este mismo registro — si
  // lanza (ej. dato inválido), lo tratamos como sync pendiente, no como
  // error 500 sobre un pago que de todas formas ya se registró.
  let syncSuccess = false;
  try {
    const syncResult = await syncAccessAfterPayment({ rental, payment });
    syncSuccess = syncResult.success;
  } catch (err) {
    console.error("syncAccessAfterPayment (pago manual) lanzó una excepción:", err);
  }

  return NextResponse.json({ payment, syncSuccess });
}
