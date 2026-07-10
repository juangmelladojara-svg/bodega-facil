import { readFile } from "fs/promises";
import path from "path";

/**
 * La landing (`content/index.html`) es HTML estático hecho a mano (GSAP por CDN,
 * sin build) — se sirve tal cual, sin pasar por el árbol de React de app/, para
 * no duplicar el <html>/<head> que ya define app/layout.jsx en el resto del sitio.
 */
export async function GET() {
  const filePath = path.join(process.cwd(), "content", "index.html");
  const html = await readFile(filePath, "utf-8");

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
