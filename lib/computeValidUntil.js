/**
 * Cálculo puro de vigencia y montos — sin dependencias (Supabase, ISAPI,
 * etc.) a propósito, para poder testearlo con `node --test` sin arrastrar el
 * resto del stack. Ver lib/syncAccess.js para la orquestación real.
 *
 * Modelo de cobro real (no el genérico "30 días rodantes por pago"):
 *   - Primer pago de un arriendo: el proporcional del mes en curso + el mes
 *     completo siguiente. Cubre el período 1 (el resto de este mes) y el
 *     período 2 (el mes siguiente completo) de una sola vez.
 *   - Desde el período 3 en adelante: pago plano de un mes, con vencimiento
 *     el día 10 del mes que se está pagando. `valid_until` se fija
 *     directamente en ese día 10 — así "vencido" (now > valid_until) y las
 *     multas por atraso (lib/invoices.js, cuenta días desde valid_until)
 *     siguen funcionando sin cambios: el "día 10" ES el corte real.
 *
 * Ej.: hoy 15 de julio, primer pago → cubre el resto de julio + agosto
 * completo → valid_until = 10 de septiembre 23:59:59 (vencimiento del
 * período 3). El siguiente pago (para septiembre) vuelve a extender por un
 * mes: valid_until = 10 de octubre. Y así sucesivamente.
 */

const DUE_DAY = 10;

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

/** Día 10 (23:59:59.999) del mes siguiente al de `date`. */
function nextDueDate(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, DUE_DAY, 23, 59, 59, 999);
}

/**
 * Monto del PRIMER pago de un arriendo: proporcional de los días restantes
 * del mes en curso (incluye hoy) + un mes completo. La tarifa diaria se
 * calcula sobre los días del mes en curso.
 */
export function computeFirstPaymentAmount({ monthlyAmount, now = new Date() }) {
  if (!(monthlyAmount > 0)) {
    throw new Error(`monthlyAmount inválido (${monthlyAmount}): debe ser mayor que 0.`);
  }
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1; // incluye el día de hoy
  const dailyRate = monthlyAmount / daysInMonth;
  const proratedStub = Math.round(dailyRate * daysLeft);
  return proratedStub + monthlyAmount;
}

/**
 * Calcula la nueva fecha de vigencia de la tarjeta y desde cuándo empieza a
 * cubrir el pago (`periodStart`).
 *
 * `isFirstPayment` distingue el pago inicial (prorrateo + mes siguiente,
 * vence el día 10 DOS meses adelante) de una renovación normal (vence el
 * día 10 del mes siguiente al período cubierto). Para renovaciones de más
 * de un mes de una vez, los meses pagados se redondean hacia abajo (nunca
 * se regala tiempo) usando `paidAmount`; el primer pago no usa este cálculo
 * porque su monto ya es prorrateado (ver `computeFirstPaymentAmount`).
 */
export function computeNewValidUntil({
  currentValidUntil,
  monthlyAmount,
  paidAmount,
  isFirstPayment = false,
  now = new Date(),
}) {
  if (!(monthlyAmount > 0)) {
    throw new Error(`monthlyAmount inválido (${monthlyAmount}): debe ser mayor que 0.`);
  }
  if (!(paidAmount > 0)) {
    throw new Error(`paidAmount inválido (${paidAmount}): debe ser mayor que 0.`);
  }

  const periodStart =
    currentValidUntil && new Date(currentValidUntil) > now ? new Date(currentValidUntil) : now;

  if (isFirstPayment || !currentValidUntil) {
    // Cubre el período 1 (resto de este mes) + período 2 (mes siguiente) de
    // una vez — el ciclo día-10 recién empieza a regir desde el período 3.
    const validUntil = addMonthsClamped(nextDueDate(now), 1);
    return { validUntil, periodStart: now };
  }

  const monthsPaid = Math.max(1, Math.floor(paidAmount / monthlyAmount));
  const validUntil = addMonthsClamped(nextDueDate(periodStart), monthsPaid - 1);
  return { validUntil, periodStart };
}
