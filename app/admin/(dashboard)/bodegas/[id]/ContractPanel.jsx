"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText, Send, Upload, Download } from "lucide-react";

const STATUS_LABEL = {
  draft: "Borrador",
  sent_for_signature: "Enviado a firma",
  signed: "Firmado",
  cancelled: "Cancelado",
};

export default function ContractPanel({ rentalId, contract }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalId }),
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

  async function sendForSignature() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/contracts/${contract.id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadSigned(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/contracts/${contract.id}/upload-signed`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!contract) {
    return (
      <div>
        <p className="mb-3 text-sm text-text-muted">Sin contrato generado todavía.</p>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          Generar contrato
        </button>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-text-muted">
          Estado: <span className="font-medium text-text">{STATUS_LABEL[contract.status]}</span>
        </span>
        <span className="text-xs text-text-muted">
          Generado {new Date(contract.created_at).toLocaleDateString("es-CL")}
        </span>
      </div>

      <pre className="mb-4 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs text-text-muted">
        {contract.content}
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        {contract.status === "draft" && (
          <button
            onClick={sendForSignature}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition hover:text-text disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Marcar enviado a firma
          </button>
        )}

        {(contract.status === "draft" || contract.status === "sent_for_signature") && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              Subir PDF firmado
            </button>
            <input ref={fileInputRef} type="file" accept="application/pdf" onChange={uploadSigned} className="hidden" />
          </>
        )}

        {contract.status === "signed" && (
          <a
            href={`/api/admin/contracts/${contract.id}/download`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-1.5 rounded-lg border border-ok/40 px-3 py-2 text-sm text-ok transition hover:bg-ok/10"
          >
            <Download className="size-3.5" />
            Descargar PDF firmado
          </a>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
