import { getSupabaseAdmin } from "@/lib/supabase";
import NewWarehouseForm from "./NewWarehouseForm";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default async function BodegasPage() {
  const supabase = getSupabaseAdmin();
  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("*, rentals(id)")
    .order("code");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Bodegas</h1>
        <NewWarehouseForm />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Patio</th>
              <th className="px-4 py-3 font-medium">m³</th>
              <th className="px-4 py-3 font-medium">Mensual</th>
              <th className="px-4 py-3 font-medium">Arriendo</th>
            </tr>
          </thead>
          <tbody>
            {(warehouses ?? []).map((warehouse) => (
              <tr key={warehouse.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-text">{warehouse.code}</td>
                <td className="px-4 py-3 text-text">{warehouse.name}</td>
                <td className="px-4 py-3 text-text-muted">{warehouse.gate_id}</td>
                <td className="px-4 py-3 text-text-muted">{warehouse.size_m3 ?? "—"}</td>
                <td className="px-4 py-3 text-text-muted">{clp.format(warehouse.monthly_amount)}</td>
                <td className="px-4 py-3 text-text-muted">
                  {/* rentals viene embebido como objeto (relación 1-a-1, warehouse_id es unique) */}
                  {warehouse.rentals ? "Ocupada" : "Libre"}
                </td>
              </tr>
            ))}
            {(warehouses ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  No hay bodegas registradas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
