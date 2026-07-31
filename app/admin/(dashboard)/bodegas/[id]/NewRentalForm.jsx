"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText } from "lucide-react";

/**
 * Punto de partida de un arriendo nuevo: el contrato. En vez de crear
 * primero una ficha de arrendatario aparte, este formulario junta los
 * datos del contrato (RUT, nombre, teléfono, email) y con eso el backend
 * crea (o reutiliza por RUT) el arrendatario, el arriendo y el contrato
 * en borrador en una sola operación.
 */
export default function NewRentalForm({ warehouseId, defaultAmount }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    rut: "",
    fullName: "",
    phone: "",
    email: "",
    monthlyAmount: defaultAmount,
    cardUid: "",
  });

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/rentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rut: form.rut,
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          warehouseId,
          cardUid: form.cardUid,
          monthlyAmount: form.monthlyAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-text-muted">
        Completa los datos del contrato — con esto se crea la ficha del arrendatario, el
        arriendo y el contrato en borrador.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RUT" value={form.rut} onChange={update("rut")} placeholder="12.345.678-9" required />
        <Field label="Nombre completo" value={form.fullName} onChange={update("fullName")} required />
        <Field label="Teléfono" value={form.phone} onChange={update("phone")} placeholder="+56 9 ..." />
        <Field label="Email" type="email" value={form.email} onChange={update("email")} />
        <Field
          label="Monto mensual (CLP)"
          type="number"
          min="1"
          value={form.monthlyAmount}
          onChange={update("monthlyAmount")}
          required
        />
        <Field label="UID tarjeta (opcional)" value={form.cardUid} onChange={update("cardUid")} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
        Generar contrato y crear arriendo
      </button>
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
