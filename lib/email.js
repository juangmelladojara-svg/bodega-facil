/** Validación mínima a propósito: solo exige un "@" en el contenido (pedido explícito), no un regex RFC completo. Vacío se considera válido (campo opcional). */
export function isValidEmail(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return true;
  return trimmed.includes("@");
}
