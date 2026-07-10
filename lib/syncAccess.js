import { getSupabaseAdmin } from "./supabase";
import { createPerson, extendCardValidity } from "./isapi";

/**
 * Calcula la nueva fecha de vigencia de la tarjeta. Si el arriendo ya está
 * vigente (paga adelantado, antes de vencer), extiende desde `currentValidUntil`
 * para no perder días ya pagados. Si está vencido o es la primera vez, extiende
 * desde ahora.
 */
export function computeNewValidUntil({ currentValidUntil, monthlyAmount, paidAmount, now = new Date() }) {
  const base =
    currentValidUntil && new Date(currentValidUntil) > now ? new Date(currentValidUntil) : now;

  const monthsPaid = Math.max(1, Math.round(paidAmount / monthlyAmount));

  const result = new Date(base);
  result.setMonth(result.getMonth() + monthsPaid);
  return result;
}

/**
 * Orquesta la sincronización con el controlador tras un pago ya confirmado
 * en la base de datos. SIEMPRE se llama después de que el pago quedó
 * guardado — un fallo acá nunca debe hacer perder el registro del pago,
 * solo queda como pendiente de reintento (ver access_control_log + cron).
 *
 * `rental` debe venir con el warehouse embebido (`rentals(*, warehouses(*))`)
 * para poder resolver el portón (`gate_id`) físico correspondiente.
 */
export async function syncAccessAfterPayment({ rental, payment }) {
  const supabase = getSupabaseAdmin();

  const newValidUntil = computeNewValidUntil({
    currentValidUntil: rental.valid_until,
    monthlyAmount: rental.monthly_amount,
    paidAmount: payment.amount,
  });

  const doorNo = rental.warehouses?.gate_id;
  const warehouseLabel = rental.warehouses?.name ?? rental.warehouse_id;

  let action = "extend_validity";
  let result;
  let success = false;
  let errorMessage = null;

  try {
    if (!rental.controller_person_id) {
      // Primera sincronización de esta tarjeta: enrola a la persona en el
      // controlador y usa el id de la propia rental como employeeNo estable.
      action = "create_person";
      result = await createPerson({
        employeeNo: rental.id,
        name: warehouseLabel,
        validFrom: new Date(),
        validUntil: newValidUntil,
        doorNo,
      });
    } else {
      result = await extendCardValidity({
        employeeNo: rental.controller_person_id,
        validFrom: new Date(),
        validUntil: newValidUntil,
        doorNo,
      });
    }
    success = true;
  } catch (err) {
    errorMessage = err.message || String(err);
    result = err.response ?? null;
  }

  await supabase.from("access_control_log").insert({
    rental_id: rental.id,
    payment_id: payment.id,
    action,
    request_payload: { rentalId: rental.id, newValidUntil: newValidUntil.toISOString() },
    response_payload: result,
    success,
    error_message: errorMessage,
  });

  if (success) {
    const controllerPersonId = rental.controller_person_id ?? rental.id;
    await supabase
      .from("rentals")
      .update({
        valid_until: newValidUntil.toISOString(),
        status: "active",
        controller_person_id: controllerPersonId,
      })
      .eq("id", rental.id);
  }

  return { success, newValidUntil, errorMessage };
}

/**
 * Pagos confirmados que todavía no tienen un `access_control_log` exitoso
 * asociado — candidatos para el cron de reintento (`POST /api/cron/retry-sync`).
 */
export async function getPendingSyncPayments() {
  const supabase = getSupabaseAdmin();

  const { data: confirmedPayments, error: paymentsError } = await supabase
    .from("payments")
    .select("*, rentals(*, warehouses(*))")
    .eq("status", "confirmed");

  if (paymentsError) throw paymentsError;
  if (!confirmedPayments?.length) return [];

  const { data: successLogs, error: logsError } = await supabase
    .from("access_control_log")
    .select("payment_id")
    .eq("success", true)
    .not("payment_id", "is", null);

  if (logsError) throw logsError;

  const successfulPaymentIds = new Set(successLogs.map((log) => log.payment_id));

  return confirmedPayments.filter((payment) => !successfulPaymentIds.has(payment.id));
}
