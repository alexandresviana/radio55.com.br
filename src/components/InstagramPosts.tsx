"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

interface PostItem {
  id: number;
  url: string;
  tipo: string;
  legenda: string;
  publicado_em: string | null;
  curtidas: number | null;
  comentarios: number | null;
  perfil_username?: string;
  perfil_titulo?: string;
  busca_termo?: string | null;
  comentarios_salvos?: number;
}

interface ComentarioItem {
  id: number;
  autor_username: string;
  texto: string;
  publicado_em: string | null;
  curtidas: number | null;
}

const POR_PAGINA = 20;

function rotuloTipo(tipo: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    Image: "Foto",
    Video: "Vídeo",
    Sidecar: "Carrossel",
  };
  return t(map[tipo] ?? (tipo || "Publicação"));
}

export default function InstagramPosts() {
  const { t, formatDateTime } = useI18n();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [comentariosAbertos, setComentariosAbertos] = useState<number | null>(null);
  const [comentariosPorPost, setComentariosPorPost] = useState<Record<number, ComentarioItem[]>>({});
  const [carregandoComentarios, setCarregandoComentarios] = useState(false);

  async function alternarComentarios(postId: number) {
    if (comentariosAbertos === postId) {
      setComentariosAbertos(null);
      return;
    }

    setComentariosAbertos(postId);
    if (comentariosPorPost[postId]) return;

    setCarregandoComentarios(true);
    const res = await fetch(`/api/instagram/comentarios?post_db_id=${postId}&limite=100`);
    const data = (await res.json().catch(() => ({}))) as { comentarios?: ComentarioItem[] };
    setComentariosPorPost((prev) => ({ ...prev, [postId]: data.comentarios ?? [] }));
    setCarregandoComentarios(false);
  }

  const buscar = useCallback(async () => {
    setLoading(true);
    setErro("");

    const params = new URLSearchParams();
    if (termoBusca.trim()) params.set("termo", termoBusca.trim());
    params.set("limite", String(POR_PAGINA));
    params.set("offset", String(pagina * POR_PAGINA));

    const res = await fetch(`/api/instagram/posts?${params}`);
    const data = (await res.json()) as {
      posts?: PostItem[];
      total?: number;
      error?: string;
    };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao buscar publicações");
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

  function aplicarFiltro() {
    setPagina(0);
    setTermoBusca(termo);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("Publicações coletadas")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t(
              "Últimas publicações dos perfis monitorados. A busca considera o texto das legendas (com ou sem acentos).",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void buscar()}
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
          placeholder={t("Buscar na legenda (ex.: eleições)")}
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

      {loading && posts.length === 0 ? (
        <p className="text-sm text-slate-400">{t("Carregando publicações...")}</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-slate-400">
          {termoBusca
            ? t(
                "Nenhuma publicação encontrada para “{termo}”. Cadastre perfis; a coleta acontece automaticamente.",
                { termo: termoBusca },
              )
            : t("Nenhuma publicação encontrada. Cadastre perfis; a coleta acontece automaticamente.")}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {t("{total} publicação(ões)", { total })}
            {termoBusca ? ` ${t("· filtro “{termo}”", { termo: termoBusca })}` : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">{t("Publicado")}</th>
                  <th className="px-2 py-2">{t("Perfil")}</th>
                  <th className="px-2 py-2">{t("Tipo")}</th>
                  <th className="px-2 py-2">{t("Legenda")}</th>
                  <th className="px-2 py-2">{t("Engajamento")}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => {
                  const aberto = expandido === post.id;
                  const legenda = post.legenda || t("(sem legenda)");
                  const curta = legenda.length > 140 ? `${legenda.slice(0, 140)}…` : legenda;
                  const comentariosAberto = comentariosAbertos === post.id;
                  const comentariosDoPost = comentariosPorPost[post.id];

                  return (
                    <React.Fragment key={post.id}>
                      <tr className="border-b border-slate-50 align-top">
                        <td className="px-2 py-3 text-slate-600">
                          {formatDateTime(post.publicado_em)}
                        </td>
                        <td className="px-2 py-3">
                          <div className="font-medium text-slate-800">@{post.perfil_username}</div>
                          {post.busca_termo && (
                            <span className="mt-1 inline-block rounded-full bg-fuchsia-50 px-2 py-0.5 text-xs text-fuchsia-700">
                              #{post.busca_termo}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {rotuloTipo(post.tipo, t)}
                          </span>
                        </td>
                        <td className="max-w-md px-2 py-3 text-slate-700">
                          <button
                            type="button"
                            onClick={() => setExpandido(aberto ? null : post.id)}
                            className="text-left"
                            title={aberto ? t("Recolher") : t("Expandir")}
                          >
                            {aberto ? legenda : curta}
                          </button>
                        </td>
                        <td className="px-2 py-3 text-xs text-slate-600">
                          {post.curtidas !== null ? t("{n} curtidas", { n: post.curtidas }) : "—"}
                          {post.comentarios !== null
                            ? ` · ${t("{n} comentários", { n: post.comentarios })}`
                            : ""}
                          {(post.comentarios_salvos ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => void alternarComentarios(post.id)}
                              className="mt-1 block text-left font-medium text-fuchsia-700 hover:text-fuchsia-800"
                            >
                              {comentariosAberto
                                ? t("Ocultar comentários")
                                : t("Ver {n} analisado(s)", { n: post.comentarios_salvos ?? 0 })}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {post.url && (
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-fuchsia-700 hover:text-fuchsia-800"
                            >
                              {t("Ver publicação")}
                            </a>
                          )}
                        </td>
                      </tr>
                      {comentariosAberto && (
                        <tr className="border-b border-slate-50 bg-slate-50/60">
                          <td colSpan={6} className="px-4 py-3">
                            {carregandoComentarios && !comentariosDoPost ? (
                              <p className="text-xs text-slate-500">{t("Carregando comentários...")}</p>
                            ) : !comentariosDoPost || comentariosDoPost.length === 0 ? (
                              <p className="text-xs text-slate-400">
                                {t("Nenhum comentário analisado nesta publicação.")}
                              </p>
                            ) : (
                              <ul className="space-y-2">
                                {comentariosDoPost.map((comentario) => (
                                  <li key={comentario.id} className="text-sm">
                                    <span className="font-medium text-slate-800">
                                      @{comentario.autor_username || t("anônimo")}
                                    </span>{" "}
                                    <span className="text-slate-700">{comentario.texto}</span>
                                    <span className="ml-2 text-xs text-slate-400">
                                      {formatDateTime(comentario.publicado_em)}
                                      {comentario.curtidas !== null
                                        ? ` · ${t("{n} curtidas", { n: comentario.curtidas })}`
                                        : ""}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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
