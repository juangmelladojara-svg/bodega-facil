import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { markInvoicePaid } from "@/lib/invoices";

export async function POST(request, { params }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;

  try {
    const { payment, syncResult } = await markInvoicePaid(id, admin.email);
    return NextResponse.json({ payment, syncSuccess: syncResult.success });
  } catch (err) {
    return NextResponse.json({ error: err.message || "No se pudo registrar el pago de la factura." }, { status: 400 });
  }
}
