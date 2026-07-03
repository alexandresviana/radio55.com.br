"use client";

import { useCallback, useState } from "react";
import { formatMinutagem } from "@/lib/text-normalize";
import PaginacaoLista, { POR_PAGINA_ADMIN } from "@/components/PaginacaoLista";

interface ResultadoItem {
  id: number;
  gravacao_id: number;
  inicio_segundos: number;
  texto: string;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  gravado_em: string;
  em_gravacao: boolean;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BuscaTranscricoes() {
  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<ResultadoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [buscou, setBuscou] = useState(false);

  const buscar = useCallback(
    async (opts?: { pagina?: number; termo?: string }) => {
      const paginaAtual = opts?.pagina ?? pagina;
      const termoAtual = (opts?.termo ?? termoBusca).trim();

      if (!termoAtual) {
        setErro("Digite uma palavra ou trecho para buscar.");
        return;
      }

      setLoading(true);
      setErro("");

      const params = new URLSearchParams();
      params.set("termo", termoAtual);
      params.set("limite", String(POR_PAGINA_ADMIN));
      params.set("offset", String(paginaAtual * POR_PAGINA_ADMIN));

      const res = await fetch(`/api/transcricoes/busca?${params}`);
      const data = (await res.json()) as {
        resultados?: ResultadoItem[];
        total?: number;
        error?: string;
      };

      if (!res.ok) {
        setErro(data.error ?? "Erro ao buscar nas transcrições");
        setResultados([]);
        setTotal(0);
      } else {
        setResultados(data.resultados ?? []);
        setTotal(data.total ?? 0);
        setBuscou(true);
      }

      setLoading(false);
    },
    [pagina, termoBusca],
  );

  function aplicarBusca() {
    setPagina(0);
    setTermoBusca(termo);
    void buscar({ pagina: 0, termo });
  }

  function mudarPagina(novaPagina: number) {
    setPagina(novaPagina);
    void buscar({ pagina: novaPagina });
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_ADMIN));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Buscar nas transcrições</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pesquisa livre no texto transcrito — não depende de palavras-chave cadastradas.
          O histórico completo de cada gravação fica salvo para buscas futuras.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") aplicarBusca();
          }}
          placeholder="Ex.: Milton, eleições, prefeito..."
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading}
          onClick={aplicarBusca}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {buscou && !loading && resultados.length === 0 && !erro && (
        <p className="text-sm text-slate-400">
          Nenhum trecho encontrado para “{termoBusca}” nas transcrições salvas.
        </p>
      )}

      {resultados.length > 0 && (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {total} trecho(s) com “{termoBusca}”
          </p>
          <div className="space-y-2">
            {resultados.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-800">
                    {item.radio_nome} · {item.municipio}
                  </span>
                  <span>·</span>
                  <span>{formatDateTime(item.gravado_em)}</span>
                  <span>·</span>
                  <span className="font-mono">{formatMinutagem(item.inicio_segundos)}</span>
                  {item.em_gravacao && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                      ao vivo
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">{item.arquivo}</p>
                <p className="mt-2 text-slate-700">{item.texto}</p>
                <a
                  href={`/api/gravacoes/${item.gravacao_id}/arquivo?t=${Math.floor(item.inicio_segundos)}`}
                  className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ir ao ponto no MP3
                </a>
              </div>
            ))}
          </div>
          <PaginacaoLista
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={total}
            loading={loading}
            onAnterior={() => mudarPagina(Math.max(0, pagina - 1))}
            onProxima={() => mudarPagina(Math.min(totalPaginas - 1, pagina + 1))}
          />
        </>
      )}
    </section>
  );
}
