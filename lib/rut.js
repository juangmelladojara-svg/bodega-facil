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

/** Formato de despliegue xx.xxx.xxx-x — para mostrar un RUT ya guardado (que se almacena sin puntos). */
export function formatRutDisplay(rut) {
  const clean = normalizeRut(rut);
  if (!clean) return "";
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dv ? `${withDots}-${dv}` : withDots;
}

/** Formatea progresivamente mientras se escribe (input controlado) — mismo formato xx.xxx.xxx-x. */
export function formatRutInput(raw) {
  const clean = String(raw ?? "")
    .replace(/[^\dkK]/g, "")
    .toUpperCase()
    .slice(0, 9);
  if (!clean) return "";
  const body = clean.length > 1 ? clean.slice(0, -1) : clean;
  const dv = clean.length > 1 ? clean.slice(-1) : "";
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dv ? `${withDots}-${dv}` : withDots;
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
