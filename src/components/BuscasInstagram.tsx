"use client";

import { useCallback, useEffect, useState } from "react";

interface InstagramBusca {
  id: number;
  termo: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  posts_total?: number;
  deteccoes_total?: number;
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

function ehFrase(termo: string): boolean {
  return /\s/.test(termo);
}

export default function BuscasInstagram() {
  const [buscas, setBuscas] = useState<InstagramBusca[]>([]);
  const [termo, setTermo] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/instagram/buscas");
    const data = (await res.json()) as { buscas?: InstagramBusca[]; error?: string };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar termos");
      setBuscas([]);
    } else {
      setErro("");
      setBuscas(data.buscas ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function adicionar() {
    const value = termo.trim();
    if (!value) return;

    setSalvando(true);
    setErro("");
    const res = await fetch("/api/instagram/buscas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termo: value }),
    });
    const data = (await res.json()) as { error?: string };
    setSalvando(false);

    if (!res.ok) {
      setErro(data.error ?? "Erro ao adicionar termo");
      return;
    }

    setTermo("");
    await carregar();
  }

  async function alternarAtivo(busca: InstagramBusca) {
    await fetch(`/api/instagram/buscas/${busca.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !busca.ativo }),
    });
    await carregar();
  }

  async function remover(busca: InstagramBusca) {
    if (!confirm(`Remover o termo "#${busca.termo}" e todas as publicações encontradas por ele?`)) {
      return;
    }
    await fetch(`/api/instagram/buscas/${busca.id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Termos monitorados</h2>
        <p className="mt-1 text-sm text-slate-500">
          <strong className="font-medium text-slate-700">Uma palavra</strong> (ex.: aracaju) —
          coleta publicações públicas com essa hashtag em todo o Instagram.{" "}
          <strong className="font-medium text-slate-700">Frase com espaços</strong> (ex.: fabio
          mitidieri) — procura nas legendas e comentários das publicações já coletadas (perfis e
          hashtags).
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void adicionar();
          }}
          placeholder="Ex.: fabio mitidieri · eleicoes · aracaju"
          className="min-w-[280px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={salvando || !termo.trim()}
          onClick={() => void adicionar()}
          className="rounded-lg bg-fuchsia-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-800 disabled:opacity-60"
        >
          {salvando ? "Adicionando..." : "Monitorar termo"}
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando termos...</p>
      ) : buscas.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nenhum termo cadastrado. Para nomes, use a frase completa; para ampliar o alcance,
          combine com perfis ou hashtags.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Termo</th>
                <th className="px-2 py-2">Modo</th>
                <th className="px-2 py-2">Publicações</th>
                <th className="px-2 py-2">Detecções</th>
                <th className="px-2 py-2">Última varredura</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {buscas.map((busca) => (
                <tr key={busca.id} className="border-b border-slate-50">
                  <td className="px-2 py-3">
                    {ehFrase(busca.termo) ? (
                      <span className="font-medium text-slate-900">{busca.termo}</span>
                    ) : (
                      <a
                        href={`https://www.instagram.com/explore/tags/${encodeURIComponent(busca.termo)}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-slate-900 hover:text-fuchsia-700"
                      >
                        #{busca.termo}
                      </a>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {ehFrase(busca.termo) ? "Legendas e comentários" : "Hashtag"}
                    </span>
                  </td>
                  <td className="px-2 py-3">{busca.posts_total ?? 0}</td>
                  <td className="px-2 py-3">{busca.deteccoes_total ?? 0}</td>
                  <td className="px-2 py-3 text-slate-600">
                    {formatDateTime(busca.ultima_verificacao_em)}
                  </td>
                  <td className="px-2 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        busca.ativo
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {busca.ativo ? "Ativo" : "Pausado"}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void alternarAtivo(busca)}
                      className="mr-2 text-xs text-slate-600 hover:text-slate-900"
                    >
                      {busca.ativo ? "Pausar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remover(busca)}
                      className="text-xs text-red-500 hover:text-red-700"
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
