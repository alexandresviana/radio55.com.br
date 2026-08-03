"use client";

import { useCallback, useEffect, useState } from "react";

interface InstagramPerfil {
  id: number;
  username: string;
  titulo: string;
  url_entrada: string;
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

export default function PerfisInstagram() {
  const [perfis, setPerfis] = useState<InstagramPerfil[]>([]);
  const [monitor, setMonitor] = useState<MonitorStatus | null>(null);
  const [entrada, setEntrada] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const [resPerfis, resStatus] = await Promise.all([
      fetch("/api/instagram/perfis"),
      fetch("/api/instagram/status"),
    ]);

    const dataPerfis = (await resPerfis.json()) as {
      perfis?: InstagramPerfil[];
      error?: string;
    };
    const dataStatus = (await resStatus.json().catch(() => ({}))) as {
      monitor?: MonitorStatus;
    };

    if (!resPerfis.ok) {
      setErro(dataPerfis.error ?? "Erro ao carregar perfis");
      setPerfis([]);
    } else {
      setErro("");
      setPerfis(dataPerfis.perfis ?? []);
    }

    setMonitor(dataStatus.monitor ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function adicionar() {
    const value = entrada.trim();
    if (!value) return;

    setSalvando(true);
    setErro("");
    const res = await fetch("/api/instagram/perfis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
    });
    const data = (await res.json()) as { error?: string };
    setSalvando(false);

    if (!res.ok) {
      setErro(data.error ?? "Erro ao adicionar perfil");
      return;
    }

    setEntrada("");
    await carregar();
  }

  async function sincronizarAgora() {
    setSincronizando(true);
    await fetch("/api/instagram/status", { method: "POST" }).catch(() => {});
    setSincronizando(false);
    await carregar();
  }

  async function alternarAtivo(perfil: InstagramPerfil) {
    await fetch(`/api/instagram/perfis/${perfil.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !perfil.ativo }),
    });
    await carregar();
  }

  async function remover(perfil: InstagramPerfil) {
    if (!confirm(`Remover o perfil "@${perfil.username}" e todas as publicações analisadas?`)) {
      return;
    }
    await fetch(`/api/instagram/perfis/${perfil.id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Perfis do Instagram</h2>
          <p className="mt-1 text-sm text-slate-500">
            Informe o @usuário ou a URL do perfil público. As publicações recentes são coletadas
            periodicamente e as legendas passam pelas mesmas palavras-chave das rádios.
          </p>
        </div>
        <button
          type="button"
          disabled={sincronizando || !monitor?.coleta_configurada}
          onClick={() => void sincronizarAgora()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {sincronizando ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      </div>

      {monitor && !monitor.coleta_configurada && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          A coleta de publicações não está configurada no servidor. Cadastros ficam salvos, mas
          nada será coletado até a chave de acesso ser definida no ambiente.
        </p>
      )}

      {monitor?.erro && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Última sincronização falhou: {monitor.erro}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void adicionar();
          }}
          placeholder="@usuario ou https://www.instagram.com/usuario"
          className="min-w-[280px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={salvando || !entrada.trim()}
          onClick={() => void adicionar()}
          className="rounded-lg bg-fuchsia-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-800 disabled:opacity-60"
        >
          {salvando ? "Adicionando..." : "Adicionar perfil"}
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando perfis...</p>
      ) : perfis.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum perfil cadastrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Perfil</th>
                <th className="px-2 py-2">Publicações</th>
                <th className="px-2 py-2">Detecções</th>
                <th className="px-2 py-2">Última sync</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {perfis.map((perfil) => (
                <tr key={perfil.id} className="border-b border-slate-50">
                  <td className="px-2 py-3">
                    <div className="font-medium text-slate-900">{perfil.titulo}</div>
                    <a
                      href={`https://www.instagram.com/${perfil.username}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-500 hover:text-fuchsia-700"
                    >
                      instagram.com/{perfil.username}
                    </a>
                  </td>
                  <td className="px-2 py-3">{perfil.posts_total ?? 0}</td>
                  <td className="px-2 py-3">{perfil.deteccoes_total ?? 0}</td>
                  <td className="px-2 py-3 text-slate-600">
                    {formatDateTime(perfil.ultima_verificacao_em)}
                  </td>
                  <td className="px-2 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        perfil.ativo
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {perfil.ativo ? "Ativo" : "Pausado"}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void alternarAtivo(perfil)}
                      className="mr-2 text-xs text-slate-600 hover:text-slate-900"
                    >
                      {perfil.ativo ? "Pausar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remover(perfil)}
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
