"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface MetaAdsBusca {
  id: number;
  termo: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  anuncios_total?: number;
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

export default function BuscasMetaAds() {
  const [buscas, setBuscas] = useState<MetaAdsBusca[]>([]);
  const [monitor, setMonitor] = useState<MonitorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const [resBuscas, resStatus] = await Promise.all([
      fetch("/api/meta-ads/buscas"),
      fetch("/api/meta-ads/status"),
    ]);

    const dataBuscas = (await resBuscas.json()) as {
      buscas?: MetaAdsBusca[];
      error?: string;
    };
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

  async function sincronizarAgora() {
    setSincronizando(true);
    setErro("");
    const res = await fetch("/api/meta-ads/status", { method: "POST" });
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

  const ativas = buscas.filter((b) => b.ativo);

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Coleta por termo</h2>
          <p className="mt-1 text-sm text-slate-500">
            Termos com “Coletar Ads” ativos na aba Assuntos. Busca na Biblioteca de Anúncios (Brasil).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin?aba=assuntos"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Gerenciar assuntos
          </Link>
          <button
            type="button"
            disabled={sincronizando || !monitor?.coleta_configurada}
            onClick={() => void sincronizarAgora()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {sincronizando || monitor?.sincronizando ? "Sincronizando..." : "Sincronizar agora"}
          </button>
        </div>
      </div>

      {monitor && (
        <p className="mb-4 text-xs text-slate-500">
          {monitor.coleta_configurada
            ? `Monitor ${monitor.ativo ? "ativo" : "inativo"} · intervalo ${monitor.intervalo_minutos} min · última sync ${formatDateTime(monitor.ultima_sincronizacao)}`
            : "Coleta não configurada no servidor."}
          {monitor.erro ? ` · ${monitor.erro}` : ""}
        </p>
      )}

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : ativas.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nenhum termo com coleta de Ads. Em Assuntos, marque “Coletar Ads” no assunto desejado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Termo</th>
                <th className="px-2 py-2">Anúncios</th>
                <th className="px-2 py-2">Detecções</th>
                <th className="px-2 py-2">Última varredura</th>
              </tr>
            </thead>
            <tbody>
              {ativas.map((busca) => (
                <tr key={busca.id} className="border-b border-slate-50">
                  <td className="px-2 py-3 font-medium text-slate-900">{busca.termo}</td>
                  <td className="px-2 py-3">{busca.anuncios_total ?? 0}</td>
                  <td className="px-2 py-3">{busca.deteccoes_total ?? 0}</td>
                  <td className="px-2 py-3 text-slate-600">
                    {formatDateTime(busca.ultima_verificacao_em)}
                    {busca.ultimo_erro && (
                      <p className="text-xs text-amber-700">{busca.ultimo_erro}</p>
                    )}
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
