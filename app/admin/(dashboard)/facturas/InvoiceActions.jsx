"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Falló.");
  return data;
}

/** Botón para generar (o actualizar) la factura de multa de un arriendo vencido que aún no tiene una. */
export function GenerateInvoiceButton({ rentalId }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      await post("/api/admin/invoices/generate", { rentalId });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-muted transition hover:text-text disabled:opacity-60"
      >
        {loading && <Loader2 className="size-3 animate-spin" />}
        Generar factura
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Botones de autorizar/marcar pagada para una factura de multa ya generada. */
export function InvoiceActions({ invoiceId, status }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAction(url) {
    setLoading(true);
    setError("");
    try {
      await post(url);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "pending_authorization" && (
        <button
          onClick={() => handleAction(`/api/admin/invoices/${invoiceId}/authorize`)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
        >
          {loading && <Loader2 className="size-3 animate-spin" />}
          Autorizar
        </button>
      )}
      {status === "authorized" && (
        <button
          onClick={() => handleAction(`/api/admin/invoices/${invoiceId}/mark-paid`)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-ok px-2.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {loading && <Loader2 className="size-3 animate-spin" />}
          Marcar pagada
        </button>
      )}
      {status === "paid" && <span className="text-xs text-ok">Pagada</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
