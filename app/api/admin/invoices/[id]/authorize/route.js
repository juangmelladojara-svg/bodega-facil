import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { authorizeInvoice } from "@/lib/invoices";

export async function POST(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;

  try {
    const invoice = await authorizeInvoice(id, admin.email);
    return NextResponse.json({ invoice });
  } catch {
    return NextResponse.json(
      { error: "No se pudo autorizar (¿ya estaba autorizada o pagada?)." },
      { status: 400 }
    );
  }
}
