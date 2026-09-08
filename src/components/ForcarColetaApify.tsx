"use client";

import { useEffect, useState } from "react";

export default function ForcarColetaApify() {
  const [rodando, setRodando] = useState(false);
  const [tokenOk, setTokenOk] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    void fetch("/api/diagnostico")
      .then((res) => res.json())
      .then((data: { apify_token?: boolean }) => {
        setTokenOk(data.apify_token === true);
      })
      .catch(() => {
        setTokenOk(null);
      });
  }, []);

  async function coletar() {
    if (rodando) return;
    setRodando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/apify/sincronizar", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; erros?: string[]; error?: string };
      if (!res.ok) {
        setMsg({ tipo: "erro", texto: data.error ?? "Falha ao disparar a coleta" });
        return;
      }
      if (data.erros && data.erros.length > 0) {
        setMsg({ tipo: "erro", texto: data.erros.join(" · ") });
        return;
      }
      setMsg({
        tipo: "ok",
        texto: "Coleta disparada — Instagram, X e Meta ignoraram o intervalo de 6h.",
      });
    } catch {
      setMsg({ tipo: "erro", texto: "Não foi possível falar com o servidor" });
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-sky-950">Coleta das redes</h2>
          <p className="mt-1 text-xs text-sky-800">
            Fura o intervalo de 6h (Instagram/X) e 12h (Meta). Consome o teto diário da Apify.
          </p>
          {tokenOk === false && (
            <p className="mt-2 text-xs text-amber-800">
              Este container não vê <code className="font-mono">APIFY_TOKEN</code>. Coloque no
              Coolify (Runtime), reinicie, e o botão libera.
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={rodando || tokenOk === false}
          onClick={() => void coletar()}
          className="rounded-lg bg-sky-800 px-3 py-2 text-sm font-medium text-white hover:bg-sky-900 disabled:opacity-60"
        >
          {rodando ? "Coletando..." : "Coletar redes agora"}
        </button>
      </div>
      {msg && (
        <p
          className={`mt-3 text-xs ${msg.tipo === "ok" ? "text-emerald-800" : "text-red-700"}`}
        >
          {msg.texto}
        </p>
      )}
    </div>
  );
}
