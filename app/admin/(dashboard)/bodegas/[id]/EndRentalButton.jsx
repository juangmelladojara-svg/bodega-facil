"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, DoorOpen } from "lucide-react";

/** Termina el arriendo actual y libera la bodega — revoca el acceso físico si corresponde. */
export default function EndRentalButton({ rentalId }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (
      !confirm(
        "¿Terminar este arriendo y liberar la bodega? Se revocará el acceso físico de la tarjeta. El historial de pagos y cargos se conserva."
      )
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/rentals/${rentalId}/end`, { method: "POST" });
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
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-danger/40 px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <DoorOpen className="size-4" />}
        Terminar arriendo y liberar bodega
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
