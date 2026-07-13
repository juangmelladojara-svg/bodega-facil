import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNewValidUntil } from "../lib/computeValidUntil.js";

const NOW = new Date(2026, 0, 15, 12, 0, 0); // 15 enero 2026, mediodía hora local

test("primer pago (sin currentValidUntil): parte y termina desde ahora", () => {
  const { periodStart, validUntil } = computeNewValidUntil({
    currentValidUntil: null,
    monthlyAmount: 10000,
    paidAmount: 10000,
    now: NOW,
  });

  assert.equal(periodStart.getTime(), NOW.getTime());
  assert.equal(validUntil.getFullYear(), 2026);
  assert.equal(validUntil.getMonth(), 1); // febrero (0-indexed)
  assert.equal(validUntil.getDate(), 15);
});

test("pago adelantado: extiende desde la vigencia actual, no desde ahora", () => {
  const currentValidUntil = new Date(2026, 0, 25, 12, 0, 0); // vence más adelante
  const { periodStart, validUntil } = computeNewValidUntil({
    currentValidUntil,
    monthlyAmount: 10000,
    paidAmount: 10000,
    now: NOW,
  });

  assert.equal(periodStart.getTime(), currentValidUntil.getTime());
  assert.equal(validUntil.getMonth(), 1);
  assert.equal(validUntil.getDate(), 25);
});

test("arriendo vencido: extiende desde ahora, no desde la fecha vencida", () => {
  const currentValidUntil = new Date(2025, 11, 1); // venció el mes pasado
  const { periodStart } = computeNewValidUntil({
    currentValidUntil,
    monthlyAmount: 10000,
    paidAmount: 10000,
    now: NOW,
  });

  assert.equal(periodStart.getTime(), NOW.getTime());
});

test("los meses pagados se redondean hacia abajo (nunca se regala tiempo)", () => {
  const { validUntil: v1 } = computeNewValidUntil({
    currentValidUntil: null,
    monthlyAmount: 10000,
    paidAmount: 19999, // casi 2 meses, pero no llega
    now: NOW,
  });
  assert.equal(v1.getMonth(), 1); // solo +1 mes, no +2

  const { validUntil: v2 } = computeNewValidUntil({
    currentValidUntil: null,
    monthlyAmount: 10000,
    paidAmount: 25000, // 2.5 meses
    now: NOW,
  });
  assert.equal(v2.getMonth(), 2); // +2 meses exactos (marzo), el medio mes no se otorga
});

test("un pago menor a una mensualidad igual otorga el mínimo de 1 mes", () => {
  const { validUntil } = computeNewValidUntil({
    currentValidUntil: null,
    monthlyAmount: 10000,
    paidAmount: 3000,
    now: NOW,
  });
  assert.equal(validUntil.getMonth(), 1);
});

test("31 de enero + 1 mes no desborda a marzo (clamp a fin de febrero)", () => {
  const jan31 = new Date(2026, 0, 31, 12, 0, 0); // 2026 no es bisiesto
  const { validUntil } = computeNewValidUntil({
    currentValidUntil: null,
    monthlyAmount: 10000,
    paidAmount: 10000,
    now: jan31,
  });

  assert.equal(validUntil.getMonth(), 1); // febrero, no marzo
  assert.equal(validUntil.getDate(), 28);
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
