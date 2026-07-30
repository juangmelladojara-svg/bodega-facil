import { getSupabaseAdmin } from "./supabase";
import { syncAccessAfterPayment } from "./syncAccess";

export const DAILY_LATE_FEE = 15000; // CLP/día, fijo por ahora (pedido explícito)

export function computeDaysLate(validUntil, now = new Date()) {
  if (!validUntil) return 0;
  const diffMs = now.getTime() - new Date(validUntil).getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

export function computeLateFee(daysLate) {
  return Math.max(0, daysLate) * DAILY_LATE_FEE;
}

/**
 * Genera (o actualiza) la factura de multa de un arriendo vencido. Nunca
 * queda cobrable sola: siempre nace en 'pending_authorization' — un admin
 * tiene que autorizarla explícitamente antes de poder pagarse. Si ya existe
 * una factura abierta para este arriendo, se actualiza días/monto en vez de
 * duplicar (índice único `invoices_one_open_per_rental_idx`).
 */
export async function upsertLateFeeInvoice(rental, { now = new Date() } = {}) {
  const supabase = getSupabaseAdmin();
  const daysLate = computeDaysLate(rental.valid_until, now);
  if (daysLate <= 0) return null;

  const lateFee = computeLateFee(daysLate);
  const baseAmount = rental.monthly_amount;
  const totalAmount = baseAmount + lateFee;

  const { data: existing } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("rental_id", rental.id)
    .in("status", ["pending_authorization", "authorized"])
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("invoices")
      .update({ days_late: daysLate, late_fee_amount: lateFee, base_amount: baseAmount, total_amount: totalAmount })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      rental_id: rental.id,
      base_amount: baseAmount,
      late_fee_amount: lateFee,
      days_late: daysLate,
      total_amount: totalAmount,
      status: "pending_authorization",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Recorre todos los arriendos vencidos y asegura que tengan una factura de
 * multa al día (crea o actualiza). Se llama desde el cron diario existente
 * (/api/cron/retry-sync) — no necesita un cron aparte.
 */
export async function syncLateFeeInvoices() {
  const supabase = getSupabaseAdmin();
  const now = new Date();

  const { data: overdueRentals, error } = await supabase
    .from("rentals")
    .select("id, monthly_amount, valid_until, status")
    .lt("valid_until", now.toISOString())
    .neq("status", "inactive");

  if (error) throw error;

  const results = [];
  for (const rental of overdueRentals ?? []) {
    if (rental.status === "suspended") continue; // ya se revocó manualmente, no se multa
    const invoice = await upsertLateFeeInvoice(rental, { now });
    if (invoice) results.push(invoice);
  }
  return results;
}

/**
 * Facturas de multa esperando que un admin las autorice — se muestran como
 * alerta apenas se entra al panel (dashboard = "inicio de sesión" real,
 * ya que /admin/login redirige ahí después de autenticar).
 */
export async function getPendingAuthorizationInvoices() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, rentals(*, tenants(full_name), warehouses(code))")
    .eq("status", "pending_authorization")
    .order("days_late", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function authorizeInvoice(invoiceId, adminEmail) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "authorized", authorized_by: adminEmail, authorized_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("status", "pending_authorization")
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Registra el pago de una factura de multa ya autorizada: crea el payment
 * (monto total = mensualidad + multa, para que quede correcto en
 * contabilidad/Facturas) y sincroniza el acceso usando SOLO la mensualidad
 * para calcular los meses otorgados (la multa no compra tiempo extra).
 */
export async function markInvoicePaid(invoiceId, adminEmail) {
  const supabase = getSupabaseAdmin();

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*, rentals(*, warehouses(*))")
    .eq("id", invoiceId)
    .eq("status", "authorized")
    .maybeSingle();
  if (invErr) throw invErr;
  if (!invoice) throw new Error("Factura no encontrada o no está autorizada.");

  const rental = invoice.rentals;

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      rental_id: rental.id,
      method: "manual",
      amount: invoice.total_amount,
      status: "confirmed",
      transaction_date: new Date().toISOString(),
      registered_by: adminEmail,
      notes: `Factura de multa: mensualidad $${invoice.base_amount.toLocaleString("es-CL")} + multa $${invoice.late_fee_amount.toLocaleString("es-CL")} (${invoice.days_late} día(s) de atraso).`,
    })
    .select()
    .single();
  if (payErr) throw payErr;

  const syncResult = await syncAccessAfterPayment({
    rental,
    payment,
    accessAmount: invoice.base_amount,
  });

  const { error: updErr } = await supabase
    .from("invoices")
    .update({ status: "paid", payment_id: payment.id })
    .eq("id", invoice.id);
  if (updErr) throw updErr;

  return { payment, syncResult };
}
