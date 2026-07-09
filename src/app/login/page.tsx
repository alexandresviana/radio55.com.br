"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { safeRedirectPath } from "@/lib/auth";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ user, pass }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Erro ao entrar");
        return;
      }

      const destino = safeRedirectPath(searchParams.get("from"));
      window.location.assign(destino);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 px-4">
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute -left-20 top-20 h-64 w-64 rounded-full bg-emerald-500 blur-3xl" />
        <div className="absolute -right-20 bottom-20 h-64 w-64 rounded-full bg-amber-500 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-8 shadow-2xl backdrop-blur">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Mapa de Emissoras</h1>
          <p className="mt-2 text-sm text-slate-500">Acesso restrito · Sergipe</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="user" className="mb-1 block text-sm font-medium text-slate-700">
              Usuário
            </label>
            <input
              id="user"
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
              autoComplete="username"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 outline-none ring-emerald-500 focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="pass" className="mb-1 block text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              id="pass"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 outline-none ring-emerald-500 focus:ring-2"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-700 py-2.5 font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
