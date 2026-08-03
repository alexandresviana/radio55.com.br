"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DeteccaoItem {
  id: number;
  termo: string;
  contexto: string;
  detectado_em: string;
  post_url: string;
  publicado_em: string | null;
  autor_username: string;
  busca_termo: string | null;
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

export default function XDeteccoes() {
  const [deteccoes, setDeteccoes] = useState<DeteccaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);

  const buscar = useCallback(
    async (opts?: { reescanear?: boolean }) => {
      setLoading(true);
      setErro("");

      const params = new URLSearchParams();
      if (termoBusca.trim()) params.set("termo", termoBusca.trim());
      params.set("limite", String(POR_PAGINA));
      params.set("offset", String(pagina * POR_PAGINA));
      if (opts?.reescanear) params.set("reescanear", "1");

      const res = await fetch(`/api/x/deteccoes?${params}`);
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
  }, [buscar]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Detecções</h2>
          <p className="mt-1 text-sm text-slate-500">
            Menções a palavras-chave e termos monitorados nos posts do X.
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
            Filtrar
          </button>
        </div>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando detecções...</p>
      ) : deteccoes.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma detecção ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {deteccoes.map((item) => (
            <li key={item.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800">
                  {item.termo}
                </span>
                <span>@{item.autor_username || "?"}</span>
                <span>{formatDateTime(item.detectado_em)}</span>
              </div>
              {item.contexto && (
                <p className="mt-1 text-sm text-slate-700">“{item.contexto}”</p>
              )}
              <a
                href={item.post_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-medium text-sky-700 hover:text-sky-900"
              >
                Ver post →
              </a>
            </li>
          ))}
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
            Anterior
          </button>
          <span className="text-slate-500">
            Página {pagina + 1} de {totalPaginas}
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
