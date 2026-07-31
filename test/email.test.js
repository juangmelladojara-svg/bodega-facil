import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidEmail } from "../lib/email.js";

test("isValidEmail acepta vacío (campo opcional)", () => {
  assert.equal(isValidEmail(""), true);
  assert.equal(isValidEmail(undefined), true);
});

test("isValidEmail exige un @ en el contenido", () => {
  assert.equal(isValidEmail("cliente@correo.cl"), true);
  assert.equal(isValidEmail("cliente"), false);
  assert.equal(isValidEmail("cliente.correo.cl"), false);
});
