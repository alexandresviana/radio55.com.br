"use client";

import { useCallback, useState } from "react";
import { formatMinutagem } from "@/lib/text-normalize";

interface DeteccaoItem {
  id: number;
  gravacao_id: number;
  termo: string;
  inicio_segundos: number;
  contexto: string;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  detectado_em: string;
  em_gravacao: boolean;
  trecho_caminho: string | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function PainelDeteccoes() {
  const [deteccoes, setDeteccoes] = useState<DeteccaoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [termo, setTermo] = useState("");

  const buscar = useCallback(async () => {
    setLoading(true);
    setErro("");

    const params = new URLSearchParams();
    if (termo.trim()) params.set("termo", termo.trim());
    params.set("limite", "100");

    const res = await fetch(`/api/deteccoes?${params}`);
    const data = (await res.json()) as { deteccoes?: DeteccaoItem[]; error?: string };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao buscar detecções");
      setDeteccoes([]);
    } else {
      setDeteccoes(data.deteccoes ?? []);
    }

    setLoading(false);
  }, [termo]);

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Histórico de detecções</h2>
          <p className="mt-1 text-sm text-slate-500">
            Todas as ocorrências encontradas nas transcrições, com trecho de áudio e atalho no MP3.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void buscar()}
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
          placeholder="Filtrar por palavra"
          className="min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void buscar()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
        >
          Buscar
        </button>
      </div>

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando detecções...</p>
      ) : deteccoes.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhuma detecção encontrada. Clique em Buscar para carregar o histórico.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Detectado</th>
                <th className="px-4 py-3">Palavra</th>
                <th className="px-4 py-3">Rádio</th>
                <th className="px-4 py-3">Minutagem</th>
                <th className="px-4 py-3">Contexto</th>
                <th className="px-4 py-3">Áudio</th>
              </tr>
            </thead>
            <tbody>
              {deteccoes.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {formatDateTime(item.detectado_em)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                      {item.termo}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{item.radio_nome}</div>
                    <div className="text-xs text-slate-500">{item.municipio}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {formatMinutagem(item.inicio_segundos)}
                    {item.em_gravacao && (
                      <span className="ml-2 text-xs text-emerald-700">ao vivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-xs text-xs text-slate-600">
                    {item.contexto}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      {item.trecho_caminho ? (
                        <audio
                          controls
                          preload="none"
                          src={`/api/deteccoes/${item.id}/trecho`}
                          className="h-8 max-w-[220px]"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Trecho indisponível</span>
                      )}
                      <a
                        href={`/api/gravacoes/${item.gravacao_id}/arquivo?t=${Math.floor(item.inicio_segundos)}`}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ponto exato
                      </a>
                    </div>
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
