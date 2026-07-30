import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPendingSyncPayments, syncAccessAfterPayment } from "@/lib/syncAccess";
import { getWebpayTransactionStatus } from "@/lib/transbank";
import { syncLateFeeInvoices } from "@/lib/invoices";
import { releaseChargesForPayment } from "@/lib/charges";

const STALE_PAYMENT_MS = 15 * 60 * 1000;

/**
 * Vercel Cron invoca esta ruta por GET y agrega automáticamente el header
 * `Authorization: Bearer $CRON_SECRET` cuando el proyecto tiene una env var
 * llamada CRON_SECRET (ver vercel.json). También acepta POST para poder
 * dispararla manualmente en debugging con el mismo header.
 */
function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);

  if (headerBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(headerBuf, expectedBuf);
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

/**
 * Pagos Webpay que quedaron `pending`/`committing` por más de 15 minutos:
 * consulta el estado real en Transbank (sin comprometer/commit) y resuelve.
 * Cubre el caso "Transbank autorizó pero nuestro update a `confirmed` falló"
 * (ej. Supabase caído en ese instante) y limpia abandonos/timeouts.
 */
async function reconcileStalePayments() {
  const supabase = getSupabaseAdmin();
  const staleCutoff = new Date(Date.now() - STALE_PAYMENT_MS).toISOString();

  const { data: stalePayments, error } = await supabase
    .from("payments")
    .select("*, rentals(*, warehouses(*))")
    .in("status", ["pending", "committing"])
    .eq("method", "webpay")
    .not("webpay_token", "is", null)
    .lt("created_at", staleCutoff);

  if (error) throw error;
  if (!stalePayments?.length) return [];

  const results = [];

  for (const payment of stalePayments) {
    let status;
    try {
      status = await getWebpayTransactionStatus(payment.webpay_token);
    } catch (err) {
      results.push({ paymentId: payment.id, action: "status_check_failed", error: err.message });
      continue;
    }

    const wasAuthorized = status?.status === "AUTHORIZED" && status?.response_code === 0;

    if (wasAuthorized) {
      const { data: confirmedPayment } = await supabase
        .from("payments")
        .update({
          status: "confirmed",
          authorization_code: status.authorization_code,
          transaction_date: status.transaction_date ?? new Date().toISOString(),
        })
        .eq("id", payment.id)
        .in("status", ["pending", "committing"])
        .select()
        .maybeSingle();

      if (confirmedPayment && payment.rentals) {
        try {
          await syncAccessAfterPayment({ rental: payment.rentals, payment: confirmedPayment });
        } catch (err) {
          console.error("Reconciliación: syncAccessAfterPayment lanzó una excepción:", err);
        }
      }
      results.push({ paymentId: payment.id, action: "reconciled_confirmed" });
    } else {
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("id", payment.id)
        .in("status", ["pending", "committing"]);
      await releaseChargesForPayment(payment.id);
      results.push({ paymentId: payment.id, action: "marked_failed" });
    }
  }

  return results;
}

/**
 * `rentals.status` no se transiciona solo con el paso del tiempo — hay que
 * marcarlo explícitamente cuando `valid_until` ya pasó, si no queda diciendo
 * "active" para siempre en arriendos vencidos.
 */
async function markOverdueRentals() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("rentals")
    .update({ status: "overdue" })
    .eq("status", "active")
    .lt("valid_until", new Date().toISOString())
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}

async function runCronJob() {
  const reconciled = await reconcileStalePayments();
  const synced = await retryPendingSyncs();
  const overdueCount = await markOverdueRentals();
  const lateFeeInvoices = await syncLateFeeInvoices();

  return { reconciled, synced, overdueCount, lateFeeInvoices };
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { reconciled, synced, overdueCount, lateFeeInvoices } = await runCronJob();

  return NextResponse.json({
    reconciliation: { processed: reconciled.length, results: reconciled },
    sync: { processed: synced.length, succeeded: synced.filter((r) => r.success).length, results: synced },
    rentalsMarkedOverdue: overdueCount,
    lateFeeInvoicesUpdated: lateFeeInvoices.length,
  });
}

export async function POST(request) {
  return GET(request);
}
