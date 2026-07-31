"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X, ArrowRight } from "lucide-react";

/** Aviso tipo "toast" que aparece al entrar a Arrendatarios si hay arriendos vencidos. */
export default function OverdueToast({ count }) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (count > 0) {
      const timer = setTimeout(() => setVisible(true), 150);
      return () => clearTimeout(timer);
    }
  }, [count]);

  if (count === 0 || dismissed) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 w-[calc(100%-3rem)] max-w-sm rounded-2xl border border-danger/40 bg-surface p-4 shadow-xl shadow-black/20 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="flex-1">
          <p className="text-sm font-medium text-text">
            {count} arrendatario{count === 1 ? "" : "s"} con arriendo vencido
          </p>
          <Link
            href="/admin/facturas?filter=vencidas"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-danger underline hover:no-underline"
          >
            Ver facturas vencidas
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar"
          className="text-text-muted transition hover:text-text"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
