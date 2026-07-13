"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, CreditCard, CheckCircle2, AlertTriangle, Warehouse } from "lucide-react";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default function CheckoutPage() {
  const [rut, setRut] = useState("");
  const [status, setStatus] = useState("idle"); // idle | looking | found | error
  const [errorMessage, setErrorMessage] = useState("");
  const [tenant, setTenant] = useState(null);
  const [rentals, setRentals] = useState([]);
  const [payingRentalId, setPayingRentalId] = useState(null);
  const [webpayAction, setWebpayAction] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (webpayAction && formRef.current) {
      formRef.current.submit();
    }
  }, [webpayAction]);

  async function handleLookup(event) {
    event.preventDefault();
    setStatus("looking");
    setErrorMessage("");

    try {
      const response = await fetch("/api/rentals/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(data.error ?? "No pudimos encontrar tu arriendo.");
        return;
      }

      setTenant(data.tenant);
      setRentals(data.rentals);
      setStatus("found");
    } catch {
      setStatus("error");
      setErrorMessage("Error de conexión. Intenta nuevamente.");
    }
  }

  async function handlePay(rentalId) {
    setPayingRentalId(rentalId);
    setErrorMessage("");

    try {
      const response = await fetch("/api/payments/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalId }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error ?? "No se pudo iniciar el pago.");
        setPayingRentalId(null);
        return;
      }

      setWebpayAction({ url: data.url, token: data.token });
    } catch {
      setErrorMessage("Error de conexión al iniciar el pago.");
      setPayingRentalId(null);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-2">Bodegar Fácil</p>
          <h1 className="mt-2 text-2xl font-semibold text-text">Consulta y pago de tu bodega</h1>
          <p className="mt-2 text-sm text-text-muted">
            Ingresa tu RUT para ver tus bodegas y el estado de pago.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xl shadow-black/20">
          <form onSubmit={handleLookup} className="flex gap-2">
            <input
              type="text"
              inputMode="text"
              placeholder="12.345.678-9"
              value={rut}
              onChange={(event) => setRut(event.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-4 py-3 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              required
            />
            <button
              type="submit"
              disabled={status === "looking"}
              className="flex items-center justify-center rounded-lg bg-accent px-4 py-3 text-white transition hover:bg-accent-2 disabled:opacity-60"
            >
              {status === "looking" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Search className="size-5" />
              )}
            </button>
          </form>

          {errorMessage && (
            <p className="mt-4 flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {errorMessage}
            </p>
          )}

          {status === "found" && tenant && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-text-muted">
                Hola <span className="text-text">{tenant.fullName}</span>
              </p>

              {rentals.length === 0 && (
                <p className="text-sm text-text-muted">No tienes bodegas asociadas a este RUT.</p>
              )}

              {rentals.map((rental) => (
                <div
                  key={rental.rentalId}
                  className="rounded-xl border border-border bg-surface-2 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Warehouse className="mt-0.5 size-5 text-accent-2" />
                      <div>
                        <p className="font-medium text-text">
                          {rental.warehouseName ?? rental.warehouseCode}
                        </p>
                        <p className="text-sm text-text-muted">{clp.format(rental.monthlyAmount)} / mes</p>
                      </div>
                    </div>
                    <StatusBadge isUpToDate={rental.isUpToDate} validUntil={rental.validUntil} />
                  </div>

                  <button
                    onClick={() => handlePay(rental.rentalId)}
                    disabled={payingRentalId === rental.rentalId}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
                  >
                    {payingRentalId === rental.rentalId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CreditCard className="size-4" />
                    )}
                    Pagar con Webpay
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Form invisible: Webpay Plus requiere un POST real del navegador a su URL con token_ws. */}
      <form ref={formRef} action={webpayAction?.url ?? ""} method="POST" className="hidden">
        <input type="hidden" name="token_ws" value={webpayAction?.token ?? ""} />
      </form>
    </main>
  );
}

function StatusBadge({ isUpToDate, validUntil }) {
  if (isUpToDate) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-ok/15 px-2.5 py-1 text-xs font-medium text-ok">
        <CheckCircle2 className="size-3.5" />
        Al día
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger">
      <AlertTriangle className="size-3.5" />
      {validUntil ? "Vencido" : "Sin activar"}
    </span>
  );
}
