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
 *
 * Idempotencia frente a POSTs concurrentes: Webpay puede reintentar el
 * retorno (doble-click, retry de red, refresh). Antes de llamar a `commit`,
 * "reclamamos" el pago con un UPDATE condicionado a `status = 'pending'`
 * (pending → committing). Solo un request gana esa carrera — el resto ve
 * 0 filas afectadas y nunca llega a tocar Transbank ni a pisar el estado.
 * Todos los updates posteriores (confirmed/failed) van condicionados a
 * `status = 'committing'`, así un pago ya `confirmed` nunca puede
 * degradarse a `failed`.
 */
export async function POST(request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const supabase = getSupabaseAdmin();

  const formData = await request.formData();
  const tokenWs = formData.get("token_ws");
  const tbkToken = formData.get("TBK_TOKEN");
  const tbkBuyOrder = formData.get("TBK_ORDEN_COMPRA");

  if (!tokenWs || tbkToken) {
    // Usuario canceló o hubo timeout en Webpay. Si alcanzamos a identificar
    // el pago por buy_order, lo marcamos failed para no dejarlo pending para siempre.
    if (tbkBuyOrder) {
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("buy_order", tbkBuyOrder)
        .eq("status", "pending");
    }
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

  if (payment.status === "confirmed") {
    return NextResponse.redirect(
      `${siteUrl}/pago-exitoso?rentalId=${payment.rental_id}`,
      303
    );
  }

  const { data: claimed } = await supabase
    .from("payments")
    .update({ status: "committing" })
    .eq("id", payment.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (!claimed) {
    // Perdimos la carrera: otro request ya está (o ya terminó de) procesar
    // este mismo token. Releemos el estado real antes de decidir qué mostrar.
    const { data: current } = await supabase
      .from("payments")
      .select("status")
      .eq("id", payment.id)
      .maybeSingle();

    if (current?.status === "confirmed") {
      return NextResponse.redirect(`${siteUrl}/pago-exitoso?rentalId=${payment.rental_id}`, 303);
    }
    return NextResponse.redirect(`${siteUrl}/pago-error?motivo=procesando`, 303);
  }

  let commitResult;
  try {
    commitResult = await commitWebpayTransaction(tokenWs);
  } catch {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "committing");
    return NextResponse.redirect(`${siteUrl}/pago-error?motivo=rechazado`, 303);
  }

  const wasAuthorized =
    commitResult?.response_code === 0 && commitResult?.status === "AUTHORIZED";

  if (!wasAuthorized) {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "committing");
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
    .eq("status", "committing")
    .select()
    .single();

  if (updateError || !confirmedPayment) {
    // Transbank autorizó pero no logramos persistirlo — no intentamos
    // sincronizar acceso sin tener el pago guardado. El pago queda en
    // "committing"; el cron de reconciliación lo revisa contra Transbank.
    return NextResponse.redirect(`${siteUrl}/pago-error?motivo=error_interno`, 303);
  }

  // A partir de acá el pago YA está confirmado y persistido. Lo que sigue
  // (sincronizar con el controlador) puede fallar sin que el pago se pierda
  // — por eso va en su propio try/catch: cualquier excepción (incluida una
  // división por cero si `monthly_amount` fuera inválido) se trata como
  // "sync pendiente", nunca como error 500 con el pago ya cobrado.
  let syncSucceeded = false;
  try {
    const syncResult = await syncAccessAfterPayment({ rental, payment: confirmedPayment });
    syncSucceeded = syncResult.success;
  } catch (err) {
    console.error("syncAccessAfterPayment lanzó una excepción no controlada:", err);
  }

  const params = new URLSearchParams({
    rentalId: rental.id,
    syncPending: syncSucceeded ? "false" : "true",
  });

  return NextResponse.redirect(`${siteUrl}/pago-exitoso?${params.toString()}`, 303);
}

/**
 * Si alguien recarga esta URL directamente (GET) — típicamente el navegador
 * reintentando tras el POST de Webpay — no hay nada que procesar acá.
 */
export async function GET(request) {
  return NextResponse.redirect(new URL("/checkout", request.url), 303);
}
