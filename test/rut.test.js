import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRut, formatRut, isValidRut } from "../lib/rut.js";

test("normalizeRut quita puntos, guión y pasa a mayúsculas", () => {
  assert.equal(normalizeRut("12.345.678-5"), "123456785");
  assert.equal(normalizeRut("12345678-k"), "12345678K");
  assert.equal(normalizeRut(""), "");
});

test("formatRut inserta el guión antes del dígito verificador", () => {
  assert.equal(formatRut("123456785"), "12345678-5");
  assert.equal(formatRut("12.345.678-5"), "12345678-5");
});

test("isValidRut acepta RUTs con dígito verificador correcto (módulo 11)", () => {
  assert.equal(isValidRut("12345678-5"), true);
  assert.equal(isValidRut("12.345.678-5"), true);
  assert.equal(isValidRut("11111111-1"), true);
});

test("isValidRut acepta K como dígito verificador", () => {
  assert.equal(isValidRut("40000000-K"), true);
  assert.equal(isValidRut("40000000-k"), true);
});

test("isValidRut rechaza dígito verificador incorrecto", () => {
  assert.equal(isValidRut("12345678-9"), false);
  assert.equal(isValidRut("11111111-2"), false);
});

test("isValidRut rechaza formatos claramente inválidos", () => {
  assert.equal(isValidRut(""), false);
  assert.equal(isValidRut("abc"), false);
  assert.equal(isValidRut("123"), false);
  assert.equal(isValidRut(null), false);
  assert.equal(isValidRut(undefined), false);
});
