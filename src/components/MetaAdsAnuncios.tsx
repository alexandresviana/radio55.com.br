"use client";

import { useCallback, useEffect, useState } from "react";

interface AnuncioItem {
  id: number;
  url: string;
  texto: string;
  titulo: string;
  page_name: string;
  link_url: string | null;
  imagem_url: string | null;
  inicio_em: string | null;
  busca_termo?: string | null;
  pagina_slug?: string | null;
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

export default function MetaAdsAnuncios() {
  const [anuncios, setAnuncios] = useState<AnuncioItem[]>([]);
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

    const res = await fetch(`/api/meta-ads/anuncios?${params}`);
    const data = (await res.json()) as {
      anuncios?: AnuncioItem[];
      total?: number;
      error?: string;
    };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar anúncios");
      setAnuncios([]);
      setTotal(0);
    } else {
      setAnuncios(data.anuncios ?? []);
      setTotal(data.total ?? 0);
    }

    setLoading(false);
  }, [pagina, termoBusca]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Anúncios coletados</h2>
          <p className="mt-1 text-sm text-slate-500">{total} anúncio(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPagina(0);
                setTermoBusca(termo);
              }
            }}
            placeholder="Filtrar..."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              setPagina(0);
              setTermoBusca(termo);
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Buscar
          </button>
        </div>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : anuncios.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum anúncio coletado ainda.</p>
      ) : (
        <ul className="space-y-3">
          {anuncios.map((item) => {
            const aberto = expandido === item.id;
            return (
              <li
                key={item.id}
                className="rounded-xl border border-slate-100 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {item.page_name || "Anunciante"}
                      {item.titulo ? (
                        <span className="font-normal text-slate-600"> — {item.titulo}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(item.inicio_em)}
                      {item.busca_termo ? ` · busca “${item.busca_termo}”` : ""}
                      {item.pagina_slug ? ` · página ${item.pagina_slug}` : ""}
                    </p>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-700 hover:underline"
                  >
                    Ver na biblioteca
                  </a>
                </div>
                <p className={`mt-2 text-sm text-slate-700 ${aberto ? "" : "line-clamp-2"}`}>
                  {item.texto || "—"}
                </p>
                <button
                  type="button"
                  onClick={() => setExpandido(aberto ? null : item.id)}
                  className="mt-1 text-xs text-slate-500 hover:underline"
                >
                  {aberto ? "Recolher" : "Expandir"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-slate-500">
            {pagina + 1} / {totalPaginas}
          </span>
          <button
            type="button"
            disabled={pagina + 1 >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}
