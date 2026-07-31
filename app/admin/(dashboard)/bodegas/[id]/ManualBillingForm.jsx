"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ReceiptText } from "lucide-react";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** Botón de "facturación manual" en la ficha de bodega: registra un pago (Webpay o efectivo/transferencia) directo para este arriendo. El monto sugerido incluye cargos confirmados aún no facturados. */
export default function ManualBillingForm({ rentalId, defaultAmount, unbilledChargesTotal = 0, isFirstPayment = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(defaultAmount + unbilledChargesTotal);
  const [notes, setNotes] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/payments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalId, amount, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOpen(false);
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2"
      >
        <ReceiptText className="size-4" />
        Facturación manual
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
      {isFirstPayment && (
        <p className="text-xs text-text-muted">
          Primer pago: incluye el proporcional del mes en curso + el mes siguiente completo.
        </p>
      )}
      {unbilledChargesTotal > 0 && (
        <p className="text-xs text-warn">
          Incluye {clp.format(unbilledChargesTotal)} en cargos pendientes de esta bodega.
        </p>
      )}
      <div>
        <label className="mb-1.5 block text-sm text-text-muted">Monto (CLP)</label>
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-text-muted">Notas (ej. &quot;efectivo&quot;)</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          Registrar pago
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:text-text"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
