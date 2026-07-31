/**
 * Celulares chilenos: siempre +569 xxxx xxxx. El prefijo +569 es fijo/
 * predeterminado — el usuario solo escribe los 8 dígitos locales.
 */
const PREFIX = "+569";

/** Formatea progresivamente mientras se escribe (input controlado). Tolera que el usuario reescriba 569/56/9 al inicio. */
export function formatPhoneInput(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("569")) digits = digits.slice(3);
  else if (digits.startsWith("56")) digits = digits.slice(2);
  else if (digits.startsWith("9") && digits.length >= 9) digits = digits.slice(1);
  digits = digits.slice(0, 8);

  const part1 = digits.slice(0, 4);
  const part2 = digits.slice(4, 8);

  let result = PREFIX;
  if (part1) result += ` ${part1}`;
  if (part2) result += ` ${part2}`;
  return result;
}

/** true si `value` está vacío (opcional) o tiene el formato completo +569 xxxx xxxx. */
export function isValidPhone(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === PREFIX) return true;
  return /^\+569 \d{4} \d{4}$/.test(trimmed);
}

export { PREFIX as PHONE_PREFIX };
