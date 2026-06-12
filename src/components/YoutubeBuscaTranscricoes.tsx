"use client";

import { useCallback, useState } from "react";
import { formatMinutagem } from "@/lib/text-normalize";
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail";

interface ResultadoItem {
  id: number;
  video_db_id: number;
  inicio_segundos: number;
  texto: string;
  video_id: string;
  video_titulo: string;
  canal_titulo: string;
  publicado_em: string | null;
}

const POR_PAGINA = 20;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function youtubeUrl(videoId: string, segundos: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(segundos)}s`;
}

export default function YoutubeBuscaTranscricoes() {
  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<ResultadoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [buscou, setBuscou] = useState(false);

  const buscar = useCallback(
    async (opts?: { pagina?: number; termo?: string }) => {
      const paginaAtual = opts?.pagina ?? pagina;
      const termoAtual = (opts?.termo ?? termoBusca).trim();

      if (!termoAtual) {
        setErro("Digite uma palavra ou trecho para buscar.");
        return;
      }

      setLoading(true);
      setErro("");

      const params = new URLSearchParams();
      params.set("termo", termoAtual);
      params.set("limite", String(POR_PAGINA));
      params.set("offset", String(paginaAtual * POR_PAGINA));

      const res = await fetch(`/api/youtube/transcricoes/busca?${params}`);
      const data = (await res.json()) as {
        resultados?: ResultadoItem[];
        total?: number;
        error?: string;
      };

      if (!res.ok) {
        setErro(data.error ?? "Erro ao buscar nas transcrições");
        setResultados([]);
        setTotal(0);
      } else {
        setResultados(data.resultados ?? []);
        setTotal(data.total ?? 0);
        setBuscou(true);
      }

      setLoading(false);
    },
    [pagina, termoBusca],
  );

  function aplicarBusca() {
    setPagina(0);
    setTermoBusca(termo);
    void buscar({ pagina: 0, termo });
  }

  function mudarPagina(novaPagina: number) {
    setPagina(novaPagina);
    void buscar({ pagina: novaPagina });
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Buscar nas transcrições</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pesquisa livre no texto das legendas salvas — não depende de palavras-chave cadastradas.
          Diferente das detecções abaixo, que só alertam termos configurados.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") aplicarBusca();
          }}
          placeholder="Ex.: eleições, candidato, prefeito..."
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading}
          onClick={aplicarBusca}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {buscou && !loading && resultados.length === 0 && !erro && (
        <p className="text-sm text-slate-400">
          Nenhum trecho encontrado para “{termoBusca}” nas transcrições salvas.
        </p>
      )}

      {resultados.length > 0 && (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {total} trecho(s) com “{termoBusca}”
          </p>
          <div className="space-y-2">
            {resultados.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3"
              >
                <a
                  href={youtubeUrl(item.video_id, item.inicio_segundos)}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-28 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200"
                >
                  <img
                    src={youtubeThumbnailUrl(item.video_id)}
                    alt=""
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                  />
                </a>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{item.canal_titulo}</span>
                    <span>·</span>
                    <span>{formatDateTime(item.publicado_em)}</span>
                    <span>·</span>
                    <span className="font-mono">{formatMinutagem(item.inicio_segundos)}</span>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{item.video_titulo}</p>
                  <p className="mt-1 text-sm text-slate-700">{item.texto}</p>
                </div>

                <a
                  href={youtubeUrl(item.video_id, item.inicio_segundos)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Ver no YouTube
                </a>
              </div>
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Página {pagina + 1} de {totalPaginas}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pagina === 0 || loading}
                  onClick={() => mudarPagina(Math.max(0, pagina - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={pagina >= totalPaginas - 1 || loading}
                  onClick={() => mudarPagina(pagina + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
