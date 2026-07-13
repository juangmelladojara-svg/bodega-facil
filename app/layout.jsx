import "./globals.css";

export const metadata = {
  title: "Bodegar Fácil — Control de acceso",
  description: "Consulta tu bodega, paga tu mensualidad y habilita tu tarjeta de acceso.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
