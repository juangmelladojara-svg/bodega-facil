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
