"use client";

import { useCallback, useState } from "react";
import { formatMinutagem } from "@/lib/text-normalize";

interface DeteccaoItem {
  id: number;
  termo: string;
  inicio_segundos: number;
  contexto: string;
  detectado_em: string;
  video_id: string;
  video_titulo: string;
  canal_titulo: string;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function youtubeUrl(videoId: string, segundos: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(segundos)}s`;
}

export default function YoutubeDeteccoes() {
  const [deteccoes, setDeteccoes] = useState<DeteccaoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [termo, setTermo] = useState("");

  const buscar = useCallback(async () => {
    setLoading(true);
    setErro("");

    const params = new URLSearchParams();
    if (termo.trim()) params.set("termo", termo.trim());
    params.set("limite", "100");

    const res = await fetch(`/api/youtube/deteccoes?${params}`);
    const data = (await res.json()) as { deteccoes?: DeteccaoItem[]; error?: string };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao buscar detecções");
      setDeteccoes([]);
    } else {
      setDeteccoes(data.deteccoes ?? []);
    }

    setLoading(false);
  }, [termo]);

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Detecções no YouTube</h2>
          <p className="mt-1 text-sm text-slate-500">
            Palavras-chave encontradas nas legendas dos vídeos monitorados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void buscar()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Filtrar por palavra-chave"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void buscar()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {deteccoes.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nenhuma detecção ainda. Cadastre canais e palavras-chave, depois clique em Buscar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Detectado</th>
                <th className="px-2 py-2">Palavra</th>
                <th className="px-2 py-2">Canal / vídeo</th>
                <th className="px-2 py-2">Minutagem</th>
                <th className="px-2 py-2">Contexto</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {deteccoes.map((item) => (
                <tr key={item.id} className="border-b border-slate-50 align-top">
                  <td className="px-2 py-3 text-slate-600">{formatDateTime(item.detectado_em)}</td>
                  <td className="px-2 py-3 font-medium text-slate-900">{item.termo}</td>
                  <td className="px-2 py-3">
                    <div className="font-medium text-slate-800">{item.canal_titulo}</div>
                    <div className="text-xs text-slate-500">{item.video_titulo}</div>
                  </td>
                  <td className="px-2 py-3 font-mono text-xs text-slate-600">
                    {formatMinutagem(item.inicio_segundos)}
                  </td>
                  <td className="max-w-xs px-2 py-3 text-slate-700">{item.contexto}</td>
                  <td className="px-2 py-3">
                    <a
                      href={youtubeUrl(item.video_id, item.inicio_segundos)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Ver no YouTube
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
