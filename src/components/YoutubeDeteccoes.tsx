"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SeloTermoDeteccao from "@/components/SeloTermoDeteccao";
import { useI18n } from "@/i18n/I18nProvider";
import { formatMinutagem } from "@/lib/text-normalize";
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail";

interface DeteccaoItem {
  id: number;
  termo: string;
  ancora_termo?: string;
  inicio_segundos: number;
  contexto: string;
  detectado_em: string;
  video_id: string;
  video_titulo: string;
  canal_titulo: string;
}

const POR_PAGINA = 20;

function youtubeUrl(videoId: string, segundos: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(segundos)}s`;
}

export default function YoutubeDeteccoes() {
  const { t, formatDateTime } = useI18n();
  const [deteccoes, setDeteccoes] = useState<DeteccaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const buscar = useCallback(
    async (opts?: { pagina?: number; termo?: string; reescanear?: boolean }) => {
      setLoading(true);
      setErro("");

      const paginaAtual = opts?.pagina ?? pagina;
      const termoAtual = opts?.termo ?? termoBusca;
      const deveReescanear = opts?.reescanear ?? false;

      const params = new URLSearchParams();
      if (termoAtual.trim()) params.set("termo", termoAtual.trim());
      params.set("limite", String(POR_PAGINA));
      params.set("offset", String(paginaAtual * POR_PAGINA));
      if (deveReescanear) params.set("reescanear", "1");

      const res = await fetch(`/api/youtube/deteccoes?${params}`);
      const data = (await res.json()) as {
        deteccoes?: DeteccaoItem[];
        total?: number;
        error?: string;
      };

      if (!res.ok) {
        setErro(data.error ?? "Erro ao buscar detecções");
        setDeteccoes([]);
        setTotal(0);
      } else {
        setDeteccoes(data.deteccoes ?? []);
        setTotal(data.total ?? 0);
      }

      setLoading(false);
    },
    [pagina, termoBusca],
  );

  const primeiraCarga = useRef(true);

  useEffect(() => {
    void buscar({ reescanear: primeiraCarga.current });
    primeiraCarga.current = false;
  }, [pagina, termoBusca, buscar]);

  function aplicarFiltro() {
    setPagina(0);
    setTermoBusca(termo);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("Detecções no YouTube")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t(
              "Palavras-chave encontradas nas legendas dos vídeos monitorados. A busca inclui termo, contexto e título do vídeo.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void buscar({ reescanear: true })}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {t("Atualizar")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") aplicarFiltro();
          }}
          placeholder={t("Filtrar por palavra (ex.: eleições)")}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading}
          onClick={aplicarFiltro}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? t("Buscando...") : t("Buscar")}
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{t(erro)}</p>}

      {loading && deteccoes.length === 0 ? (
        <p className="text-sm text-slate-400">{t("Carregando detecções...")}</p>
      ) : deteccoes.length === 0 ? (
        <p className="text-sm text-slate-400">
          {termoBusca
            ? t(
                "Nenhuma detecção encontrada para “{termo}”. Cadastre palavras-chave e canais; o sistema reescaneia vídeos já transcritos automaticamente.",
                { termo: termoBusca },
              )
            : t(
                "Nenhuma detecção encontrada. Cadastre palavras-chave e canais; o sistema reescaneia vídeos já transcritos automaticamente.",
              )}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {t("{total} ocorrência(s)", { total })}
            {termoBusca ? ` ${t("· filtro “{termo}”", { termo: termoBusca })}` : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">{t("Vídeo")}</th>
                  <th className="px-2 py-2">{t("Detectado")}</th>
                  <th className="px-2 py-2">{t("Palavra")}</th>
                  <th className="px-2 py-2">{t("Canal / título")}</th>
                  <th className="px-2 py-2">{t("Minutagem")}</th>
                  <th className="px-2 py-2">{t("Contexto")}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {deteccoes.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50 align-top">
                    <td className="px-2 py-3">
                      <a
                        href={youtubeUrl(item.video_id, item.inicio_segundos)}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-28 overflow-hidden rounded-lg ring-1 ring-slate-200"
                      >
                        <img
                          src={youtubeThumbnailUrl(item.video_id)}
                          alt=""
                          className="aspect-video w-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    </td>
                    <td className="px-2 py-3 text-slate-600">
                      {formatDateTime(item.detectado_em, { seconds: true })}
                    </td>
                    <td className="px-2 py-3 font-medium text-slate-900">
                      <SeloTermoDeteccao termo={item.termo} ancora={item.ancora_termo} />
                    </td>
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
                        {t("Ver no YouTube")}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {t("Página {pagina} de {total}", { pagina: pagina + 1, total: totalPaginas })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pagina === 0 || loading}
                  onClick={() => setPagina((prev) => Math.max(0, prev - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {t("Anterior")}
                </button>
                <button
                  type="button"
                  disabled={pagina >= totalPaginas - 1 || loading}
                  onClick={() => setPagina((prev) => prev + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {t("Próxima")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
