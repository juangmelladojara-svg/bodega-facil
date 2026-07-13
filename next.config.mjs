/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // CSP queda pendiente aparte: el sitio depende de varios orígenes de
    // terceros (GSAP por cdnjs, Google Fonts, WhatsApp, Supabase, Transbank)
    // y armar el allowlist correcto sin romper nada requiere probar cada
    // ruta — no es seguro improvisarlo acá. Estos headers sí son seguros
    // por defecto para cualquier sitio.
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];

    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
