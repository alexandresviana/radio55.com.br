"use client";

import { useCallback, useEffect, useState } from "react";

interface YoutubeCanal {
  id: number;
  channel_id: string;
  titulo: string;
  url_entrada: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  videos_total?: number;
  videos_pendentes?: number;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CanaisYouTube() {
  const [canais, setCanais] = useState<YoutubeCanal[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/youtube/canais");
    const data = (await res.json()) as { canais?: YoutubeCanal[]; error?: string };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar canais");
      setCanais([]);
    } else {
      setErro("");
      setCanais(data.canais ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function adicionar() {
    const value = url.trim();
    if (!value) return;

    setSalvando(true);
    setErro("");
    const res = await fetch("/api/youtube/canais", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
    });
    const data = (await res.json()) as { error?: string };
    setSalvando(false);

    if (!res.ok) {
      setErro(data.error ?? "Erro ao adicionar canal");
      return;
    }

    setUrl("");
    await carregar();
  }

  async function alternarAtivo(canal: YoutubeCanal) {
    await fetch(`/api/youtube/canais/${canal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !canal.ativo }),
    });
    await carregar();
  }

  async function remover(canal: YoutubeCanal) {
    if (!confirm(`Remover o canal "${canal.titulo}" e todos os vídeos analisados?`)) return;
    await fetch(`/api/youtube/canais/${canal.id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Canais do YouTube</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cole a URL do canal. Os vídeos recentes entram na fila e são analisados via legendas
          (sem baixar o vídeo).
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/@canal ou /channel/UC..."
          className="min-w-[280px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={salvando || !url.trim()}
          onClick={() => void adicionar()}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {salvando ? "Adicionando..." : "Adicionar canal"}
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando canais...</p>
      ) : canais.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum canal cadastrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Canal</th>
                <th className="px-2 py-2">Vídeos</th>
                <th className="px-2 py-2">Fila</th>
                <th className="px-2 py-2">Última sync</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {canais.map((canal) => (
                <tr key={canal.id} className="border-b border-slate-50">
                  <td className="px-2 py-3">
                    <div className="font-medium text-slate-900">{canal.titulo}</div>
                    <a
                      href={canal.url_entrada.startsWith("http") ? canal.url_entrada : `https://www.youtube.com/channel/${canal.channel_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-500 hover:text-red-600"
                    >
                      {canal.channel_id}
                    </a>
                  </td>
                  <td className="px-2 py-3">{canal.videos_total ?? 0}</td>
                  <td className="px-2 py-3">{canal.videos_pendentes ?? 0}</td>
                  <td className="px-2 py-3 text-slate-600">
                    {formatDateTime(canal.ultima_verificacao_em)}
                  </td>
                  <td className="px-2 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        canal.ativo
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {canal.ativo ? "Ativo" : "Pausado"}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void alternarAtivo(canal)}
                      className="mr-2 text-xs text-slate-600 hover:text-slate-900"
                    >
                      {canal.ativo ? "Pausar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remover(canal)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remover
                    </button>
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
