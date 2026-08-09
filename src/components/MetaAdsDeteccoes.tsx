"use client";

import { useCallback, useEffect, useState } from "react";

interface DeteccaoItem {
  id: number;
  termo: string;
  contexto: string;
  detectado_em: string;
  ad_url: string;
  page_name: string;
  ad_titulo: string;
  busca_termo: string | null;
}

const POR_PAGINA = 20;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MetaAdsDeteccoes() {
  const [deteccoes, setDeteccoes] = useState<DeteccaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);

  const buscar = useCallback(async () => {
    setLoading(true);
    setErro("");

    const params = new URLSearchParams();
    if (termoBusca.trim()) params.set("termo", termoBusca.trim());
    params.set("limite", String(POR_PAGINA));
    params.set("offset", String(pagina * POR_PAGINA));

    const res = await fetch(`/api/meta-ads/deteccoes?${params}`);
    const data = (await res.json()) as {
      deteccoes?: DeteccaoItem[];
      total?: number;
      error?: string;
    };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar detecções");
      setDeteccoes([]);
      setTotal(0);
    } else {
      setDeteccoes(data.deteccoes ?? []);
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
          <h2 className="text-lg font-semibold text-slate-900">Detecções nos anúncios</h2>
          <p className="mt-1 text-sm text-slate-500">
            Menções a assuntos e termos monitorados nos textos dos anúncios. {total} resultado(s).
          </p>
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
      ) : deteccoes.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma detecção ainda.</p>
      ) : (
        <ul className="space-y-3">
          {deteccoes.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-100 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                      {item.termo}
                    </span>{" "}
                    · {item.page_name || "Anunciante"}
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(item.detectado_em)}</p>
                </div>
                <a
                  href={item.ad_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-700 hover:underline"
                >
                  Abrir anúncio
                </a>
              </div>
              <p className="mt-2 text-sm text-slate-700">{item.contexto || item.ad_titulo}</p>
            </li>
          ))}
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
