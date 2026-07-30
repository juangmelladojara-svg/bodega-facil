"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

export default function NewWarehouseForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ code: "", name: "", gateId: "1", sizeM3: "", monthlyAmount: "" });

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/warehouses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "No se pudo crear la bodega.");
      setLoading(false);
      return;
    }

    setForm({ code: "", name: "", gateId: "1", sizeM3: "", monthlyAmount: "" });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2"
      >
        <Plus className="size-4" />
        Nueva bodega
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2"
    >
      <Field label="Código" value={form.code} onChange={update("code")} placeholder="B-014" required />
      <Field label="Nombre" value={form.name} onChange={update("name")} placeholder="Bodega 014 · 36 m³" required />
      <div>
        <label className="mb-1.5 block text-sm text-text-muted">Patio</label>
        <select
          value={form.gateId}
          onChange={update("gateId")}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="1">Patio 1</option>
          <option value="2">Patio 2</option>
        </select>
      </div>
      <Field label="Tamaño (m³)" type="number" value={form.sizeM3} onChange={update("sizeM3")} />
      <Field
        label="Monto mensual (CLP)"
        type="number"
        value={form.monthlyAmount}
        onChange={update("monthlyAmount")}
        required
      />

      {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}

      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          Guardar
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

function Field({ label, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm text-text-muted">{label}</label>
      <input
        {...props}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}
