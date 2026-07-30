import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: contract } = await supabase.from("contracts").select("signed_pdf_path").eq("id", id).maybeSingle();
  if (!contract?.signed_pdf_path) {
    return NextResponse.json({ error: "Este contrato no tiene PDF firmado adjunto." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("contracts")
    .createSignedUrl(contract.signed_pdf_path, 60);

  if (error || !data) return NextResponse.json({ error: "No se pudo generar el link de descarga." }, { status: 500 });

  return NextResponse.redirect(data.signedUrl);
}
