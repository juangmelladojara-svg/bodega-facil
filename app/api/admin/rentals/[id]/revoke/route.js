import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { revokeAccess } from "@/lib/isapi";

/**
 * Revocación manual de acceso (uso administrativo), fuera del flujo
 * automático de pago. No borra el enrolamiento de la tarjeta — solo la
 * deshabilita en el controlador, para poder reactivarla luego sin
 * re-enrolar.
 */
export async function POST(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: rental, error: rentalError } = await supabase
    .from("rentals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rentalError || !rental) {
    return NextResponse.json({ error: "Arriendo no encontrado." }, { status: 404 });
  }

  if (!rental.controller_person_id) {
    return NextResponse.json(
      { error: "Este arriendo nunca fue enrolado en el controlador — no hay nada que revocar." },
      { status: 400 }
    );
  }

  let result;
  let success = false;
  let errorMessage = null;

  try {
    result = await revokeAccess({ employeeNo: rental.controller_person_id });
    success = true;
  } catch (err) {
    errorMessage = err.message || String(err);
    result = err.response ?? null;
  }

  await supabase.from("access_control_log").insert({
    rental_id: rental.id,
    action: "revoke_access",
    request_payload: { rentalId: rental.id, revokedBy: admin.email },
    response_payload: result,
    success,
    error_message: errorMessage,
  });

  if (success) {
    await supabase.from("rentals").update({ status: "suspended" }).eq("id", rental.id);
  }

  return NextResponse.json({ success, error: errorMessage });
}
