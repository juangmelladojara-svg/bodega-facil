import { CheckCircle2, AlertTriangle } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import NewTenantForm from "./NewTenantForm";
import AssignRentalForm from "./AssignRentalForm";
import Pagination from "../Pagination";

const PAGE_SIZE = 25;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default async function ArrendatariosPage({ searchParams }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params?.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const supabase = getSupabaseAdmin();
  const [{ data: tenantsPage }, { data: warehouses }] = await Promise.all([
    supabase
      .from("tenants")
      .select("*, rentals(*, warehouses(code, name))")
      .order("full_name")
      .range(from, to),
    supabase.from("warehouses").select("id, code, rentals(id)").order("code"),
  ]);

  const hasNextPage = (tenantsPage ?? []).length > PAGE_SIZE;
  const tenants = (tenantsPage ?? []).slice(0, PAGE_SIZE);

  // rentals viene embebido como objeto (relación 1-a-1, warehouse_id es unique en rentals)
  const availableWarehouses = (warehouses ?? [])
    .filter((warehouse) => !warehouse.rentals)
    .map(({ id, code }) => ({ id, code }));

  const now = new Date().toISOString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Arrendatarios</h1>
        <NewTenantForm />
      </div>

      <div className="space-y-3">
        {tenants.map((tenant) => (
          <div key={tenant.id} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-medium text-text">{tenant.full_name}</p>
                <p className="font-mono text-sm text-text-muted">{tenant.rut}</p>
              </div>
              <p className="text-sm text-text-muted">
                {tenant.phone && <span>{tenant.phone}</span>}
                {tenant.phone && tenant.email && " · "}
                {tenant.email && <span>{tenant.email}</span>}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              {(tenant.rentals ?? []).map((rental) => {
                const isUpToDate = Boolean(rental.valid_until && rental.valid_until > now);
                return (
                  <div
                    key={rental.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="text-text">
                      {rental.warehouses?.code} — {clp.format(rental.monthly_amount)}/mes
                    </span>
                    {isUpToDate ? (
                      <span className="flex items-center gap-1 text-ok">
                        <CheckCircle2 className="size-3.5" />
                        Al día hasta {new Date(rental.valid_until).toLocaleDateString("es-CL")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-danger">
                        <AlertTriangle className="size-3.5" />
                        {rental.valid_until ? "Vencido" : "Sin activar"}
                      </span>
                    )}
                  </div>
                );
              })}
              {(tenant.rentals ?? []).length === 0 && (
                <p className="text-sm text-text-muted">Sin bodegas asignadas.</p>
              )}

              <AssignRentalForm tenantId={tenant.id} availableWarehouses={availableWarehouses} />
            </div>
          </div>
        ))}

        {tenants.length === 0 && (
          <p className="rounded-2xl border border-border bg-surface p-8 text-center text-text-muted">
            No hay arrendatarios registrados todavía.
          </p>
        )}
      </div>

      <Pagination page={page} hasNextPage={hasNextPage} basePath="/admin/arrendatarios" />
    </div>
  );
}
