"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** `rentals` viene con `chargesTotal`, `isFirstPayment` y `baseAmount` (prorrateo si aplica) calculados en el server. */
export default function RegisterManualPaymentForm({ rentals }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rentalId, setRentalId] = useState(rentals[0]?.id ?? "");
  const [amount, setAmount] = useState((rentals[0]?.baseAmount ?? 0) + (rentals[0]?.chargesTotal ?? 0));
  const [notes, setNotes] = useState("");

  const selectedRental = rentals.find((item) => item.id === rentalId);

  function handleRentalChange(event) {
    const id = event.target.value;
    setRentalId(id);
    const rental = rentals.find((item) => item.id === id);
    if (rental) setAmount(rental.baseAmount + (rental.chargesTotal ?? 0));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/payments/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rentalId, amount, notes }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "No se pudo registrar el pago.");
      setLoading(false);
      return;
    }

    setNotes("");
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  if (rentals.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2"
      >
        <Plus className="size-4" />
        Registrar pago manual
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-3"
    >
      <div>
        <label className="mb-1.5 block text-sm text-text-muted">Bodega / arrendatario</label>
        <select
          value={rentalId}
          onChange={handleRentalChange}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {rentals.map((rental) => (
            <option key={rental.id} value={rental.id}>
              {rental.warehouses?.code} — {rental.tenants?.full_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-text-muted">Monto (CLP)</label>
        <input
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {selectedRental?.isFirstPayment && (
          <p className="mt-1 text-xs text-text-muted">
            Primer pago: incluye el proporcional del mes en curso + el mes siguiente completo.
          </p>
        )}
        {selectedRental?.chargesTotal > 0 && (
          <p className="mt-1 text-xs text-warn">
            Incluye {clp.format(selectedRental.chargesTotal)} en cargos pendientes.
          </p>
        )}
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-text-muted">Notas (ej. &quot;efectivo&quot;)</label>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {error && <p className="text-sm text-danger sm:col-span-3">{error}</p>}

      <div className="flex gap-2 sm:col-span-3">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          Registrar
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-muted hover:text-text"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
