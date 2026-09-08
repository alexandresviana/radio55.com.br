"use client";

import { useEffect, useState } from "react";

type PapelColeta = "coletor" | "consumidor" | "ausente";

export default function ForcarColetaApify() {
  const [rodando, setRodando] = useState(false);
  const [papel, setPapel] = useState<PapelColeta | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    void fetch("/api/diagnostico")
      .then((res) => res.json())
      .then((data: { apify_papel?: PapelColeta }) => {
        setPapel(data.apify_papel ?? "ausente");
      })
      .catch(() => {
        setPapel(null);
      });
  }, []);

  async function coletar() {
    if (rodando) return;
    setRodando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/apify/sincronizar", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        erros?: string[];
        error?: string;
        novos?: { instagram?: number; x?: number; meta?: number };
      };
      if (!res.ok) {
        setMsg({ tipo: "erro", texto: data.error ?? "Falha ao atualizar as redes" });
        return;
      }
      if (data.erros && data.erros.length > 0) {
        setMsg({ tipo: "erro", texto: data.erros.join(" · ") });
        return;
      }
      const total =
        (data.novos?.instagram ?? 0) + (data.novos?.x ?? 0) + (data.novos?.meta ?? 0);
      setMsg({
        tipo: "ok",
        texto: total > 0 ? `${total} item(ns) novo(s).` : "Nenhum post novo.",
      });
    } catch {
      setMsg({ tipo: "erro", texto: "Não foi possível falar com o servidor" });
    } finally {
      setRodando(false);
    }
  }

  const semColeta = papel === "ausente";

  return (
    <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-sky-950">Coleta das redes</h2>
          <p className="mt-1 text-xs text-sky-800">
            Atualiza Instagram, X e Meta agora, sem esperar o intervalo.
          </p>
        </div>
        <button
          type="button"
          disabled={rodando || semColeta}
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
