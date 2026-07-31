import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhoneInput, isValidPhone } from "../lib/phone.js";

test("formatPhoneInput siempre parte con el prefijo +569", () => {
  assert.equal(formatPhoneInput(""), "+569");
  assert.equal(formatPhoneInput("1"), "+569 1");
  assert.equal(formatPhoneInput("1234"), "+569 1234");
  assert.equal(formatPhoneInput("12345678"), "+569 1234 5678");
});

test("formatPhoneInput ignora dígitos extra más allá de los 8 locales", () => {
  assert.equal(formatPhoneInput("123456789999"), "+569 1234 5678");
});

test("formatPhoneInput tolera que el usuario reescriba el prefijo (569/56/9)", () => {
  assert.equal(formatPhoneInput("56912345678"), "+569 1234 5678");
  assert.equal(formatPhoneInput("912345678"), "+569 1234 5678");
});

test("isValidPhone acepta vacío o solo el prefijo (campo opcional)", () => {
  assert.equal(isValidPhone(""), true);
  assert.equal(isValidPhone("+569"), true);
  assert.equal(isValidPhone(undefined), true);
});

test("isValidPhone exige el formato completo +569 xxxx xxxx cuando hay contenido", () => {
  assert.equal(isValidPhone("+569 1234 5678"), true);
  assert.equal(isValidPhone("+569 1234"), false);
  assert.equal(isValidPhone("912345678"), false);
});
