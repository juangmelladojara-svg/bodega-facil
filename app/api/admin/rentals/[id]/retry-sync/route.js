import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncAccessAfterPayment } from "@/lib/syncAccess";

export async function POST(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: rental, error: rentalError } = await supabase
    .from("rentals")
    .select("*, warehouses(*)")
    .eq("id", id)
    .maybeSingle();

  if (rentalError || !rental) {
    return NextResponse.json({ error: "Arriendo no encontrado." }, { status: 404 });
  }

  // Solo pagos confirmados y NO sincronizados: si ya hay un `synced_at`, este
  // pago ya extendió la vigencia una vez — reintentarlo la regalaría de nuevo.
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("*")
    .eq("rental_id", id)
    .eq("status", "confirmed")
    .is("synced_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paymentError || !payment) {
    return NextResponse.json(
      { error: "Este arriendo no tiene pagos pendientes de sincronizar." },
      { status: 400 }
    );
  }

  const syncResult = await syncAccessAfterPayment({ rental, payment });

  return NextResponse.json({ success: syncResult.success, error: syncResult.errorMessage });
}
