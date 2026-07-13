import { readFile } from "fs/promises";
import path from "path";

/**
 * La landing (`content/index.html`) es HTML estático hecho a mano (GSAP por CDN,
 * sin build) — se sirve tal cual, sin pasar por el árbol de React de app/, para
 * no duplicar el <html>/<head> que ya define app/layout.jsx en el resto del sitio.
 *
 * El contenido se cachea en memoria del módulo (se lee del disco una sola vez
 * por instancia fría) y se marca cacheable en el CDN de Vercel — si no, cada
 * visita a "/" es una invocación de función completa sin caché de por medio.
 */
let cachedHtml;

export async function GET() {
  if (!cachedHtml) {
    const filePath = path.join(process.cwd(), "content", "index.html");
    cachedHtml = await readFile(filePath, "utf-8");
  }

  return new Response(cachedHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
