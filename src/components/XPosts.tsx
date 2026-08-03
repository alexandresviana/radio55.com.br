"use client";

import { useCallback, useEffect, useState } from "react";

interface PostItem {
  id: number;
  url: string;
  texto: string;
  autor_username: string;
  autor_nome: string;
  publicado_em: string | null;
  curtidas: number | null;
  retweets: number | null;
  respostas: number | null;
  busca_termo?: string | null;
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

export default function XPosts() {
  const [posts, setPosts] = useState<PostItem[]>([]);
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

    const res = await fetch(`/api/x/posts?${params}`);
    const data = (await res.json()) as {
      posts?: PostItem[];
      total?: number;
      error?: string;
    };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar posts");
      setPosts([]);
      setTotal(0);
    } else {
      setPosts(data.posts ?? []);
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
          <h2 className="text-lg font-semibold text-slate-900">Posts coletados</h2>
          <p className="mt-1 text-sm text-slate-500">{total} post(s)</p>
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
        <p className="text-sm text-slate-500">Carregando posts...</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum post coletado ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {posts.map((post) => {
            const aberto = expandido === post.id;
            const resumo =
              post.texto.length > 180 && !aberto
                ? `${post.texto.slice(0, 180)}…`
                : post.texto;

            return (
              <li key={post.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-800">
                    @{post.autor_username || "?"}
                  </span>
                  {post.busca_termo && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">
                      {post.busca_termo}
                    </span>
                  )}
                  <span>{formatDateTime(post.publicado_em)}</span>
                  {post.curtidas != null && <span>{post.curtidas} curtidas</span>}
                  {post.retweets != null && <span>{post.retweets} reposts</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{resumo}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {post.texto.length > 180 && (
                    <button
                      type="button"
                      onClick={() => setExpandido(aberto ? null : post.id)}
                      className="font-medium text-slate-600 hover:text-slate-900"
                    >
                      {aberto ? "Recolher" : "Ver mais"}
                    </button>
                  )}
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sky-700 hover:text-sky-900"
                  >
                    Ver no X →
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
