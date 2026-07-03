"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConsultaInterpretada, FonteCitada } from "@/lib/ai-busca-types";
import PaginacaoLista from "@/components/PaginacaoLista";

const EXEMPLOS = [
  "O que falaram do governador João na rádio X no dia 02 de julho entre 6 e 10 da manhã?",
  "Resuma menções a chuva nos canais do YouTube esta semana",
  "O que disseram sobre eleições na Itabaiana FM ontem?",
];

function formatFiltros(f: ConsultaInterpretada): string[] {
  const linhas: string[] = [];
  linhas.push(`Fontes: ${f.fontes.join(", ")}`);
  if (f.termos.length) linhas.push(`Termos: ${f.termos.join(", ")}`);
  if (f.radio_nome) linhas.push(`Rádio: ${f.radio_nome}`);
  if (f.municipio) linhas.push(`Município: ${f.municipio}`);
  if (f.canal_youtube) linhas.push(`Canal YouTube: ${f.canal_youtube}`);
  if (f.data) linhas.push(`Data: ${f.data}`);
  if (f.hora_de || f.hora_ate) linhas.push(`Horário: ${f.hora_de ?? "…"} – ${f.hora_ate ?? "…"}`);
  return linhas;
}

export default function AdminBuscaIATab() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [disponivel, setDisponivel] = useState<boolean | null>(null);
  const [modelo, setModelo] = useState("");
  const [porPagina, setPorPagina] = useState(20);
  const [resposta, setResposta] = useState("");
  const [interpretacao, setInterpretacao] = useState<ConsultaInterpretada | null>(null);
  const [fontes, setFontes] = useState<FonteCitada[]>([]);
  const [aviso, setAviso] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalRadio, setTotalRadio] = useState(0);
  const [totalYoutube, setTotalYoutube] = useState(0);

  useEffect(() => {
    void fetch("/api/ai/busca")
      .then((res) => res.json())
      .then((data: { disponivel?: boolean; modelo?: string; porPagina?: number }) => {
        setDisponivel(Boolean(data.disponivel));
        setModelo(data.modelo ?? "");
        if (typeof data.porPagina === "number" && data.porPagina > 0) {
          setPorPagina(data.porPagina);
        }
      })
      .catch(() => setDisponivel(false));
  }, []);

  const buscar = useCallback(
    async (opts?: { pagina?: number; novaBusca?: boolean }) => {
      const pergunta = prompt.trim();
      if (pergunta.length < 5) {
        setErro("Descreva sua pergunta com mais detalhes.");
        return;
      }

      const paginaAtual = opts?.pagina ?? pagina;
      const novaBusca = opts?.novaBusca ?? false;

      setLoading(true);
      setErro("");

      if (novaBusca) {
        setResposta("");
        setInterpretacao(null);
        setFontes([]);
        setAviso("");
        setTotal(0);
        setTotalPaginas(1);
        setTotalRadio(0);
        setTotalYoutube(0);
      }

      const res = await fetch("/api/ai/busca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: pergunta,
          pagina: paginaAtual,
          interpretacao: novaBusca ? undefined : interpretacao ?? undefined,
        }),
      });

      const data = (await res.json()) as {
        resposta?: string;
        interpretacao?: ConsultaInterpretada;
        fontes?: FonteCitada[];
        aviso?: string;
        pagina?: number;
        porPagina?: number;
        total?: number;
        totalPaginas?: number;
        totalRadio?: number;
        totalYoutube?: number;
        error?: string;
      };

      setLoading(false);

      if (!res.ok) {
        setErro(data.error ?? "Erro na busca");
        return;
      }

      setPagina(data.pagina ?? paginaAtual);
      if (typeof data.porPagina === "number") setPorPagina(data.porPagina);
      setTotal(data.total ?? 0);
      setTotalPaginas(data.totalPaginas ?? 1);
      setTotalRadio(data.totalRadio ?? 0);
      setTotalYoutube(data.totalYoutube ?? 0);
      setInterpretacao(data.interpretacao ?? null);
      setFontes(data.fontes ?? []);
      setAviso(data.aviso ?? "");

      if (paginaAtual === 0) {
        setResposta(data.resposta ?? "");
      }
    },
    [prompt, pagina, interpretacao],
  );

  function perguntar() {
    setPagina(0);
    void buscar({ pagina: 0, novaBusca: true });
  }

  function irParaPagina(novaPagina: number) {
    setPagina(novaPagina);
    void buscar({ pagina: novaPagina });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Busca com IA</h2>
        <p className="mt-1 text-sm text-slate-500">
          Faça perguntas em linguagem natural sobre transcrições das rádios e legendas do YouTube.
          {modelo && (
            <span className="ml-1 text-slate-400">Modelo: {modelo}</span>
          )}
          <span className="ml-1 text-slate-400">· {porPagina} trechos/página</span>
        </p>
      </div>

      {disponivel === false && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Configure <code className="text-xs">OPENAI_API_KEY</code> no servidor para ativar esta aba.
          Opcional: <code className="text-xs">OPENAI_MODEL</code>,{" "}
          <code className="text-xs">OPENAI_BASE_URL</code> e{" "}
          <code className="text-xs">AI_BUSCA_LIMITE</code> (trechos por página, padrão 20).
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-slate-700">Sua pergunta</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Ex.: o que falaram do governador João na rádio X no dia 02 de julho entre 6 e 10 da manhã?"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {EXEMPLOS.map((exemplo) => (
            <button
              key={exemplo}
              type="button"
              onClick={() => setPrompt(exemplo)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Exemplo
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={loading || disponivel === false}
          onClick={perguntar}
          className="mt-4 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {loading ? "Analisando transcrições..." : "Perguntar"}
        </button>

        {erro && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
        )}
      </section>

      {interpretacao && (
        <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
          <h3 className="text-sm font-semibold text-sky-900">Como entendi sua pergunta</h3>
          <p className="mt-1 text-xs text-sky-800">{interpretacao.intencao}</p>
          <ul className="mt-2 space-y-0.5 text-xs text-sky-700">
            {formatFiltros(interpretacao).map((linha) => (
              <li key={linha}>{linha}</li>
            ))}
          </ul>
        </section>
      )}

      {aviso && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{aviso}</p>
      )}

      {resposta && pagina === 0 && (
        <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Resposta</h3>
          <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {resposta}
          </div>
        </section>
      )}

      {fontes.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Fontes ({total} trecho{total !== 1 ? "s" : ""}
            {(totalRadio > 0 || totalYoutube > 0) && (
              <span className="font-normal text-slate-500">
                {" "}
                · rádio {totalRadio} · YouTube {totalYoutube}
              </span>
            )}
            )
          </h3>
          <div className="mt-3 space-y-3">
            {fontes.map((fonte) => (
              <article
                key={`${pagina}-${fonte.ref}-${fonte.url}`}
                className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono font-semibold text-slate-700">
                    {fonte.ref}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      fonte.tipo === "radio"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {fonte.tipo === "radio" ? "Rádio" : "YouTube"}
                  </span>
                  <span className="font-medium text-slate-800">{fonte.titulo}</span>
                  {fonte.momento && (
                    <>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{fonte.momento}</span>
                    </>
                  )}
                </div>
                {fonte.subtitulo && (
                  <p className="mt-0.5 text-xs text-slate-500">{fonte.subtitulo}</p>
                )}
                <p className="mt-2 text-slate-700">{fonte.texto}</p>
                <a
                  href={fonte.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline"
                >
                  {fonte.tipo === "radio" ? "Ouvir no MP3" : "Ver no YouTube"}
                </a>
              </article>
            ))}
          </div>

          <PaginacaoLista
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={total}
            loading={loading}
            onAnterior={() => irParaPagina(Math.max(0, pagina - 1))}
            onProxima={() => irParaPagina(Math.min(totalPaginas - 1, pagina + 1))}
          />
        </section>
      )}
    </div>
  );
}
