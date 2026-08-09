"use client";

import { useCallback, useEffect, useState } from "react";

interface MetaAdsPagina {
  id: number;
  slug: string;
  titulo: string;
  url_entrada: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  anuncios_total?: number;
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

export default function PaginasMetaAds() {
  const [paginas, setPaginas] = useState<MetaAdsPagina[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/meta-ads/paginas");
    const data = (await res.json()) as { paginas?: MetaAdsPagina[]; error?: string };
    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar páginas");
      setPaginas([]);
    } else {
      setErro("");
      setPaginas(data.paginas ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function adicionar() {
    const entrada = url.trim();
    if (!entrada) return;
    setSalvando(true);
    setErro("");
    const res = await fetch("/api/meta-ads/paginas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: entrada }),
    });
    setSalvando(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErro(data.error ?? "Erro ao cadastrar");
      return;
    }
    setUrl("");
    await carregar();
  }

  async function patch(id: number, body: { ativo?: boolean }) {
    const res = await fetch(`/api/meta-ads/paginas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErro(data.error ?? "Erro ao atualizar");
    }
    await carregar();
  }

  async function remover(id: number) {
    if (!confirm("Remover esta página monitorada?")) return;
    await fetch(`/api/meta-ads/paginas/${id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Páginas anunciantes</h2>
      <p className="mt-1 text-sm text-slate-500">
        Monitore todos os anúncios ativos de uma página do Facebook (qualquer anunciante).
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void adicionar();
          }}
          placeholder="facebook.com/nomedapagina ou @pagina"
          className="min-w-[280px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={salvando || !url.trim()}
          onClick={() => void adicionar()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {salvando ? "Salvando..." : "Adicionar"}
        </button>
      </div>

      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Carregando...</p>
      ) : paginas.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">Nenhuma página cadastrada.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Página</th>
                <th className="px-2 py-2">Anúncios</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Última varredura</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {paginas.map((pagina) => (
                <tr key={pagina.id} className="border-b border-slate-50">
                  <td className="px-2 py-3">
                    <a
                      href={pagina.url_entrada}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-emerald-800 hover:underline"
                    >
                      {pagina.titulo || pagina.slug}
                    </a>
                  </td>
                  <td className="px-2 py-3">{pagina.anuncios_total ?? 0}</td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => void patch(pagina.id, { ativo: !pagina.ativo })}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        pagina.ativo
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {pagina.ativo ? "Ativa" : "Pausada"}
                    </button>
                  </td>
                  <td className="px-2 py-3 text-slate-600">
                    {formatDateTime(pagina.ultima_verificacao_em)}
                    {pagina.ultimo_erro && (
                      <p className="text-xs text-amber-700">{pagina.ultimo_erro}</p>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void remover(pagina.id)}
                      className="text-xs text-red-600 hover:underline"
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
