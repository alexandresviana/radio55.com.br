"use client";

import { useEffect, useState } from "react";

type PapelColeta = "coletor" | "consumidor" | "ausente";

function formatarEspera(segundos: number): string {
  const min = Math.max(1, Math.ceil(segundos / 60));
  if (min >= 60) {
    const horas = Math.floor(min / 60);
    const resto = min % 60;
    return resto > 0 ? `${horas} h ${resto} min` : `${horas} h`;
  }
  return `${min} min`;
}

export default function ForcarColetaApify() {
  const [rodando, setRodando] = useState(false);
  const [papel, setPapel] = useState<PapelColeta | null>(null);
  const [espera, setEspera] = useState(0);
  const [intervaloMin, setIntervaloMin] = useState(60);
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

    void fetch("/api/apify/sincronizar")
      .then((res) => res.json())
      .then((data: { retry_after_segundos?: number; intervalo_minutos?: number }) => {
        setEspera(Math.max(0, data.retry_after_segundos ?? 0));
        if (data.intervalo_minutos) setIntervaloMin(data.intervalo_minutos);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (espera <= 0) return;
    const timer = setInterval(() => {
      setEspera((atual) => Math.max(0, atual - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [espera > 0]);

  async function coletar() {
    if (rodando || espera > 0) return;
    setRodando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/apify/sincronizar", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        erros?: string[];
        error?: string;
        retry_after_segundos?: number;
        novos?: { instagram?: number; x?: number; meta?: number };
      };
      if (typeof data.retry_after_segundos === "number" && data.retry_after_segundos > 0) {
        setEspera(data.retry_after_segundos);
      } else if (res.ok) {
        setEspera(intervaloMin * 60);
      }
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
  const bloqueado = rodando || semColeta || espera > 0;

  return (
    <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-sky-950">Coleta das redes</h2>
          <p className="mt-1 text-xs text-sky-800">
            Atualiza Instagram, X e Meta agora. No máximo uma vez a cada {intervaloMin} min.
          </p>
        </div>
        <button
          type="button"
          disabled={bloqueado}
          onClick={() => void coletar()}
          className="rounded-lg bg-sky-800 px-3 py-2 text-sm font-medium text-white hover:bg-sky-900 disabled:opacity-60"
        >
          {rodando
            ? "Coletando..."
            : espera > 0
              ? `Aguarde ${formatarEspera(espera)}`
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
