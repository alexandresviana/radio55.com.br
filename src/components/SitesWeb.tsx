"use client";

import { useCallback, useEffect, useState } from "react";

interface WebSite {
  id: number;
  dominio: string;
  titulo: string;
  url_entrada: string;
  feed_url: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  artigos_total?: number;
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

export default function SitesWeb() {
  const [sites, setSites] = useState<WebSite[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/web/sites");
    const data = (await res.json()) as { sites?: WebSite[]; error?: string };
    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar sites");
      setSites([]);
    } else {
      setErro("");
      setSites(data.sites ?? []);
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
    const res = await fetch("/api/web/sites", {
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
    const res = await fetch(`/api/web/sites/${id}`, {
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
    if (!confirm("Remover este portal monitorado?")) return;
    await fetch(`/api/web/sites/${id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Portais monitorados</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void adicionar();
          }}
          placeholder="jornaldacidade.net ou https://site.com/feed"
          className="min-w-[280px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={salvando || !url.trim()}
          onClick={() => void adicionar()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {salvando ? "Procurando feed..." : "Adicionar"}
        </button>
      </div>

      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Carregando...</p>
      ) : sites.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">Nenhum portal cadastrado.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Portal</th>
                <th className="px-2 py-2">Artigos</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Última varredura</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id} className="border-b border-slate-50">
                  <td className="px-2 py-3">
                    <a
                      href={site.url_entrada || site.feed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-emerald-800 hover:underline"
                    >
                      {site.titulo || site.dominio}
                    </a>
                    <div className="text-xs text-slate-400">{site.dominio}</div>
                  </td>
                  <td className="px-2 py-3">{site.artigos_total ?? 0}</td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => void patch(site.id, { ativo: !site.ativo })}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        site.ativo
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {site.ativo ? "Ativo" : "Pausado"}
                    </button>
                  </td>
                  <td className="px-2 py-3 text-slate-600">
                    {formatDateTime(site.ultima_verificacao_em)}
                    {site.ultimo_erro && (
                      <p className="text-xs text-amber-700">{site.ultimo_erro}</p>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void remover(site.id)}
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
