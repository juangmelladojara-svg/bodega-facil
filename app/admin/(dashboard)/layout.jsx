import Link from "next/link";
import { LayoutDashboard, Warehouse, Users, Receipt, KeyRound } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import SignOutButton from "./SignOutButton";

const NAV_ITEMS = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/bodegas", label: "Bodegas", icon: Warehouse },
  { href: "/admin/arrendatarios", label: "Arrendatarios", icon: Users },
  { href: "/admin/facturas", label: "Facturas", icon: Receipt },
  { href: "/admin/acceso", label: "Control de acceso", icon: KeyRound },
];

export default async function AdminDashboardLayout({ children }) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col border-b border-border bg-surface md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <div className="p-5">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-2">
            Bodega Fácil
          </p>
          <p className="mt-1 text-sm font-medium text-text">Panel de administración</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pb-4 md:pb-0">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-muted transition hover:bg-surface-2 hover:text-text"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="space-y-2 border-t border-border p-4">
          {user?.email && <p className="truncate text-xs text-text-muted">{user.email}</p>}
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
