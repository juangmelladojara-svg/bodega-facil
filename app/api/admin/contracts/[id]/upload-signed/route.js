import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB, coincide con el límite del bucket

/**
 * Sube el PDF ya firmado (modo manual: se firmó por fuera del sistema) y lo
 * adjunta al contrato — y por lo tanto a su bodega/arriendo. El bucket
 * "contracts" es privado; se sirve solo vía URL firmada generada por el
 * backend (ver GET /api/admin/contracts/[id]/download).
 */
export async function POST(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: contract } = await supabase.from("contracts").select("*").eq("id", id).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contrato no encontrado." }, { status: 404 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Falta el archivo PDF." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "El archivo debe ser un PDF." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "El PDF no puede pesar más de 10MB." }, { status: 400 });
  }

  const path = `${contract.warehouse_id}/${contract.id}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("contracts")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "No se pudo subir el PDF: " + uploadError.message }, { status: 500 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("contracts")
    .update({ status: "signed", signed_pdf_path: path, signed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: "No se pudo actualizar el contrato." }, { status: 500 });

  return NextResponse.json({ contract: updated });
}
