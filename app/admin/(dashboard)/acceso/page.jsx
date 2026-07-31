import { CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import RentalActions from "./RentalActions";
import Pagination from "../Pagination";

const PAGE_SIZE = 25;

const STATUS_BADGE = {
  active: { text: "Activo", className: "text-ok", icon: CheckCircle2 },
  overdue: { text: "Vencido", className: "text-danger", icon: AlertTriangle },
  suspended: { text: "Suspendido", className: "text-danger", icon: Ban },
  inactive: { text: "Sin activar", className: "text-text-muted", icon: AlertTriangle },
};

export default async function AccesoPage({ searchParams }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params?.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const [{ data: rentalsPage }, { data: logs }] = await Promise.all([
    supabase
      .from("rentals")
      .select("*, tenants(full_name, rut), warehouses(code, gate_id)")
      .neq("status", "ended")
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase
      .from("access_control_log")
      .select("*, rentals(warehouses(code))")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const hasNextPage = (rentalsPage ?? []).length > PAGE_SIZE;
  const rentals = (rentalsPage ?? []).slice(0, PAGE_SIZE);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text">Control de acceso</h1>
        <p className="mt-1 text-sm text-text-muted">
          Estado de cada tarjeta en el controlador y acciones manuales.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="px-4 py-3 font-medium">Bodega</th>
              <th className="px-4 py-3 font-medium">Arrendatario</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Vigencia</th>
              <th className="px-4 py-3 font-medium">ID controlador</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rentals.map((rental) => {
              const isExpired = !rental.valid_until || rental.valid_until < now;
              const statusKey = rental.status === "suspended" ? "suspended" : isExpired ? "overdue" : "active";
              const badge = STATUS_BADGE[rental.status === "inactive" && !rental.valid_until ? "inactive" : statusKey];
              const Icon = badge.icon;

              return (
                <tr key={rental.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-text">
                    {rental.warehouses?.code}
                    <span className="ml-1 text-xs text-text-muted">(patio {rental.warehouses?.gate_id})</span>
                  </td>
                  <td className="px-4 py-3 text-text">{rental.tenants?.full_name ?? "—"}</td>
                  <td className={`px-4 py-3 font-medium ${badge.className}`}>
                    <span className="flex items-center gap-1.5">
                      <Icon className="size-3.5" />
                      {badge.text}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {rental.valid_until ? new Date(rental.valid_until).toLocaleString("es-CL") : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {rental.controller_person_id ?? "sin enrolar"}
                  </td>
                  <td className="px-4 py-3">
                    <RentalActions rentalId={rental.id} />
                  </td>
                </tr>
              );
            })}
            {rentals.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  No hay arriendos registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} hasNextPage={hasNextPage} basePath="/admin/acceso" />

      <div>
        <h2 className="mb-3 text-sm font-medium text-text-muted">Auditoría ISAPI reciente</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Bodega</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="px-4 py-3 font-medium">Resultado</th>
                <th className="px-4 py-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-text-muted">
                    {new Date(log.created_at).toLocaleString("es-CL")}
                  </td>
                  <td className="px-4 py-3 font-mono text-text-muted">
                    {log.rentals?.warehouses?.code ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text">{log.action}</td>
                  <td className={`px-4 py-3 font-medium ${log.success ? "text-ok" : "text-danger"}`}>
                    {log.success ? "OK" : "Falló"}
                    {log.response_payload?.mock && (
                      <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                        MOCK
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{log.error_message ?? "—"}</td>
                </tr>
              ))}
              {(logs ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                    Sin actividad todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
