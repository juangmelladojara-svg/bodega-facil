import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";

export default async function PagoExitosoPage({ searchParams }) {
  const params = await searchParams;
  const syncPending = params?.syncPending === "true";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-xl shadow-black/20">
        <CheckCircle2 className="mx-auto size-12 text-ok" />
        <h1 className="mt-4 text-xl font-semibold text-text">Pago confirmado</h1>
        <p className="mt-2 text-sm text-text-muted">
          Tu pago quedó registrado correctamente. Gracias por confiar en Bodega Fácil.
        </p>

        {syncPending && (
          <div className="mt-6 rounded-xl border border-warn/30 bg-warn/10 p-4 text-left">
            <p className="flex items-center gap-2 text-sm font-medium text-warn">
              <Clock className="size-4" />
              Habilitación de acceso pendiente
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Tu pago está confirmado, pero la actualización de tu tarjeta de acceso
              está demorando en sincronizarse. Se reintentará automáticamente — si en
              unos minutos tu tarjeta sigue sin funcionar, contáctanos por WhatsApp.
            </p>
          </div>
        )}

        <Link
          href="/checkout"
          className="mt-6 inline-block rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition hover:text-text"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
