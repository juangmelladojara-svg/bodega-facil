import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeFirstPaymentAmount } from "@/lib/computeValidUntil";
import { formatRutDisplay } from "@/lib/rut";
import ContractPanel from "./ContractPanel";
import NewChargeForm from "./NewChargeForm";
import ManualBillingForm from "./ManualBillingForm";
import EndRentalButton from "./EndRentalButton";
import NewRentalForm from "./NewRentalForm";

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
    .neq("status", "ended")
    .maybeSingle();

  const [{ data: payments }, { data: charges }, { data: tenantCompany }] = await Promise.all([
    rental
      ? supabase.from("payments").select("*").eq("rental_id", rental.id).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    supabase.from("warehouse_charges").select("*").eq("warehouse_id", id).order("created_at", { ascending: false }),
    rental
      ? supabase.from("tenant_companies").select("*").eq("tenant_id", rental.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
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
  const isFirstPayment = rental ? !rental.valid_until : false;
  const suggestedAmount = rental
    ? isFirstPayment
      ? computeFirstPaymentAmount({ monthlyAmount: rental.monthly_amount })
      : rental.monthly_amount
    : 0;
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
                <p className="font-mono text-text">{formatRutDisplay(rental.tenants?.rut)}</p>
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
              <div>
                <p className="text-xs text-text-muted">Contacto</p>
                <p className="text-text">{rental.tenants?.phone ?? "—"} · {rental.tenants?.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Dirección de referencia</p>
                <p className="text-text">{rental.tenants?.reference_address ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Plazo</p>
                <p className="text-text">{rental.rental_term === "diario" ? "Diario" : "Mensual (mín. 3 meses)"}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Cédula</p>
                <p className="flex gap-2 text-sm">
                  {rental.tenants?.id_photo_front_path ? (
                    <a
                      href={`/api/admin/tenants/${rental.tenants.id}/id-photo?side=front`}
                      target="_blank"
                      rel="noopener"
                      className="text-accent-2 underline hover:no-underline"
                    >
                      Anverso
                    </a>
                  ) : (
                    <span className="text-text-muted">Sin anverso</span>
                  )}
                  {rental.tenants?.id_photo_back_path ? (
                    <a
                      href={`/api/admin/tenants/${rental.tenants.id}/id-photo?side=back`}
                      target="_blank"
                      rel="noopener"
                      className="text-accent-2 underline hover:no-underline"
                    >
                      Reverso
                    </a>
                  ) : (
                    <span className="text-text-muted">Sin reverso</span>
                  )}
                </p>
              </div>
            </div>

            {tenantCompany && (
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <p className="mb-2 text-xs font-medium text-text-muted">Empresa</p>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p className="text-text">{tenantCompany.razon_social} — {formatRutDisplay(tenantCompany.company_rut)}</p>
                  <p className="text-text-muted">{tenantCompany.giro ?? "—"}</p>
                  <p className="text-text-muted sm:col-span-2">{tenantCompany.company_address ?? "—"}</p>
                  <p className="text-text-muted sm:col-span-2">
                    Representante: {tenantCompany.legal_rep_name} — {formatRutDisplay(tenantCompany.legal_rep_rut)}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <ManualBillingForm
                rentalId={rental.id}
                defaultAmount={suggestedAmount}
                unbilledChargesTotal={unbilledChargesTotal}
                isFirstPayment={isFirstPayment}
              />
              <EndRentalButton rentalId={rental.id} />
            </div>
          </div>
        ) : (
          <NewRentalForm warehouseId={warehouse.id} defaultAmount={warehouse.monthly_amount} />
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
