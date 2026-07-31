import { getSupabaseAdmin } from "./supabase";

const BUCKET = "tenant-documents";
const MAX_SIZE = 10 * 1024 * 1024; // 10MB, coincide con el límite del bucket
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function isAllowedDocumentFile(file) {
  return ALLOWED_TYPES.includes(file.type) && file.size <= MAX_SIZE;
}

/** Sube la foto de cédula (anverso/reverso) al bucket privado "tenant-documents". */
export async function uploadIdPhoto({ tenantId, side, file }) {
  const supabase = getSupabaseAdmin();
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const path = `${tenantId}/cedula-${side}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (error) throw error;

  return path;
}

/** URL temporal (60s) para que un admin autenticado vea el documento — el bucket nunca es público. */
export async function getSignedDocumentUrl(path, expiresInSeconds = 60) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw error ?? new Error("No se pudo generar la URL firmada.");
  return data.signedUrl;
}
