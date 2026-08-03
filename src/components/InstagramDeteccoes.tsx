"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DeteccaoItem {
  id: number;
  termo: string;
  contexto: string;
  detectado_em: string;
  post_url: string;
  post_tipo: string;
  publicado_em: string | null;
  perfil_username: string;
  perfil_titulo: string | null;
  busca_termo: string | null;
  comentario_db_id: number | null;
  comentario_autor: string | null;
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

export default function InstagramDeteccoes() {
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

      const res = await fetch(`/api/instagram/deteccoes?${params}`);
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

  function aplicarFiltro() {
    setPagina(0);
    setTermoBusca(termo);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Detecções no Instagram</h2>
          <p className="mt-1 text-sm text-slate-500">
            Palavras-chave encontradas nas legendas e nos comentários das publicações
            monitoradas. A busca inclui termo, contexto e perfil.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void buscar({ reescanear: true })}
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
          onKeyDown={(e) => {
            if (e.key === "Enter") aplicarFiltro();
          }}
          placeholder="Filtrar por palavra (ex.: eleições)"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading}
          onClick={aplicarFiltro}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading && deteccoes.length === 0 ? (
        <p className="text-sm text-slate-400">Carregando detecções...</p>
      ) : deteccoes.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nenhuma detecção encontrada{termoBusca ? ` para “${termoBusca}”` : ""}. Cadastre
          palavras-chave e perfis; as publicações já coletadas são reescaneadas automaticamente.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {total} ocorrência(s)
            {termoBusca ? ` · filtro “${termoBusca}”` : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Detectado</th>
                  <th className="px-2 py-2">Palavra</th>
                  <th className="px-2 py-2">Perfil</th>
                  <th className="px-2 py-2">Publicado</th>
                  <th className="px-2 py-2">Contexto</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {deteccoes.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50 align-top">
                    <td className="px-2 py-3 text-slate-600">
                      {formatDateTime(item.detectado_em)}
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-medium text-slate-900">{item.termo}</div>
                      {item.comentario_db_id ? (
                        <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          Comentário{item.comentario_autor ? ` · @${item.comentario_autor}` : ""}
                        </span>
                      ) : (
                        <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          Legenda
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-medium text-slate-800">@{item.perfil_username}</div>
                      {item.busca_termo && (
                        <span className="mt-1 inline-block rounded-full bg-fuchsia-50 px-2 py-0.5 text-xs text-fuchsia-700">
                          via #{item.busca_termo}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-slate-600">
                      {formatDateTime(item.publicado_em)}
                    </td>
                    <td className="max-w-xs px-2 py-3 text-slate-700">{item.contexto}</td>
                    <td className="px-2 py-3">
                      {item.post_url && (
                        <a
                          href={item.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-fuchsia-700 hover:text-fuchsia-800"
                        >
                          Ver no Instagram
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  onClick={() => setPagina((prev) => Math.max(0, prev - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={pagina >= totalPaginas - 1 || loading}
                  onClick={() => setPagina((prev) => prev + 1)}
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
