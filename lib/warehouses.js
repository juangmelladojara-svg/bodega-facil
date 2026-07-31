/**
 * Una bodega puede tener varios arriendos históricos (`status = 'ended'`) —
 * ver `rentals_warehouse_active_idx` en el schema. `warehouse.rentals`
 * embebido puede venir como objeto o array según cómo PostgREST infiera la
 * relación; se normaliza acá para no repetir esa lógica en cada página.
 */
export function activeRentalsOf(warehouse) {
  const raw = warehouse.rentals;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.filter((r) => r.status !== "ended");
}

export function isOccupied(warehouse) {
  return activeRentalsOf(warehouse).length > 0;
}

/**
 * Estado de ocupación para la tabla de bodegas: 'libre' (sin arriendo
 * vigente), 'firma' (arriendo vigente pero el contrato más reciente todavía
 * no se firma — draft o sent_for_signature) u 'ocupada' (contrato firmado,
 * o sin contrato registrado — ej. arriendos creados antes de esta
 * funcionalidad). Requiere que `rentals` venga embebido con `contracts(status, created_at)`.
 */
export function getOccupancyStatus(warehouse) {
  const activeRentals = activeRentalsOf(warehouse);
  if (activeRentals.length === 0) return "libre";

  const rental = activeRentals[0];
  const contracts = Array.isArray(rental.contracts) ? rental.contracts : rental.contracts ? [rental.contracts] : [];
  if (contracts.length === 0) return "ocupada";

  const latest = [...contracts].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
  if (latest.status === "draft" || latest.status === "sent_for_signature") return "firma";
  return "ocupada";
}
