import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { upsertLateFeeInvoice } from "@/lib/invoices";

/**
 * Genera (o actualiza) la factura de multa de un arriendo vencido bajo
 * demanda, sin esperar al cron diario. Queda igual en 'pending_authorization'.
 */
export async function POST(request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const rentalId = body?.rentalId;
  if (!rentalId) return NextResponse.json({ error: "Falta rentalId." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: rental, error } = await supabase
    .from("rentals")
    .select("id, monthly_amount, valid_until, status")
    .eq("id", rentalId)
    .maybeSingle();

  if (error || !rental) return NextResponse.json({ error: "Arriendo no encontrado." }, { status: 404 });

  try {
    const invoice = await upsertLateFeeInvoice(rental);
    if (!invoice) {
      return NextResponse.json({ error: "Este arriendo no está vencido." }, { status: 400 });
    }
    return NextResponse.json({ invoice });
  } catch (err) {
    return NextResponse.json({ error: err.message || "No se pudo generar la factura." }, { status: 500 });
  }
}
