import { getSupabaseServerClient } from "./supabaseServerClient";

function getAllowedEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Devuelve el usuario admin autenticado, o `null` si no hay sesión válida o
 * su email no está en ADMIN_EMAILS. El middleware ya bloquea la navegación a
 * /admin/*, pero las rutas /api/admin/* se auto-verifican igual (defensa en
 * profundidad: pueden llamarse directo, sin pasar por una página).
 */
export async function getAdminUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const allowedEmails = getAllowedEmails();
  if (!allowedEmails.includes(user.email.toLowerCase())) return null;

  return user;
}
