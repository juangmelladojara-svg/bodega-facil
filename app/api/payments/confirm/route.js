import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { commitWebpayTransaction } from "@/lib/transbank";
import { syncAccessAfterPayment } from "@/lib/syncAccess";

/**
 * Webpay Plus hace un POST (form-urlencoded) del navegador del cliente a esta
 * URL con `token_ws` (pago intentado) o `TBK_TOKEN`/`TBK_ID_SESION` (usuario
 * canceló o hubo timeout antes de llegar a pagar). Respondemos con un
 * redirect 303 para que el navegador termine en GET sobre /pago-exitoso o
 * /pago-error.
 *
 * Principio no negociable: el pago se guarda como confirmado en la base de
 * datos ANTES de intentar sincronizar con el controlador. Si ISAPI falla,
 * el pago igual queda registrado — solo el acceso físico queda pendiente
 * de reintento (ver lib/syncAccess.js y /api/cron/retry-sync).
 */
export async function POST(request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = getSupabaseAdmin();

  const formData = await request.formData();
  const tokenWs = formData.get("token_ws");
  const tbkToken = formData.get("TBK_TOKEN");

  if (!tokenWs || tbkToken) {
    return NextResponse.redirect(`${siteUrl}/pago-error?motivo=cancelado`, 303);
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("*, rentals(*, warehouses(*))")
    .eq("webpay_token", tokenWs)
    .maybeSingle();

  if (paymentError || !payment || !payment.rentals) {
    return NextResponse.redirect(`${siteUrl}/pago-error?motivo=no_encontrado`, 303);
  }

  // Idempotencia: Webpay puede reintentar el POST de retorno (doble-click,
  // refresh del navegador). Si ya está confirmado, no volvemos a hacer commit.
  if (payment.status === "confirmed") {
    return NextResponse.redirect(
      `${siteUrl}/pago-exitoso?rentalId=${payment.rental_id}`,
      303
    );
  }

  let commitResult;
  try {
    commitResult = await commitWebpayTransaction(tokenWs);
  } catch {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return NextResponse.redirect(`${siteUrl}/pago-error?motivo=rechazado`, 303);
  }

  const wasAuthorized =
    commitResult?.response_code === 0 && commitResult?.status === "AUTHORIZED";

  if (!wasAuthorized) {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return NextResponse.redirect(`${siteUrl}/pago-error?motivo=rechazado`, 303);
  }

  const rental = payment.rentals;
  const now = new Date();

  const { data: confirmedPayment, error: updateError } = await supabase
    .from("payments")
    .update({
      status: "confirmed",
      authorization_code: commitResult.authorization_code,
      transaction_date: commitResult.transaction_date ?? now.toISOString(),
    })
    .eq("id", payment.id)
    .select()
    .single();

  if (updateError || !confirmedPayment) {
    // El pago fue autorizado por Transbank pero no logramos guardarlo — no
    // intentamos sincronizar acceso sin tener el pago persistido.
    return NextResponse.redirect(`${siteUrl}/pago-error?motivo=error_interno`, 303);
  }

  // A partir de acá el pago YA está confirmado y persistido. Lo que sigue
  // (sincronizar con el controlador) puede fallar sin que el pago se pierda.
  const syncResult = await syncAccessAfterPayment({ rental, payment: confirmedPayment });

  await supabase
    .from("payments")
    .update({
      period_start: now.toISOString(),
      period_end: syncResult.newValidUntil.toISOString(),
    })
    .eq("id", confirmedPayment.id);

  const params = new URLSearchParams({
    rentalId: rental.id,
    syncPending: syncResult.success ? "false" : "true",
  });

  return NextResponse.redirect(`${siteUrl}/pago-exitoso?${params.toString()}`, 303);
}
