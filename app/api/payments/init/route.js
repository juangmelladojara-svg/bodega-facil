import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createWebpayTransaction } from "@/lib/transbank";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getUnbilledCharges, reserveChargesForPayment } from "@/lib/charges";
import { computeFirstPaymentAmount } from "@/lib/computeValidUntil";

export async function POST(request) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`payments-init:${clientIp}`, { limit: 20, windowMs: 5 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos de pago. Espera unos minutos e intenta de nuevo." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const rentalId = body?.rentalId;

  if (!rentalId) {
    return NextResponse.json({ error: "Falta rentalId." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: rental, error } = await supabase
    .from("rentals")
    .select("*, warehouses(*), tenants(*)")
    .eq("id", rentalId)
    .maybeSingle();

  if (error || !rental) {
    return NextResponse.json({ error: "Arriendo no encontrado." }, { status: 404 });
  }

  if (rental.status === "suspended") {
    return NextResponse.json(
      { error: "El acceso de esta bodega está suspendido. Contáctanos para regularizarlo." },
      { status: 403 }
    );
  }
  if (rental.status === "ended") {
    return NextResponse.json(
      { error: "Este arriendo ya terminó. Contáctanos si crees que esto es un error." },
      { status: 403 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;

  // Cargos confirmados y aún no facturados (flete, consumo, etc.) se suman a
  // la mensualidad. Se leen UNA vez acá y se reservan recién cuando el pago
  // ya existe — así un cargo nuevo agregado a mitad del checkout no se cuela
  // en un cobro cuyo monto ya quedó fijado con Transbank.
  const unbilledCharges = await getUnbilledCharges(rental.warehouse_id);
  const chargesTotal = unbilledCharges.reduce((sum, c) => sum + c.amount, 0);

  // buy_order de Transbank acepta máx. 26 caracteres alfanuméricos.
  const buyOrder = `bf-${rental.id.replace(/-/g, "").slice(0, 12)}-${Date.now().toString(36)}`.slice(
    0,
    26
  );
  const sessionId = randomUUID().replace(/-/g, "").slice(0, 26);
  // Primer pago del arriendo: proporcional del mes en curso + el mes
  // siguiente completo (ver lib/computeValidUntil.js). Desde el segundo
  // pago en adelante, mensualidad plana.
  const isFirstPayment = !rental.valid_until;
  const baseAmount = isFirstPayment
    ? computeFirstPaymentAmount({ monthlyAmount: rental.monthly_amount })
    : rental.monthly_amount;
  const amount = baseAmount + chargesTotal;

  let webpayResponse;
  try {
    webpayResponse = await createWebpayTransaction({
      buyOrder,
      sessionId,
      amount,
      returnUrl: `${siteUrl}/api/payments/confirm`,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo iniciar el pago con Webpay." },
      { status: 502 }
    );
  }

  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      rental_id: rental.id,
      webpay_token: webpayResponse.token,
      buy_order: buyOrder,
      session_id: sessionId,
      amount,
      status: "pending",
      notes:
        [
          isFirstPayment ? "Primer pago: proporcional del mes + mes siguiente." : null,
          chargesTotal > 0 ? `Incluye ${clpFormat(chargesTotal)} en cargos adicionales.` : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
    })
    .select()
    .single();

  if (insertError || !payment) {
    return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 500 });
  }

  if (unbilledCharges.length > 0) {
    await reserveChargesForPayment(unbilledCharges.map((c) => c.id), payment.id);
  }

  return NextResponse.json({
    url: webpayResponse.url,
    token: webpayResponse.token,
    amount,
    chargesTotal,
    isFirstPayment,
    baseAmount,
  });
}

function clpFormat(n) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}
