"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, AlertTriangle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowserClient";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Email o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-2">
            Bodega Fácil
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-text">Panel de administración</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-xl shadow-black/20"
        >
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-text-muted">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {error && (
            <p className="flex items-center gap-2 text-sm text-danger">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-2 disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            Ingresar
          </button>
        </form>
      </div>
    </main>
  );
}
