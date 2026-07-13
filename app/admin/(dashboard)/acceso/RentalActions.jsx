"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Ban } from "lucide-react";

export default function RentalActions({ rentalId }) {
  const router = useRouter();
  const [pending, setPending] = useState(null); // "retry" | "revoke" | null
  const [message, setMessage] = useState("");

  async function runAction(action, endpoint) {
    setPending(action);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/rentals/${rentalId}/${endpoint}`, { method: "POST" });
      const data = await response.json();
      setMessage(response.ok && data.success ? "OK" : data.error ?? "Falló.");
    } catch {
      setMessage("Error de conexión.");
    } finally {
      setPending(null);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => runAction("retry", "retry-sync")}
        disabled={pending !== null}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-muted transition hover:text-text disabled:opacity-60"
      >
        {pending === "retry" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        Reintentar sync
      </button>
      <button
        onClick={() => {
          if (confirm("¿Revocar el acceso de esta tarjeta ahora?")) runAction("revoke", "revoke");
        }}
        disabled={pending !== null}
        className="flex items-center gap-1.5 rounded-lg border border-danger/40 px-2.5 py-1.5 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-60"
      >
        {pending === "revoke" ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
        Revocar
      </button>
      {message && <span className="text-xs text-text-muted">{message}</span>}
    </div>
  );
}
