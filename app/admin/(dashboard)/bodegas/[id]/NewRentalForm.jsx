"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText, Upload, Check, ArrowRight } from "lucide-react";
import { formatRutInput } from "@/lib/rut";
import { formatPhoneInput, isValidPhone } from "@/lib/phone";
import { isValidEmail } from "@/lib/email";

const EMPTY_COMPANY = {
  companyRut: "",
  razonSocial: "",
  giro: "",
  companyAddress: "",
  legalRepRut: "",
  legalRepName: "",
  companyEmail: "",
};

/**
 * Punto de partida de un arriendo nuevo: el contrato. En vez de crear
 * primero una ficha de arrendatario aparte, este formulario junta los
 * datos del contrato (cédula, dirección, contacto, y datos de empresa si
 * corresponde) y con eso el backend crea (o reutiliza por RUT) el
 * arrendatario, el arriendo y el contrato en borrador. Después de crear el
 * arriendo, un segundo paso permite subir la foto de la cédula.
 */
export default function NewRentalForm({ warehouseId, defaultAmount }) {
  const router = useRouter();
  const [step, setStep] = useState("form"); // "form" | "photos" | "done"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tenantId, setTenantId] = useState(null);
  const [isCompany, setIsCompany] = useState(false);
  const [form, setForm] = useState({
    rut: "",
    fullName: "",
    phone: "+569",
    email: "",
    referenceAddress: "",
    monthlyAmount: defaultAmount,
    cardUid: "",
    rentalTerm: "mensual",
  });
  const [company, setCompany] = useState(EMPTY_COMPANY);
  const [photos, setPhotos] = useState({ front: null, back: null });
  const [photoStatus, setPhotoStatus] = useState({ front: "idle", back: "idle" }); // idle|uploading|done|error

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }
  function updateRut(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: formatRutInput(event.target.value) }));
  }
  function updatePhone() {
    return (event) => setForm((prev) => ({ ...prev, phone: formatPhoneInput(event.target.value) }));
  }
  function updateCompany(field) {
    return (event) => setCompany((prev) => ({ ...prev, [field]: event.target.value }));
  }
  function updateCompanyRut(field) {
    return (event) => setCompany((prev) => ({ ...prev, [field]: formatRutInput(event.target.value) }));
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
    if (isCompany && !isValidEmail(company.companyEmail)) {
      setError("El mail de la empresa debe contener un @.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/rentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rut: form.rut,
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          referenceAddress: form.referenceAddress,
          warehouseId,
          cardUid: form.cardUid,
          monthlyAmount: form.monthlyAmount,
          rentalTerm: form.rentalTerm,
          company: isCompany ? company : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTenantId(data.tenant.id);
      setStep("photos");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(side, file) {
    if (!file || !tenantId) return;
    setPhotoStatus((prev) => ({ ...prev, [side]: "uploading" }));
    try {
      const formData = new FormData();
      formData.append("side", side);
      formData.append("file", file);
      const res = await fetch(`/api/admin/tenants/${tenantId}/id-photo`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhotoStatus((prev) => ({ ...prev, [side]: "done" }));
    } catch {
      setPhotoStatus((prev) => ({ ...prev, [side]: "error" }));
    }
  }

  function finish() {
    router.refresh();
  }

  if (step === "photos") {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-surface-2 p-4">
        <p className="text-sm text-text">
          Arriendo y contrato creados. Sube la foto de la cédula (opcional, puedes hacerlo después desde la ficha).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <PhotoField
            label="Cédula — anverso"
            status={photoStatus.front}
            onChange={(file) => {
              setPhotos((prev) => ({ ...prev, front: file }));
              handlePhotoUpload("front", file);
            }}
          />
          <PhotoField
            label="Cédula — reverso"
            status={photoStatus.back}
            onChange={(file) => {
              setPhotos((prev) => ({ ...prev, back: file }));
              handlePhotoUpload("back", file);
            }}
          />
        </div>
        <button
          onClick={finish}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2"
        >
          Listo
          <ArrowRight className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-text-muted">
        Completa los datos del contrato — con esto se crea la ficha del arrendatario, el
        arriendo y el contrato en borrador.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RUT" value={form.rut} onChange={updateRut("rut")} placeholder="12.345.678-9" required />
        <Field label="Nombre completo" value={form.fullName} onChange={update("fullName")} required />
        <Field
          label="Teléfono (WhatsApp de contacto)"
          value={form.phone}
          onChange={updatePhone()}
          placeholder="+569 xxxx xxxx"
        />
        <Field label="Email" type="email" value={form.email} onChange={update("email")} />
        <Field
          label="Dirección de referencia"
          value={form.referenceAddress}
          onChange={update("referenceAddress")}
          className="sm:col-span-2"
        />
        <Field
          label="Monto mensual (CLP)"
          type="number"
          min="1"
          value={form.monthlyAmount}
          onChange={update("monthlyAmount")}
          required
        />
        <Field label="UID tarjeta (opcional)" value={form.cardUid} onChange={update("cardUid")} />
        <div>
          <label className="mb-1.5 block text-sm text-text-muted">Plazo</label>
          <select
            value={form.rentalTerm}
            onChange={update("rentalTerm")}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="mensual">Mensual (mínimo 3 meses)</option>
            <option value="diario">Diario (sin plazo mínimo)</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text">
        <input type="checkbox" checked={isCompany} onChange={(e) => setIsCompany(e.target.checked)} />
        Arrienda a nombre de una empresa
      </label>

      {isCompany && (
        <div className="grid gap-3 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-2">
          <Field label="RUT empresa" value={company.companyRut} onChange={updateCompanyRut("companyRut")} required />
          <Field label="Razón social" value={company.razonSocial} onChange={updateCompany("razonSocial")} required />
          <Field label="Giro" value={company.giro} onChange={updateCompany("giro")} />
          <Field label="Dirección empresa" value={company.companyAddress} onChange={updateCompany("companyAddress")} />
          <Field
            label="RUT representante legal"
            value={company.legalRepRut}
            onChange={updateCompanyRut("legalRepRut")}
            required
          />
          <Field
            label="Nombre representante legal"
            value={company.legalRepName}
            onChange={updateCompany("legalRepName")}
            required
          />
          <Field
            label="Mail empresa"
            type="email"
            value={company.companyEmail}
            onChange={updateCompany("companyEmail")}
            className="sm:col-span-2"
          />
        </div>
      )}

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

function Field({ label, className = "", ...props }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm text-text-muted">{label}</label>
      <input
        {...props}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}

function PhotoField({ label, status, onChange }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center justify-between text-sm text-text-muted">
        {label}
        {status === "done" && <Check className="size-3.5 text-ok" />}
        {status === "uploading" && <Loader2 className="size-3.5 animate-spin" />}
        {status === "error" && <span className="text-xs text-danger">Error al subir</span>}
      </label>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2.5 text-sm text-text-muted hover:text-text">
        <Upload className="size-4" />
        Elegir archivo
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}
