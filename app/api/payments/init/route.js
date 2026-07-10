import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createWebpayTransaction } from "@/lib/transbank";

export async function POST(request) {
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return NextResponse.json(
      { error: "Falta NEXT_PUBLIC_SITE_URL en las variables de entorno." },
      { status: 500 }
    );
  }

  // buy_order de Transbank acepta máx. 26 caracteres alfanuméricos.
  const buyOrder = `bf-${rental.id.replace(/-/g, "").slice(0, 12)}-${Date.now().toString(36)}`.slice(
    0,
    26
  );
  const sessionId = randomUUID().replace(/-/g, "").slice(0, 26);
  const amount = rental.monthly_amount;

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

  const { error: insertError } = await supabase.from("payments").insert({
    rental_id: rental.id,
    webpay_token: webpayResponse.token,
    buy_order: buyOrder,
    session_id: sessionId,
    amount,
    status: "pending",
  });

  if (insertError) {
    return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 500 });
  }

  return NextResponse.json({ url: webpayResponse.url, token: webpayResponse.token });
}
