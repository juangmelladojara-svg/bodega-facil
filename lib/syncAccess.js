import { getSupabaseAdmin } from "./supabase";
import { createPerson, extendCardValidity } from "./isapi";
import { computeNewValidUntil } from "./computeValidUntil.js";

export { computeNewValidUntil };

/**
 * Orquesta la sincronización con el controlador tras un pago ya confirmado
 * en la base de datos. SIEMPRE se llama después de que el pago quedó
 * guardado — un fallo acá nunca debe hacer perder el registro del pago,
 * solo queda como pendiente de reintento (ver access_control_log + cron).
 * También deja registrado en `payments` el período que cubre (`period_start`/
 * `period_end`) y `synced_at` si el hardware confirmó — así el caller no
 * necesita repetir esta lógica.
 *
 * `rental` debe venir con el warehouse embebido (`rentals(*, warehouses(*))`)
 * para poder resolver el portón (`gate_id`) físico correspondiente.
 */
export async function syncAccessAfterPayment({ rental, payment }) {
  const supabase = getSupabaseAdmin();

  const { validUntil: newValidUntil, periodStart } = computeNewValidUntil({
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

  const paymentUpdate = {
    period_start: periodStart.toISOString(),
    period_end: newValidUntil.toISOString(),
  };
  if (success) paymentUpdate.synced_at = new Date().toISOString();
  await supabase.from("payments").update(paymentUpdate).eq("id", payment.id);

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

  return { success, newValidUntil, periodStart, errorMessage };
}

/**
 * Pagos confirmados que todavía no sincronizaron con el controlador —
 * candidatos para el cron de reintento (`POST /api/cron/retry-sync`) y para
 * el botón manual de "reintentar sync" del admin. `synced_at` se setea en
 * `syncAccessAfterPayment` apenas el hardware confirma, así que este filtro
 * es directo e indexado (`payments_pending_sync_idx`) — sin escanear todo
 * `access_control_log` en cada llamada.
 */
export async function getPendingSyncPayments() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("payments")
    .select("*, rentals(*, warehouses(*))")
    .eq("status", "confirmed")
    .is("synced_at", null);

  if (error) throw error;

  return data ?? [];
}
