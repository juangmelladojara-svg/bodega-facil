"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

export default function NewChargeForm({ warehouseId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId, description, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDescription("");
      setAmount("");
      setOpen(false);
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
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition hover:text-text"
      >
        <Plus className="size-4" />
        Nuevo cargo
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
      <div>
        <label className="mb-1.5 block text-sm text-text-muted">Descripción</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Traslado flete a Temuco"
          required
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
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
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          Confirmar cargo
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
