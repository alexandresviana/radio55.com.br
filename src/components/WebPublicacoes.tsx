"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

interface ArtigoItem {
  id: number;
  url: string;
  titulo: string;
  fonte: string;
  dominio: string;
  snippet: string;
  publicado_em: string | null;
  search_term: string;
}

const POR_PAGINA = 20;

export default function WebPublicacoes() {
  const { t, formatDateTime } = useI18n();
  const [artigos, setArtigos] = useState<ArtigoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandido, setExpandido] = useState<number | null>(null);

  const buscar = useCallback(async () => {
    setLoading(true);
    setErro("");

    const params = new URLSearchParams();
    if (termoBusca.trim()) params.set("termo", termoBusca.trim());
    params.set("limite", String(POR_PAGINA));
    params.set("offset", String(pagina * POR_PAGINA));

    const res = await fetch(`/api/web/artigos?${params}`);
    const data = (await res.json()) as {
      artigos?: ArtigoItem[];
      total?: number;
      error?: string;
    };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao buscar artigos");
      setArtigos([]);
      setTotal(0);
    } else {
      setArtigos(data.artigos ?? []);
      setTotal(data.total ?? 0);
    }

    setLoading(false);
  }, [pagina, termoBusca]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  function aplicarFiltro() {
    setPagina(0);
    setTermoBusca(termo);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("Notícias coletadas")}</h2>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") aplicarFiltro();
          }}
          placeholder={t("Filtrar por título, portal ou termo")}
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

      {loading && artigos.length === 0 ? (
        <p className="text-sm text-slate-500">{t("Carregando artigos...")}</p>
      ) : artigos.length === 0 ? (
        <p className="text-sm text-slate-400">{t("Nenhum artigo coletado ainda.")}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {artigos.map((artigo) => {
            const aberto = expandido === artigo.id;
            const resumo =
              artigo.snippet.length > 180 && !aberto
                ? `${artigo.snippet.slice(0, 180)}…`
                : artigo.snippet;

            return (
              <li key={artigo.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-800">
                    {artigo.fonte || artigo.dominio || t("Web")}
                  </span>
                  {artigo.search_term && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
                      {artigo.search_term}
                    </span>
                  )}
                  <span>{formatDateTime(artigo.publicado_em)}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-900">{artigo.titulo || t("Sem título")}</p>
                {resumo && <p className="mt-1 text-sm text-slate-700">{resumo}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {artigo.snippet.length > 180 && (
                    <button
                      type="button"
                      onClick={() => setExpandido(aberto ? null : artigo.id)}
                      className="font-medium text-slate-600 hover:text-slate-900"
                    >
                      {aberto ? t("Recolher") : t("Ver mais")}
                    </button>
                  )}
                  <a
                    href={artigo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-amber-800 hover:text-amber-950"
                  >
                    {t("Abrir matéria →")}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > POR_PAGINA && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            {t("Anterior")}
          </button>
          <span className="text-slate-500">
            {t("Página {pagina} de {total}", { pagina: pagina + 1, total: totalPaginas })}
          </span>
          <button
            type="button"
            disabled={pagina + 1 >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            {t("Próxima")}
          </button>
        </div>
      )}
    </section>
  );
}
