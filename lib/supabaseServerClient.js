import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para Server Components / Route Handlers, atado a la sesión
 * de Auth del usuario vía cookies (no usa service_role). Solo sirve para leer
 * quién está logueado (`auth.getUser()`) en el panel /admin — todas las
 * consultas/escrituras a las tablas de negocio siguen pasando por
 * lib/supabase.js (service_role), no por este cliente.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignorado: en un Server Component puro no se pueden setear cookies.
            // El middleware ya se encarga de refrescar la sesión en cada request.
          }
        },
      },
    }
  );
}
