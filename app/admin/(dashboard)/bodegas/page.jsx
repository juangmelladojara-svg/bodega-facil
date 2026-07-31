import { getSupabaseAdmin } from "@/lib/supabase";
import NewWarehouseForm from "./NewWarehouseForm";
import BodegasTable from "./BodegasTable";

export default async function BodegasPage() {
  const supabase = getSupabaseAdmin();
  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("*, rentals(id, status)")
    .order("code");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Bodegas</h1>
        <NewWarehouseForm />
      </div>

      <BodegasTable warehouses={warehouses ?? []} />
    </div>
  );
}
