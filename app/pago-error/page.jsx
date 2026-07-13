import Link from "next/link";
import { XCircle } from "lucide-react";

const MESSAGES = {
  cancelado: "Cancelaste el pago antes de completarlo en Webpay.",
  rechazado: "Tu banco rechazó el pago. Puedes intentarlo nuevamente.",
  no_encontrado: "No pudimos encontrar tu transacción. Intenta iniciar el pago de nuevo.",
  error_interno: "Ocurrió un error interno al procesar tu pago. Escríbenos si el problema persiste.",
  procesando:
    "Tu pago ya se está procesando en otra pestaña o intento — espera un momento y revisa el estado de tu bodega antes de volver a pagar.",
};

export default async function PagoErrorPage({ searchParams }) {
  const params = await searchParams;
  const motivo = params?.motivo;
  const message = MESSAGES[motivo] ?? "No pudimos completar tu pago.";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-xl shadow-black/20">
        <XCircle className="mx-auto size-12 text-danger" />
        <h1 className="mt-4 text-xl font-semibold text-text">No se pudo completar el pago</h1>
        <p className="mt-2 text-sm text-text-muted">{message}</p>

        <Link
          href="/checkout"
          className="mt-6 inline-block rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2"
        >
          Intentar de nuevo
        </Link>
      </div>
    </main>
  );
}
