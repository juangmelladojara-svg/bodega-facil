"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { formatRutInput } from "@/lib/rut";
import { formatPhoneInput, isValidPhone } from "@/lib/phone";
import { isValidEmail } from "@/lib/email";

export default function NewTenantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ rut: "", fullName: "", phone: "+569", email: "" });

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }
  function updateRut() {
    return (event) => setForm((prev) => ({ ...prev, rut: formatRutInput(event.target.value) }));
  }
  function updatePhone() {
    return (event) => setForm((prev) => ({ ...prev, phone: formatPhoneInput(event.target.value) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!isValidPhone(form.phone)) {
      setError("El teléfono debe tener el formato +569 xxxx xxxx.");
      return;
    }
    if (!isValidEmail(form.email)) {
      setError("El email debe contener un @.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "No se pudo crear el arrendatario.");
      setLoading(false);
      return;
    }

    setForm({ rut: "", fullName: "", phone: "+569", email: "" });
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
        Nuevo arrendatario
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2"
    >
      <Field label="RUT" value={form.rut} onChange={updateRut()} placeholder="12.345.678-9" required />
      <Field label="Nombre completo" value={form.fullName} onChange={update("fullName")} required />
      <Field label="Teléfono" value={form.phone} onChange={updatePhone()} placeholder="+569 xxxx xxxx" />
      <Field label="Email" type="email" value={form.email} onChange={update("email")} />

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
