import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { revokeAccess } from "@/lib/isapi";

/**
 * Termina un arriendo y libera la bodega para poder asignarla a otro
 * arrendatario. Conserva el historial (pagos, cargos, contrato — todos
 * atados a rental_id/warehouse_id, no se tocan). Revoca el acceso físico
 * si la tarjeta llegó a enrolarse; si el controlador falla, igual se
 * termina el arriendo en la base de datos (liberar la bodega no debe
 * quedar bloqueado por el hardware) y queda registrado en el log.
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
  if (rental.status === "ended") {
    return NextResponse.json({ error: "Este arriendo ya está terminado." }, { status: 400 });
  }

  let revokeSuccess = null;
  let revokeError = null;

  if (rental.controller_person_id) {
    try {
      const result = await revokeAccess({ employeeNo: rental.controller_person_id });
      revokeSuccess = true;
      await supabase.from("access_control_log").insert({
        rental_id: rental.id,
        action: "revoke_access",
        request_payload: { rentalId: rental.id, revokedBy: admin.email, reason: "end_rental" },
        response_payload: result,
        success: true,
      });
    } catch (err) {
      revokeSuccess = false;
      revokeError = err.message || String(err);
      await supabase.from("access_control_log").insert({
        rental_id: rental.id,
        action: "revoke_access",
        request_payload: { rentalId: rental.id, revokedBy: admin.email, reason: "end_rental" },
        response_payload: err.response ?? null,
        success: false,
        error_message: revokeError,
      });
    }
  }

  const { data: ended, error: updateError } = await supabase
    .from("rentals")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", rental.id)
    .select()
    .single();

  if (updateError || !ended) {
    return NextResponse.json({ error: "No se pudo terminar el arriendo." }, { status: 500 });
  }

  return NextResponse.json({ rental: ended, revokeSuccess, revokeError });
}
