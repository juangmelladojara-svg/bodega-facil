import Link from "next/link";
import {
  Percent,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CalendarClock,
  CreditCard,
  Banknote,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPendingSyncPayments } from "@/lib/syncAccess";
import { getPendingAuthorizationInvoices } from "@/lib/invoices";
import { Meter, ProportionBar } from "./Bars";
import RevenueTrendChart from "./RevenueTrendChart";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const clpCompact = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  notation: "compact",
  maximumFractionDigits: 1,
});

const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
const REVENUE_MONTHS = 6;
const RECENT_DAYS = 30;
const UPCOMING_DAYS = 7;

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function sizeBucket(sizeM3) {
  if (sizeM3 == null) return null;
  if (sizeM3 <= 25) return "Módulos";
  if (sizeM3 <= 120) return "Medianas";
  return "Grandes";
}

export default async function AdminDashboardPage() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();

  const revenueSince = new Date(now);
  revenueSince.setMonth(revenueSince.getMonth() - (REVENUE_MONTHS - 1));
  revenueSince.setDate(1);
  revenueSince.setHours(0, 0, 0, 0);

  const upcomingUntil = new Date(now);
  upcomingUntil.setDate(upcomingUntil.getDate() + UPCOMING_DAYS);

  const [
    { count: warehousesCount },
    { count: tenantsCount },
    { data: warehousesWithOccupancy },
    { data: rentals },
    { data: recentPayments },
    pendingSyncPayments,
    pendingAuthInvoices,
  ] = await Promise.all([
    supabase.from("warehouses").select("*", { count: "exact", head: true }),
    supabase.from("tenants").select("*", { count: "exact", head: true }),
    supabase.from("warehouses").select("id, size_m3, rentals(id)"),
    supabase
      .from("rentals")
      .select("id, status, valid_until, monthly_amount, tenants(full_name), warehouses(code)"),
    supabase
      .from("payments")
      .select("id, amount, method, created_at, rentals(tenants(full_name), warehouses(code))")
      .eq("status", "confirmed")
      .gte("created_at", revenueSince.toISOString())
      .order("created_at", { ascending: false }),
    getPendingSyncPayments(),
    // defensivo: si la tabla `invoices` todavía no existe (migración no
    // corrida), el dashboard no debe caerse entero por esto.
    getPendingAuthorizationInvoices().catch(() => []),
  ]);

  const allRentals = rentals ?? [];

  // ── Ocupación ──────────────────────────────────────────────────────────
  const occupiedCount = allRentals.length;

  // ── Accesos habilitados vs. bloqueados ────────────────────────────────
  const enabledRentals = allRentals.filter(
    (r) => r.status !== "suspended" && r.valid_until && r.valid_until >= nowIso
  );
  const blockedRentals = allRentals.filter((r) => !enabledRentals.includes(r));
  const lapsedRentals = blockedRentals.filter((r) => r.status === "overdue" || r.status === "suspended");
  const montoMoroso = lapsedRentals.reduce((sum, r) => sum + r.monthly_amount, 0);

  const monthlyRevenue = enabledRentals.reduce((sum, r) => sum + r.monthly_amount, 0);

  // ── Próximos a vencer (próximos 7 días) ───────────────────────────────
  const upcomingExpirations = enabledRentals
    .filter((r) => r.valid_until <= upcomingUntil.toISOString())
    .sort((a, b) => a.valid_until.localeCompare(b.valid_until));

  // ── Distribución por tamaño ────────────────────────────────────────────
  const buckets = { Módulos: { total: 0, occupied: 0 }, Medianas: { total: 0, occupied: 0 }, Grandes: { total: 0, occupied: 0 } };
  for (const w of warehousesWithOccupancy ?? []) {
    const bucket = sizeBucket(w.size_m3);
    if (!bucket) continue;
    buckets[bucket].total += 1;
    // `rentals` viene embebido como objeto (no array): warehouse_id es
    // `unique` en rentals, así que Supabase infiere la relación como 1-a-1.
    if (w.rentals) buckets[bucket].occupied += 1;
  }

  // ── Tendencia de ingresos (últimos N meses) ───────────────────────────
  const monthBuckets = new Map();
  for (let i = 0; i < REVENUE_MONTHS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (REVENUE_MONTHS - 1 - i), 1);
    monthBuckets.set(monthKey(d), {
      key: monthKey(d),
      amount: 0,
      shortLabel: MONTH_LABELS[d.getMonth()],
      monthLabel: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  for (const p of recentPayments ?? []) {
    const key = monthKey(new Date(p.created_at));
    const bucket = monthBuckets.get(key);
    if (bucket) bucket.amount += p.amount;
  }
  const revenueTrend = Array.from(monthBuckets.values());

  // ── Webpay vs. pago manual (últimos 30 días) ──────────────────────────
  const recentCutoff = new Date(now);
  recentCutoff.setDate(recentCutoff.getDate() - RECENT_DAYS);
  const last30dPayments = (recentPayments ?? []).filter((p) => new Date(p.created_at) >= recentCutoff);
  const webpayCount = last30dPayments.filter((p) => p.method === "webpay").length;
  const manualCount = last30dPayments.filter((p) => p.method === "manual").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text">Resumen</h1>
        <p className="mt-1 text-sm text-text-muted">
          {warehousesCount ?? 0} bodegas · {tenantsCount ?? 0} arrendatarios
        </p>
      </div>

      {pendingAuthInvoices.length > 0 && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle className="size-4" />
            {pendingAuthInvoices.length} factura(s) de multa por atraso esperando tu autorización
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Hay arriendos vencidos con multa diaria ($15.000/día) calculada — ninguna se cobra
            sin que la autorices primero.
          </p>
          <ul className="mt-3 space-y-1.5">
            {pendingAuthInvoices.slice(0, 4).map((inv) => (
              <li key={inv.id} className="flex items-center justify-between text-sm">
                <span className="text-text">
                  {inv.rentals?.warehouses?.code} — {inv.rentals?.tenants?.full_name ?? "—"} ·{" "}
                  {inv.days_late} día(s)
                </span>
                <span className="font-medium text-text">{clp.format(inv.total_amount)}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/admin/facturas?filter=vencidas"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-danger underline hover:no-underline"
          >
            Revisar y autorizar
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}

      {/* Fila 1 — KPIs principales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <Percent className="size-5 text-accent-2" />
          <p className="mt-3 text-2xl font-semibold text-text">
            {Math.max((warehousesCount ?? 0) - occupiedCount, 0)}
          </p>
          <p className="text-sm text-text-muted">
            Bodegas disponibles ({occupiedCount} ocupadas de {warehousesCount ?? 0})
          </p>
          <div className="mt-3">
            <Meter value={occupiedCount} max={warehousesCount ?? 0} color="var(--color-accent-2)" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <Wallet className="size-5 text-ok" />
          <p className="mt-3 text-2xl font-semibold text-text">{clpCompact.format(monthlyRevenue)}</p>
          <p className="text-sm text-text-muted">Ingreso mensual vigente</p>
        </div>

        <Link
          href="/admin/acceso"
          className="rounded-2xl border border-border bg-surface p-5 transition hover:border-accent"
        >
          <ShieldAlert className={`size-5 ${montoMoroso > 0 ? "text-danger" : "text-accent-2"}`} />
          <p className="mt-3 text-2xl font-semibold text-text">{clpCompact.format(montoMoroso)}</p>
          <p className="text-sm text-text-muted">Monto moroso ({lapsedRentals.length} bodegas)</p>
        </Link>

        <Link
          href="/admin/acceso"
          className="rounded-2xl border border-border bg-surface p-5 transition hover:border-accent"
        >
          <Clock className={`size-5 ${pendingSyncPayments.length > 0 ? "text-warn" : "text-accent-2"}`} />
          <p className="mt-3 text-2xl font-semibold text-text">{pendingSyncPayments.length}</p>
          <p className="text-sm text-text-muted">Sincronizaciones pendientes</p>
        </Link>
      </div>

      {/* Fila 2 — Accesos habilitados vs. bloqueados */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-medium text-text-muted">Control de acceso</h2>
        <ProportionBar
          segments={[
            { label: "Habilitados", value: enabledRentals.length, color: "var(--color-ok)", icon: ShieldCheck },
            { label: "Bloqueados", value: blockedRentals.length, color: "var(--color-danger)", icon: ShieldAlert },
          ]}
        />
      </div>

      {/* Fila 3 — Tendencia de ingresos + distribución por tamaño */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-medium text-text-muted">
            Ingresos confirmados · últimos {REVENUE_MONTHS} meses
          </h2>
          <RevenueTrendChart data={revenueTrend} />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-text-muted">Ocupación por tamaño</h2>
          <div className="space-y-4">
            {Object.entries(buckets).map(([name, { total, occupied }]) => (
              <div key={name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-text">{name}</span>
                  <span className="text-text-muted">
                    {occupied}/{total}
                  </span>
                </div>
                <Meter value={occupied} max={total} color="var(--color-accent-2)" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fila 4 — Próximos a vencer + Webpay vs. manual */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-text-muted">
            <CalendarClock className="size-4" />
            Vencen en los próximos {UPCOMING_DAYS} días
          </h2>
          {upcomingExpirations.length === 0 ? (
            <p className="text-sm text-text-muted">Nada vence esta semana.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingExpirations.slice(0, 8).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
                >
                  <span className="text-text">
                    {r.warehouses?.code} — {r.tenants?.full_name ?? "—"}
                  </span>
                  <span className="text-text-muted">
                    {new Date(r.valid_until).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-text-muted">Pagos · últimos {RECENT_DAYS} días</h2>
          <ProportionBar
            segments={[
              { label: "Webpay", value: webpayCount, color: "var(--color-accent-2)", icon: CreditCard },
              { label: "Manual", value: manualCount, color: "var(--color-warn)", icon: Banknote },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
