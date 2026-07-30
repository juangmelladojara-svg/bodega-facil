import { getSupabaseAdmin } from "./supabase";

/**
 * Cargos confirmados de una bodega que todavía no se facturaron
 * (payment_id is null). Es lo que se suma a la mensualidad al cobrar.
 */
export async function getUnbilledCharges(warehouseId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("warehouse_charges")
    .select("*")
    .eq("warehouse_id", warehouseId)
    .eq("status", "confirmed")
    .is("payment_id", null)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/**
 * Reclama un set específico de cargos para un pago (los marca con
 * payment_id). Se pasa la lista de IDs ya leída (no se vuelve a consultar
 * "qué está pendiente ahora") para que un cargo agregado DESPUÉS de armar
 * el cobro no se cuele en un pago cuyo monto ya quedó fijado.
 */
export async function reserveChargesForPayment(chargeIds, paymentId) {
  if (!chargeIds?.length) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("warehouse_charges")
    .update({ payment_id: paymentId })
    .in("id", chargeIds)
    .is("payment_id", null); // defensivo: no pisar una reserva ya hecha por otro pago
  if (error) throw error;
}

/**
 * Libera los cargos reservados por un pago que falló/se abandonó, para que
 * vuelvan a estar disponibles en el próximo cobro.
 */
export async function releaseChargesForPayment(paymentId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("warehouse_charges")
    .update({ payment_id: null })
    .eq("payment_id", paymentId);
  if (error) throw error;
}
