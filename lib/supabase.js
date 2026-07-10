import { createClient } from "@supabase/supabase-js";

let client;

/**
 * Cliente Supabase con service_role key. Solo se importa desde código de servidor
 * (API routes, lib/*) — service_role ignora RLS, nunca debe llegar al bundle del cliente.
 */
export function getSupabaseAdmin() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno."
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return client;
}
