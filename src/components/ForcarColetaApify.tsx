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
        texto:
          papel === "consumidor"
            ? "Posts puxados da base compartilhada — a Apify não rodou neste tenant."
            : "Coleta disparada — Instagram, X e Meta ignoraram o intervalo de 6h.",
      });
    } catch {
      setMsg({ tipo: "erro", texto: "Não foi possível falar com o servidor" });
    } finally {
      setRodando(false);
    }
  }

  const consumidor = papel === "consumidor";
  const semToken = papel === "ausente";

  return (
    <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-sky-950">Coleta das redes</h2>
          {consumidor ? (
            <p className="mt-1 text-xs text-sky-800">
              Este tenant só consome. A Apify roda no principal; daqui a gente puxa os posts e
              detecta com as palavras-chave locais.
            </p>
          ) : (
            <p className="mt-1 text-xs text-sky-800">
              Fura o intervalo de 6h (Instagram/X) e 12h (Meta). Consome o teto diário da Apify.
            </p>
          )}
          {semToken && (
            <p className="mt-2 text-xs text-amber-800">
              Sem <code className="font-mono">APIFY_TOKEN</code> e sem base compartilhada. No
              principal, coloque o token. Nos outros,{" "}
              <code className="font-mono">COLETA_DATABASE_URL</code> +{" "}
              <code className="font-mono">COLETA_SOMENTE_CONSUMIR=true</code>.
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={rodando || semToken}
          onClick={() => void coletar()}
          className="rounded-lg bg-sky-800 px-3 py-2 text-sm font-medium text-white hover:bg-sky-900 disabled:opacity-60"
        >
          {rodando
            ? consumidor
              ? "Puxando..."
              : "Coletando..."
            : consumidor
              ? "Puxar posts agora"
              : "Coletar redes agora"}
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
