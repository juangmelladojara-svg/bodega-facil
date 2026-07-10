export function normalizeRut(rut) {
  return String(rut ?? "")
    .replace(/[.\s]/g, "")
    .replace("-", "")
    .toUpperCase();
}

export function formatRut(rut) {
  const clean = normalizeRut(rut);
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

export function isValidRut(rut) {
  const clean = normalizeRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);

  return expectedDv === dv;
}
