import { CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isOccupied } from "@/lib/warehouses";
import { formatRutDisplay } from "@/lib/rut";
import NewTenantForm from "./NewTenantForm";
import AssignRentalForm from "./AssignRentalForm";
import OverdueToast from "./OverdueToast";
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
  const q = (params?.q ?? "").trim();

  const supabase = getSupabaseAdmin();

  let tenantsQuery = supabase
    .from("tenants")
    .select("*, rentals(*, warehouses(code, name))")
    .order("full_name")
    .range(from, to);
  if (q) tenantsQuery = tenantsQuery.ilike("full_name", `%${q}%`);

  const now = new Date().toISOString();

  const [{ data: tenantsPage }, { data: warehouses }, { data: overdueRentalsForToast }] = await Promise.all([
    tenantsQuery,
    supabase.from("warehouses").select("id, code, rentals(id, status)").order("code"),
    supabase.from("rentals").select("tenant_id").neq("status", "ended").not("valid_until", "is", null).lt("valid_until", now),
  ]);

  const hasNextPage = (tenantsPage ?? []).length > PAGE_SIZE;
  const tenants = (tenantsPage ?? []).slice(0, PAGE_SIZE);

  const availableWarehouses = (warehouses ?? [])
    .filter((warehouse) => !isOccupied(warehouse))
    .map(({ id, code }) => ({ id, code }));

  const overdueTenantsCount = new Set((overdueRentalsForToast ?? []).map((r) => r.tenant_id)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Arrendatarios</h1>
        <NewTenantForm />
      </div>

      <form action="/admin/arrendatarios" method="GET" className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre..."
          className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </form>

      <div className="space-y-3">
        {tenants.map((tenant) => {
          const activeRentals = (tenant.rentals ?? []).filter((rental) => rental.status !== "ended");
          const hasOverdue = activeRentals.some((rental) => rental.valid_until && rental.valid_until <= now);
          return (
          <div
            key={tenant.id}
            className={`rounded-2xl border p-5 ${
              hasOverdue ? "border-danger/50 bg-danger/5" : "border-border bg-surface"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-medium text-text">{tenant.full_name}</p>
                <p className="font-mono text-sm text-text-muted">{formatRutDisplay(tenant.rut)}</p>
              </div>
              <p className="text-sm text-text-muted">
                {tenant.phone && <span>{tenant.phone}</span>}
                {tenant.phone && tenant.email && " · "}
                {tenant.email && <span>{tenant.email}</span>}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              {activeRentals.map((rental) => {
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
              {activeRentals.length === 0 && (
                <p className="text-sm text-text-muted">Sin bodegas asignadas.</p>
              )}

              <AssignRentalForm tenantId={tenant.id} availableWarehouses={availableWarehouses} />
            </div>
          </div>
          );
        })}

        {tenants.length === 0 && (
          <p className="rounded-2xl border border-border bg-surface p-8 text-center text-text-muted">
            {q ? `Ningún arrendatario coincide con "${q}".` : "No hay arrendatarios registrados todavía."}
          </p>
        )}
      </div>

      <Pagination page={page} hasNextPage={hasNextPage} basePath="/admin/arrendatarios" extraParams={{ q }} />

      <OverdueToast count={overdueTenantsCount} />
    </div>
  );
}
