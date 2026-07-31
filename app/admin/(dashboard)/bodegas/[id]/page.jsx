import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import ContractPanel from "./ContractPanel";
import NewChargeForm from "./NewChargeForm";
import ManualBillingForm from "./ManualBillingForm";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const STATUS_BADGE = {
  active: { text: "Activo", className: "text-ok", icon: CheckCircle2 },
  overdue: { text: "Vencido", className: "text-danger", icon: AlertTriangle },
  suspended: { text: "Suspendido", className: "text-danger", icon: Ban },
  inactive: { text: "Sin activar", className: "text-text-muted", icon: AlertTriangle },
};

export default async function BodegaFichaPage({ params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: warehouse } = await supabase.from("warehouses").select("*").eq("id", id).maybeSingle();
  if (!warehouse) notFound();

  const { data: rental } = await supabase
    .from("rentals")
    .select("*, tenants(*)")
    .eq("warehouse_id", id)
    .maybeSingle();

  const [{ data: payments }, { data: charges }] = await Promise.all([
    rental
      ? supabase.from("payments").select("*").eq("rental_id", rental.id).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    supabase.from("warehouse_charges").select("*").eq("warehouse_id", id).order("created_at", { ascending: false }),
  ]);

  // Defensivo: contracts/invoices pueden no existir todavía si la migración no corrió.
  let contract = null;
  let openInvoice = null;
  if (rental) {
    try {
      const { data } = await supabase
        .from("contracts")
        .select("*")
        .eq("rental_id", rental.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      contract = data;
    } catch {
      contract = null;
    }
    try {
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("rental_id", rental.id)
        .in("status", ["pending_authorization", "authorized"])
        .maybeSingle();
      openInvoice = data;
    } catch {
      openInvoice = null;
    }
  }

  const badge = rental ? STATUS_BADGE[rental.status] ?? STATUS_BADGE.inactive : null;
  const BadgeIcon = badge?.icon;
  const unbilledChargesTotal = (charges ?? [])
    .filter((c) => c.status === "confirmed" && !c.payment_id)
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-6">
      <Link href="/admin/bodegas" className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        Volver a bodegas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text">{warehouse.code} — {warehouse.name}</h1>
          <p className="mt-1 text-sm text-text-muted">
            Patio {warehouse.gate_id} · {warehouse.size_m3 ?? "—"} m³ · {clp.format(warehouse.monthly_amount)}/mes
          </p>
        </div>
        {badge && (
          <span className={`flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium ${badge.className}`}>
            <BadgeIcon className="size-4" />
            {badge.text}
          </span>
        )}
      </div>

      {openInvoice && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-danger">
            <AlertTriangle className="size-4" />
            Factura de multa {openInvoice.status === "pending_authorization" ? "esperando autorización" : "autorizada, pendiente de pago"}
            {" — "}
            {clp.format(openInvoice.total_amount)} ({openInvoice.days_late} día(s))
          </p>
          <Link href="/admin/facturas?filter=vencidas" className="mt-1 inline-block text-sm text-danger underline hover:no-underline">
            Ir a Facturas → Vencidas
          </Link>
        </div>
      )}

      {/* Arrendatario actual */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Arrendatario</h2>
        {rental ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-text-muted">Nombre</p>
                <p className="text-text">{rental.tenants?.full_name}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">RUT</p>
                <p className="font-mono text-text">{rental.tenants?.rut}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Vigencia</p>
                <p className="text-text">
                  {rental.valid_until ? new Date(rental.valid_until).toLocaleString("es-CL") : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Tarjeta / ID controlador</p>
                <p className="font-mono text-xs text-text-muted">
                  {rental.card_uid ?? "sin UID"} · {rental.controller_person_id ?? "sin enrolar"}
                </p>
              </div>
            </div>
            <ManualBillingForm
              rentalId={rental.id}
              defaultAmount={rental.monthly_amount}
              unbilledChargesTotal={unbilledChargesTotal}
            />
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Sin arrendatario asignado.{" "}
            <Link href="/admin/arrendatarios" className="text-accent-2 hover:underline">
              Asignar desde Arrendatarios
            </Link>
            .
          </p>
        )}
      </div>

      {/* Cargos */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text-muted">Cargos</h2>
          <NewChargeForm warehouseId={warehouse.id} />
        </div>
        <p className="mb-3 text-xs text-text-muted">
          Link para cargar consumo en terreno:{" "}
          <Link href="/cargos/consumo" className="text-accent-2 underline hover:no-underline">
            bodega-facil-tamp1.vercel.app/cargos/consumo
          </Link>
        </p>
        {(charges ?? []).length === 0 ? (
          <p className="text-sm text-text-muted">Sin cargos registrados.</p>
        ) : (
          <ul className="space-y-2">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                <span className="text-text">
                  {c.description}
                  <span className="ml-1.5 text-xs text-text-muted">
                    ({c.charge_type === "consumo" ? "consumo" : "manual"} ·{" "}
                    {new Date(c.created_at).toLocaleDateString("es-CL")})
                  </span>
                </span>
                <span className="font-medium text-text">{clp.format(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Historial de pagos */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Últimos pagos</h2>
        {(payments ?? []).length === 0 ? (
          <p className="text-sm text-text-muted">Sin pagos registrados.</p>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                <span className="text-text-muted">{new Date(p.created_at).toLocaleDateString("es-CL")}</span>
                <span className="text-text-muted">{p.method === "manual" ? "Manual" : "Webpay"}</span>
                <span className="font-medium text-text">{clp.format(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Contrato */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Contrato</h2>
        {rental ? (
          <ContractPanel rentalId={rental.id} contract={contract} />
        ) : (
          <p className="text-sm text-text-muted">Asigna un arrendatario primero para generar el contrato.</p>
        )}
      </div>
    </div>
  );
}
