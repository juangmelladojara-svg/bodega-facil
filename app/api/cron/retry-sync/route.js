import { NextResponse } from "next/server";
import { getPendingSyncPayments, syncAccessAfterPayment } from "@/lib/syncAccess";

/**
 * Vercel Cron invoca esta ruta por GET y agrega automáticamente el header
 * `Authorization: Bearer $CRON_SECRET` cuando el proyecto tiene una env var
 * llamada CRON_SECRET (ver vercel.json). También acepta POST para poder
 * dispararla manualmente en debugging con el mismo header.
 */
function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function retryPendingSyncs() {
  const pending = await getPendingSyncPayments();

  const results = [];
  for (const payment of pending) {
    const rental = payment.rentals;
    if (!rental) {
      results.push({ paymentId: payment.id, success: false, reason: "rental no encontrado" });
      continue;
    }
    const result = await syncAccessAfterPayment({ rental, payment });
    results.push({ paymentId: payment.id, success: result.success });
  }

  return results;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const results = await retryPendingSyncs();

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    results,
  });
}

export async function POST(request) {
  return GET(request);
}
