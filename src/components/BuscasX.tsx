"use client";

import { useCallback, useEffect, useState } from "react";

interface XBusca {
  id: number;
  termo: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  posts_total?: number;
  deteccoes_total?: number;
}

interface MonitorStatus {
  ativo: boolean;
  coleta_configurada: boolean;
  sincronizando: boolean;
  erro: string | null;
  ultima_sincronizacao: string | null;
  intervalo_minutos: number;
  posts_coletados?: number;
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

export default function BuscasX() {
  const [buscas, setBuscas] = useState<XBusca[]>([]);
  const [monitor, setMonitor] = useState<MonitorStatus | null>(null);
  const [termo, setTermo] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const [resBuscas, resStatus] = await Promise.all([
      fetch("/api/x/buscas"),
      fetch("/api/x/status"),
    ]);

    const dataBuscas = (await resBuscas.json()) as { buscas?: XBusca[]; error?: string };
    const dataStatus = (await resStatus.json().catch(() => ({}))) as {
      monitor?: MonitorStatus;
    };

    if (!resBuscas.ok) {
      setErro(dataBuscas.error ?? "Erro ao carregar termos");
      setBuscas([]);
    } else {
      setErro("");
      setBuscas(dataBuscas.buscas ?? []);
    }

    setMonitor(dataStatus.monitor ?? null);
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
    const res = await fetch("/api/x/buscas", {
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

  async function sincronizarAgora() {
    setSincronizando(true);
    setErro("");
    const res = await fetch("/api/x/status", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      monitor?: MonitorStatus;
    };
    setSincronizando(false);

    if (!res.ok) {
      setErro(data.error ?? "Erro ao sincronizar");
      return;
    }

    setMonitor(data.monitor ?? null);
    await carregar();
  }

  async function alternarAtivo(busca: XBusca) {
    await fetch(`/api/x/buscas/${busca.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !busca.ativo }),
    });
    await carregar();
  }

  async function remover(busca: XBusca) {
    if (!confirm(`Remover o termo “${busca.termo}” e os posts encontrados por ele?`)) {
      return;
    }
    await fetch(`/api/x/buscas/${busca.id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Termos monitorados</h2>
          <p className="mt-1 text-sm text-slate-500">
            Busca posts públicos no X por palavra ou frase (ex.: fabio mitidieri, eleições,
            aracaju). O texto passa pelas mesmas palavras-chave das outras fontes.
          </p>
        </div>
        <button
          type="button"
          disabled={sincronizando || !monitor?.coleta_configurada}
          onClick={() => void sincronizarAgora()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {sincronizando || monitor?.sincronizando ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      </div>

      {monitor && (
        <p className="mb-4 text-xs text-slate-500">
          {monitor.coleta_configurada
            ? `Monitor ${monitor.ativo ? "ativo" : "inativo"} · intervalo ${monitor.intervalo_minutos} min · última sync ${formatDateTime(monitor.ultima_sincronizacao)}`
            : "Coleta não configurada no servidor."}
          {monitor.erro ? ` · ${monitor.erro}` : ""}
        </p>
      )}

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
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800 disabled:opacity-60"
        >
          {salvando ? "Adicionando..." : "Monitorar termo"}
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando termos...</p>
      ) : buscas.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nenhum termo cadastrado. Cadastre um assunto para começar a coletar posts no X.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Termo</th>
                <th className="px-2 py-2">Posts</th>
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
                    <a
                      href={`https://x.com/search?q=${encodeURIComponent(busca.termo)}&src=typed_query&f=live`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-900 hover:text-sky-700"
                    >
                      {busca.termo}
                    </a>
                    {busca.ultimo_erro && (
                      <p className="mt-0.5 text-xs text-amber-700">{busca.ultimo_erro}</p>
                    )}
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
