/**
 * Cálculo puro de vigencia — sin dependencias (Supabase, ISAPI, etc.) a
 * propósito, para poder testearlo con `node --test` sin arrastrar el resto
 * del stack. Ver lib/syncAccess.js para la orquestación real.
 */

/**
 * Suma `months` a `date` sin desbordar de mes (31 de enero + 1 mes → 28/29 de
 * febrero, no 3 de marzo). `Date#setMonth` nativo desborda porque JS normaliza
 * el día sobrante hacia el mes siguiente.
 */
export function addMonthsClamped(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInTargetMonth));
  return result;
}

/**
 * Calcula la nueva fecha de vigencia de la tarjeta y desde cuándo empieza a
 * cubrir el pago (`periodStart`). Si el arriendo ya está vigente (paga
 * adelantado, antes de vencer), extiende desde `currentValidUntil` para no
 * perder días ya pagados — `periodStart` también queda en esa fecha, para no
 * solapar el período cubierto con el pago anterior. Si está vencido o es la
 * primera vez, ambos parten desde ahora.
 *
 * Los meses pagados se redondean HACIA ABAJO (nunca se regala tiempo): un
 * pago de 1.9 mensualidades otorga 1 mes. No hay lógica de "crédito" para el
 * excedente — si eso importa, revisar `notes`/`amount` del pago manualmente.
 */
export function computeNewValidUntil({ currentValidUntil, monthlyAmount, paidAmount, now = new Date() }) {
  if (!(monthlyAmount > 0)) {
    throw new Error(`monthlyAmount inválido (${monthlyAmount}): debe ser mayor que 0.`);
  }
  if (!(paidAmount > 0)) {
    throw new Error(`paidAmount inválido (${paidAmount}): debe ser mayor que 0.`);
  }

  const periodStart =
    currentValidUntil && new Date(currentValidUntil) > now ? new Date(currentValidUntil) : now;

  const monthsPaid = Math.max(1, Math.floor(paidAmount / monthlyAmount));
  const validUntil = addMonthsClamped(periodStart, monthsPaid);

  return { validUntil, periodStart };
}
