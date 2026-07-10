import Link from "next/link";
import { Warehouse, Users, AlertTriangle, Clock } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPendingSyncPayments } from "@/lib/syncAccess";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default async function AdminDashboardPage() {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const [{ count: warehousesCount }, { count: tenantsCount }, { data: rentals }, pendingSyncPayments] =
    await Promise.all([
      supabase.from("warehouses").select("*", { count: "exact", head: true }),
      supabase.from("tenants").select("*", { count: "exact", head: true }),
      supabase.from("rentals").select("id, status, valid_until, monthly_amount"),
      getPendingSyncPayments(),
    ]);

  const overdueRentals = (rentals ?? []).filter(
    (rental) => !rental.valid_until || rental.valid_until < now
  );
  const monthlyRevenue = (rentals ?? [])
    .filter((rental) => rental.valid_until && rental.valid_until >= now)
    .reduce((sum, rental) => sum + rental.monthly_amount, 0);

  const stats = [
    { label: "Bodegas", value: warehousesCount ?? 0, icon: Warehouse, href: "/admin/bodegas" },
    { label: "Arrendatarios", value: tenantsCount ?? 0, icon: Users, href: "/admin/arrendatarios" },
    {
      label: "Bodegas vencidas/sin activar",
      value: overdueRentals.length,
      icon: AlertTriangle,
      href: "/admin/acceso",
      warn: overdueRentals.length > 0,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text">Resumen</h1>
        <p className="mt-1 text-sm text-text-muted">
          Ingresos mensuales vigentes: <span className="text-text">{clp.format(monthlyRevenue)}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, href, warn }) => (
          <Link
            key={label}
            href={href}
            className="rounded-2xl border border-border bg-surface p-5 transition hover:border-accent"
          >
            <Icon className={`size-5 ${warn ? "text-danger" : "text-accent-2"}`} />
            <p className="mt-3 text-2xl font-semibold text-text">{value}</p>
            <p className="text-sm text-text-muted">{label}</p>
          </Link>
        ))}
      </div>

      {pendingSyncPayments.length > 0 && (
        <div className="rounded-2xl border border-warn/30 bg-warn/10 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-warn">
            <Clock className="size-4" />
            {pendingSyncPayments.length} sincronización(es) de acceso pendientes de reintento
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Ver detalle y reintentar manualmente en{" "}
            <Link href="/admin/acceso" className="underline hover:text-text">
              Control de acceso
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
