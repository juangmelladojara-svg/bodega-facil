import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNewValidUntil, computeFirstPaymentAmount, addMonthsClamped } from "../lib/computeValidUntil.js";

const NOW = new Date(2026, 6, 15, 12, 0, 0); // 15 julio 2026, mediodía hora local

test("primer pago: cubre el resto del mes + el mes siguiente, vence el día 10 dos meses adelante", () => {
  const { periodStart, validUntil } = computeNewValidUntil({
    currentValidUntil: null,
    monthlyAmount: 10000,
    paidAmount: 10000,
    now: NOW,
  });

  assert.equal(periodStart.getTime(), NOW.getTime());
  assert.equal(validUntil.getFullYear(), 2026);
  assert.equal(validUntil.getMonth(), 8); // septiembre (0-indexed) — julio(stub) + agosto(mes 2) → vence 10-sep
  assert.equal(validUntil.getDate(), 10);
  assert.equal(validUntil.getHours(), 23);
});

test("primer pago explícito con isFirstPayment: mismo resultado aunque currentValidUntil venga null", () => {
  const { validUntil } = computeNewValidUntil({
    currentValidUntil: null,
    monthlyAmount: 10000,
    paidAmount: 10000,
    isFirstPayment: true,
    now: NOW,
  });
  assert.equal(validUntil.getMonth(), 8);
  assert.equal(validUntil.getDate(), 10);
});

test("renovación (aún vigente): extiende desde la vigencia actual, vence el día 10 del mes siguiente a ese período", () => {
  const currentValidUntil = new Date(2026, 8, 10, 23, 59, 59, 999); // vence 10 de septiembre (período pagado hasta ahí)
  const { periodStart, validUntil } = computeNewValidUntil({
    currentValidUntil,
    monthlyAmount: 10000,
    paidAmount: 10000,
    now: NOW,
  });

  assert.equal(periodStart.getTime(), currentValidUntil.getTime());
  assert.equal(validUntil.getMonth(), 9); // octubre
  assert.equal(validUntil.getDate(), 10);
});

test("arriendo vencido: extiende desde ahora, no desde la fecha vencida, y vence el 10 del mes siguiente", () => {
  const currentValidUntil = new Date(2026, 4, 10); // venció hace dos meses
  const { periodStart, validUntil } = computeNewValidUntil({
    currentValidUntil,
    monthlyAmount: 10000,
    paidAmount: 10000,
    now: NOW,
  });

  assert.equal(periodStart.getTime(), NOW.getTime());
  assert.equal(validUntil.getMonth(), 7); // agosto (mes siguiente a julio, mes de "now")
  assert.equal(validUntil.getDate(), 10);
});

test("renovación: los meses pagados de más se redondean hacia abajo (nunca se regala tiempo)", () => {
  const currentValidUntil = new Date(2026, 8, 10, 23, 59, 59, 999);
  const { validUntil: v1 } = computeNewValidUntil({
    currentValidUntil,
    monthlyAmount: 10000,
    paidAmount: 19999, // casi 2 meses, pero no llega
    now: NOW,
  });
  assert.equal(v1.getMonth(), 9); // solo +1 mes (octubre)

  const { validUntil: v2 } = computeNewValidUntil({
    currentValidUntil,
    monthlyAmount: 10000,
    paidAmount: 25000, // 2.5 meses
    now: NOW,
  });
  assert.equal(v2.getMonth(), 10); // +2 meses exactos (noviembre), el medio mes no se otorga
});

test("renovación: un pago menor a una mensualidad igual otorga el mínimo de 1 mes", () => {
  const currentValidUntil = new Date(2026, 8, 10, 23, 59, 59, 999);
  const { validUntil } = computeNewValidUntil({
    currentValidUntil,
    monthlyAmount: 10000,
    paidAmount: 3000,
    now: NOW,
  });
  assert.equal(validUntil.getMonth(), 9);
});

test("lanza si monthlyAmount no es mayor que 0", () => {
  assert.throws(() =>
    computeNewValidUntil({ currentValidUntil: null, monthlyAmount: 0, paidAmount: 10000, now: NOW })
  );
  assert.throws(() =>
    computeNewValidUntil({ currentValidUntil: null, monthlyAmount: -5, paidAmount: 10000, now: NOW })
  );
});

test("lanza si paidAmount no es mayor que 0", () => {
  assert.throws(() =>
    computeNewValidUntil({ currentValidUntil: null, monthlyAmount: 10000, paidAmount: 0, now: NOW })
  );
});

test("addMonthsClamped: 31 de enero + 1 mes no desborda a marzo (clamp a fin de febrero)", () => {
  const jan31 = new Date(2026, 0, 31, 12, 0, 0); // 2026 no es bisiesto
  const result = addMonthsClamped(jan31, 1);
  assert.equal(result.getMonth(), 1); // febrero, no marzo
  assert.equal(result.getDate(), 28);
});

test("computeFirstPaymentAmount: prorratea los días restantes del mes + un mes completo", () => {
  // 15 de julio 2026 (31 días): quedan 17 días (incluye hoy) → 17/31 * 10000 + 10000
  const amount = computeFirstPaymentAmount({ monthlyAmount: 10000, now: NOW });
  const expectedStub = Math.round((10000 / 31) * 17);
  assert.equal(amount, expectedStub + 10000);
});

test("computeFirstPaymentAmount: el primer día del mes prorratea el mes completo (no regala nada extra)", () => {
  const firstOfMonth = new Date(2026, 5, 1, 9, 0, 0); // 1 de junio 2026 (30 días)
  const amount = computeFirstPaymentAmount({ monthlyAmount: 30000, now: firstOfMonth });
  // 30 días restantes de 30 → prorrateo = mensualidad completa → total = 2x mensualidad
  assert.equal(amount, 60000);
});

test("computeFirstPaymentAmount: lanza si monthlyAmount no es mayor que 0", () => {
  assert.throws(() => computeFirstPaymentAmount({ monthlyAmount: 0, now: NOW }));
});
