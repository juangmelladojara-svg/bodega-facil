import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAllowedDocumentFile, uploadIdPhoto, getSignedDocumentUrl } from "@/lib/tenantDocuments";

/** Sube la foto de cédula (anverso o reverso) de un arrendatario. Paso separado del alta del arriendo, igual que el PDF firmado del contrato. */
export async function POST(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data: tenant } = await supabase.from("tenants").select("id").eq("id", id).maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Arrendatario no encontrado." }, { status: 404 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const side = formData?.get("side");

  if (side !== "front" && side !== "back") {
    return NextResponse.json({ error: "El parámetro side debe ser 'front' o 'back'." }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  }
  if (!isAllowedDocumentFile(file)) {
    return NextResponse.json({ error: "Archivo inválido: debe ser imagen o PDF, máximo 10MB." }, { status: 400 });
  }

  let path;
  try {
    path = await uploadIdPhoto({ tenantId: id, side, file });
  } catch {
    return NextResponse.json({ error: "No se pudo subir el archivo." }, { status: 500 });
  }

  const column = side === "front" ? "id_photo_front_path" : "id_photo_back_path";
  const { data: updated, error } = await supabase
    .from("tenants")
    .update({ [column]: path })
    .eq("id", id)
    .select()
    .single();

  if (error || !updated) return NextResponse.json({ error: "No se pudo actualizar la ficha." }, { status: 500 });

  return NextResponse.json({ tenant: updated });
}

/** Redirige a una URL temporal (60s) para ver la cédula — ?side=front|back. El bucket nunca es público. */
export async function GET(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const side = request.nextUrl.searchParams.get("side");
  if (side !== "front" && side !== "back") {
    return NextResponse.json({ error: "El parámetro side debe ser 'front' o 'back'." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const column = side === "front" ? "id_photo_front_path" : "id_photo_back_path";
  const { data: tenant } = await supabase.from("tenants").select(column).eq("id", id).maybeSingle();
  const path = tenant?.[column];
  if (!path) return NextResponse.json({ error: "Sin foto cargada para ese lado." }, { status: 404 });

  try {
    const url = await getSignedDocumentUrl(path);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error: "No se pudo generar el link." }, { status: 500 });
  }
}
