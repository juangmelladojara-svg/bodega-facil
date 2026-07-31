import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatRut, isValidRut } from "@/lib/rut";
import { isValidPhone } from "@/lib/phone";
import { isValidEmail } from "@/lib/email";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .select("*, rentals(*, warehouses(code, name))")
    .order("full_name");

  if (error) return NextResponse.json({ error: "Error al listar arrendatarios." }, { status: 500 });

  return NextResponse.json({ tenants: data });
}

export async function POST(request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { rut, fullName, phone, email } = body ?? {};

  if (!rut || !isValidRut(rut) || !fullName) {
    return NextResponse.json({ error: "RUT inválido o falta el nombre." }, { status: 400 });
  }
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "El teléfono debe tener el formato +569 xxxx xxxx." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "El email debe contener un @." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .insert({ rut: formatRut(rut), full_name: fullName, phone: phone || null, email: email || null })
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "Ya existe un arrendatario con ese RUT." : "No se pudo crear el arrendatario.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ tenant: data });
}
