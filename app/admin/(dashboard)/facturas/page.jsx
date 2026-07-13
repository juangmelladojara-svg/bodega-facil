import { getSupabaseAdmin } from "@/lib/supabase";
import RegisterManualPaymentForm from "./RegisterManualPaymentForm";
import Pagination from "../Pagination";

const PAGE_SIZE = 25;

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

export default async function FacturasPage({ searchParams }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params?.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE; // pedimos uno de más para saber si hay página siguiente

  const supabase = getSupabaseAdmin();

  const [{ data: paymentsPage }, { data: rentals }] = await Promise.all([
    supabase
      .from("payments")
      .select("*, rentals(*, tenants(full_name, rut), warehouses(code))")
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase.from("rentals").select("*, tenants(full_name), warehouses(code)").order("created_at"),
  ]);

  const hasNextPage = (paymentsPage ?? []).length > PAGE_SIZE;
  const payments = (paymentsPage ?? []).slice(0, PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Facturas</h1>
      </div>

      <RegisterManualPaymentForm rentals={rentals ?? []} />

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Arrendatario</th>
              <th className="px-4 py-3 font-medium">Bodega</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Método</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const status = STATUS_LABEL[payment.status] ?? { text: payment.status, className: "text-text-muted" };
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
                  <td className={`px-4 py-3 font-medium ${status.className}`}>{status.text}</td>
                </tr>
              );
            })}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  Todavía no hay pagos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} hasNextPage={hasNextPage} basePath="/admin/facturas" />
    </div>
  );
}
