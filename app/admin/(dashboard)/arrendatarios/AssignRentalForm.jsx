"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Warehouse } from "lucide-react";

export default function AssignRentalForm({ tenantId, availableWarehouses }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    warehouseId: availableWarehouses[0]?.id ?? "",
    cardUid: "",
  });

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/rentals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, warehouseId: form.warehouseId, cardUid: form.cardUid }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "No se pudo asignar la bodega.");
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  if (availableWarehouses.length === 0 && !open) {
    return <p className="text-xs text-text-muted">No hay bodegas libres para asignar.</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-accent-2 hover:underline"
      >
        <Warehouse className="size-3.5" />
        Asignar bodega
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-2 p-3">
      <div>
        <label className="mb-1 block text-xs text-text-muted">Bodega</label>
        <select
          value={form.warehouseId}
          onChange={(event) => setForm((prev) => ({ ...prev, warehouseId: event.target.value }))}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {availableWarehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">UID tarjeta (opcional)</label>
        <input
          value={form.cardUid}
          onChange={(event) => setForm((prev) => ({ ...prev, cardUid: event.target.value }))}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
      >
        {loading && <Loader2 className="size-3.5 animate-spin" />}
        Guardar
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text"
      >
        Cancelar
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}
