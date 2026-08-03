"use client";

import Link from "next/link";
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
  const [loading, setLoading] = useState(true);
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

  const ativas = buscas.filter((b) => b.ativo);

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Coleta por termo</h2>
          <p className="mt-1 text-sm text-slate-500">
            Termos com “Coletar IG” ativos na aba Assuntos. Aqui só o status da coleta.
          </p>
        </div>
        <Link
          href="/admin?aba=assuntos"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Gerenciar assuntos
        </Link>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : ativas.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nenhum termo com coleta no Instagram. Em Assuntos, marque “Coletar IG” no assunto
          desejado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Termo</th>
                <th className="px-2 py-2">Modo</th>
                <th className="px-2 py-2">Publicações</th>
                <th className="px-2 py-2">Última varredura</th>
              </tr>
            </thead>
            <tbody>
              {ativas.map((busca) => (
                <tr key={busca.id} className="border-b border-slate-50">
                  <td className="px-2 py-3 font-medium text-slate-900">
                    {ehFrase(busca.termo) ? busca.termo : `#${busca.termo}`}
                  </td>
                  <td className="px-2 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {ehFrase(busca.termo) ? "Só detecção em posts coletados" : "Hashtag"}
                    </span>
                  </td>
                  <td className="px-2 py-3">{busca.posts_total ?? 0}</td>
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
