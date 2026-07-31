import Link from "next/link";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeFirstPaymentAmount } from "@/lib/computeValidUntil";
import RegisterManualPaymentForm from "./RegisterManualPaymentForm";
import { InvoiceActions, GenerateInvoiceButton } from "./InvoiceActions";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const STATUS_LABEL = {
  confirmed: { text: "Confirmado", className: "text-ok" },
  pending: { text: "Pendiente", className: "text-warn" },
  committing: { text: "Procesando", className: "text-warn" },
  failed: { text: "Fallido", className: "text-danger" },
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TABS = [
  { key: "todas", label: "Todas" },
  { key: "vigentes", label: "Vigentes" },
  { key: "pagadas", label: "Pagadas" },
  { key: "vencidas", label: "Vencidas" },
];

function parseMonth(monthParam) {
  const now = new Date();
  if (!monthParam) return { year: now.getFullYear(), month: now.getMonth() };
  const [y, m] = monthParam.split("-").map(Number);
  if (!y || !m) return { year: now.getFullYear(), month: now.getMonth() };
  return { year: y, month: m - 1 };
}

function monthParam(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export default async function FacturasPage({ searchParams }) {
  const params = await searchParams;
  const filter = TABS.some((t) => t.key === params?.filter) ? params.filter : "todas";
  const { year, month } = parseMonth(params?.month);

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const now = new Date();

  const supabase = getSupabaseAdmin();

  const [{ data: monthPayments }, { data: rentals }, { data: overdueRentals }] = await Promise.all([
    supabase
      .from("payments")
      .select("*, rentals(*, tenants(full_name, rut), warehouses(code))")
      .gte("created_at", monthStart.toISOString())
      .lt("created_at", monthEnd.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("rentals")
      .select("*, tenants(full_name), warehouses(code)")
      .neq("status", "ended")
      .order("created_at"),
    supabase
      .from("rentals")
      .select("id, monthly_amount, valid_until, tenants(full_name), warehouses(code)")
      .lt("valid_until", now.toISOString())
      .neq("status", "inactive")
      .neq("status", "suspended")
      .neq("status", "ended"),
  ]);

  // Facturas de multa (tabla `invoices`) — solo las que necesitan revisión
  // (pending_authorization/authorized); las ya pagadas no aportan nada en
  // esta pestaña y quedarían acumulándose para siempre. El historial de
  // multas pagadas sigue visible en la vista mensual normal (son pagos
  // "Manual" con nota "Factura de multa: ..."). Defensivo por si la
  // migración todavía no corrió.
  let invoices = [];
  try {
    const { data } = await supabase
      .from("invoices")
      .select("*, rentals(*, tenants(full_name), warehouses(code))")
      .in("status", ["pending_authorization", "authorized"])
      .order("created_at", { ascending: false });
    invoices = data ?? [];
  } catch {
    invoices = [];
  }
  const invoiceByRentalId = new Map(invoices.map((i) => [i.rental_id, i]));
  const rentalsWithoutInvoice = (overdueRentals ?? []).filter((r) => !invoiceByRentalId.has(r.id));

  // Cargos confirmados y todavía no facturados, por bodega — se suman al
  // monto sugerido del pago manual. Defensivo por si la migración de cargos
  // todavía no corrió.
  let chargesByWarehouseId = new Map();
  try {
    const { data: unbilledCharges } = await supabase
      .from("warehouse_charges")
      .select("warehouse_id, amount")
      .eq("status", "confirmed")
      .is("payment_id", null);
    for (const c of unbilledCharges ?? []) {
      chargesByWarehouseId.set(c.warehouse_id, (chargesByWarehouseId.get(c.warehouse_id) ?? 0) + c.amount);
    }
  } catch {
    chargesByWarehouseId = new Map();
  }
  const rentalsWithCharges = (rentals ?? []).map((r) => {
    const isFirstPayment = !r.valid_until;
    return {
      ...r,
      chargesTotal: chargesByWarehouseId.get(r.warehouse_id) ?? 0,
      isFirstPayment,
      baseAmount: isFirstPayment ? computeFirstPaymentAmount({ monthlyAmount: r.monthly_amount }) : r.monthly_amount,
    };
  });

  const visiblePayments = (monthPayments ?? []).filter((p) => {
    if (filter === "todas" || filter === "vencidas") return filter !== "vencidas";
    const isVigente = p.period_end && p.period_end >= now.toISOString();
    return filter === "vigentes" ? isVigente : !isVigente;
  });

  const prevMonthDate = new Date(year, month - 1, 1);
  const nextMonthDate = new Date(year, month + 1, 1);
  const filterQS = filter !== "todas" ? `&filter=${filter}` : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Facturas</h1>
        <Link
          href="/admin/facturas?filter=vencidas"
          className="flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger transition hover:bg-danger/10"
        >
          <AlertTriangle className="size-4" />
          Revisar vencidas ({(overdueRentals ?? []).length})
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/facturas?filter=${tab.key}`}
            className={`border-b-2 px-3 py-2 text-sm transition ${
              filter === tab.key
                ? "border-accent text-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {filter === "vencidas" ? (
        <div className="space-y-3">
          {invoices.length === 0 && rentalsWithoutInvoice.length === 0 && (
            <p className="rounded-2xl border border-border bg-surface p-8 text-center text-text-muted">
              No hay facturas vencidas. 🎉
            </p>
          )}

          {invoices.map((inv) => (
            <div key={inv.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-text">
                    {inv.rentals?.warehouses?.code} — {inv.rentals?.tenants?.full_name ?? "—"}
                  </p>
                  <p className="text-sm text-text-muted">
                    {inv.days_late} día(s) de atraso · mensualidad {clp.format(inv.base_amount)} + multa{" "}
                    {clp.format(inv.late_fee_amount)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-semibold text-text">{clp.format(inv.total_amount)}</span>
                  <InvoiceActions invoiceId={inv.id} status={inv.status} />
                </div>
              </div>
            </div>
          ))}

          {rentalsWithoutInvoice.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4"
            >
              <div>
                <p className="font-medium text-text">
                  {r.warehouses?.code} — {r.tenants?.full_name ?? "—"}
                </p>
                <p className="text-sm text-text-muted">Vencido, sin factura de multa generada todavía.</p>
              </div>
              <GenerateInvoiceButton rentalId={r.id} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Link
              href={`/admin/facturas?month=${monthParam(prevMonthDate.getFullYear(), prevMonthDate.getMonth())}${filterQS}`}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Link>
            <span className="text-sm font-medium text-text">
              {MONTH_NAMES[month]} {year}
            </span>
            <Link
              href={`/admin/facturas?month=${monthParam(nextMonthDate.getFullYear(), nextMonthDate.getMonth())}${filterQS}`}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Link>
          </div>

          <RegisterManualPaymentForm rentals={rentalsWithCharges} />

          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Arrendatario</th>
                  <th className="px-4 py-3 font-medium">Bodega</th>
                  <th className="px-4 py-3 font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Método</th>
                  <th className="px-4 py-3 font-medium">Cobertura</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visiblePayments.map((payment) => {
                  const status = STATUS_LABEL[payment.status] ?? { text: payment.status, className: "text-text-muted" };
                  const isVigente = payment.period_end && payment.period_end >= now.toISOString();
                  return (
                    <tr key={payment.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-text-muted">
                        {new Date(payment.created_at).toLocaleString("es-CL")}
                      </td>
                      <td className="px-4 py-3 text-text">{payment.rentals?.tenants?.full_name ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-text-muted">{payment.rentals?.warehouses?.code ?? "—"}</td>
                      <td className="px-4 py-3 text-text">{clp.format(payment.amount)}</td>
                      <td className="px-4 py-3 text-text-muted">
                        {payment.method === "manual" ? "Manual" : "Webpay"}
                        {payment.notes && <span className="text-xs"> · {payment.notes}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {payment.status === "confirmed" ? (
                          <span className={isVigente ? "text-ok" : "text-text-muted"}>
                            {isVigente ? "Vigente" : "Pagada"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`px-4 py-3 font-medium ${status.className}`}>{status.text}</td>
                    </tr>
                  );
                })}
                {visiblePayments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                      Sin pagos en este mes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
