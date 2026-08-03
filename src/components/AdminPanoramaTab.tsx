"use client";

import { useCallback, useEffect, useState } from "react";

type Fonte = "todas" | "radio" | "youtube" | "instagram";
type Janela = "24h" | "7d" | "30d";

interface ItemPanorama {
  chave: string;
  fonte: "radio" | "youtube" | "instagram";
  termo: string;
  contexto: string;
  detectado_em: string;
  titulo: string;
  subtitulo: string;
  url: string | null;
  trecho_audio: string | null;
  detalhe: string | null;
}

interface Contagens {
  total: number;
  radio: number;
  youtube: number;
  instagram: number;
}

const JANELAS: { id: Janela; label: string }[] = [
  { id: "24h", label: "24 horas" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
];

const FONTES: { id: Fonte; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "radio", label: "Rádio" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
];

function rotuloFonte(fonte: ItemPanorama["fonte"]): string {
  if (fonte === "radio") return "Rádio";
  if (fonte === "youtube") return "YouTube";
  return "Instagram";
}

function corFonte(fonte: ItemPanorama["fonte"]): string {
  if (fonte === "radio") return "bg-emerald-50 text-emerald-800";
  if (fonte === "youtube") return "bg-red-50 text-red-700";
  return "bg-fuchsia-50 text-fuchsia-800";
}

function formatQuando(iso: string): string {
  const data = new Date(iso);
  const agora = Date.now();
  const diffMin = Math.max(0, Math.floor((agora - data.getTime()) / 60000));

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPanoramaTab() {
  const [assunto, setAssunto] = useState("");
  const [assuntoAplicado, setAssuntoAplicado] = useState("");
  const [assuntos, setAssuntos] = useState<string[]>([]);
  const [janela, setJanela] = useState<Janela>("24h");
  const [fonte, setFonte] = useState<Fonte>("todas");
  const [itens, setItens] = useState<ItemPanorama[]>([]);
  const [contagens, setContagens] = useState<Contagens | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [audioAberto, setAudioAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");

    const params = new URLSearchParams();
    if (assuntoAplicado.trim()) params.set("termo", assuntoAplicado.trim());
    params.set("janela", janela);
    params.set("fonte", fonte);
    params.set("limite", "40");

    const res = await fetch(`/api/panorama?${params}`);
    const data = (await res.json()) as {
      itens?: ItemPanorama[];
      contagens?: Contagens;
      assuntos?: string[];
      error?: string;
    };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar o panorama");
      setItens([]);
      setContagens(null);
    } else {
      setItens(data.itens ?? []);
      setContagens(data.contagens ?? null);
      setAssuntos(data.assuntos ?? []);
    }

    setLoading(false);
  }, [assuntoAplicado, janela, fonte]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function aplicarAssunto(valor?: string) {
    const next = (valor ?? assunto).trim();
    setAssunto(next);
    setAssuntoAplicado(next);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">O que está rolando?</h2>
        <p className="mt-1 text-sm text-slate-500">
          Menções recentes ao candidato ou assunto nas rádios, YouTube e Instagram — para bater o
          olho e saber o que está sendo dito.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Assunto
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                list="assuntos-panorama"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") aplicarAssunto();
                }}
                placeholder="Ex.: fabio mitidieri, eleições, aracaju…"
                className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
              <datalist id="assuntos-panorama">
                {assuntos.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => aplicarAssunto()}
                className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Ver
              </button>
              {assuntoAplicado && (
                <button
                  type="button"
                  onClick={() => aplicarAssunto("")}
                  className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Limpar
                </button>
              )}
            </div>
            {assuntos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {assuntos.slice(0, 8).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => aplicarAssunto(item)}
                    className={`rounded-full px-2.5 py-1 text-xs transition ${
                      assuntoAplicado === item
                        ? "bg-emerald-700 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Período
            </label>
            <div className="flex gap-1 rounded-lg border border-slate-200 p-1">
              {JANELAS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setJanela(item.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    janela === item.id
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {contagens && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { id: "todas" as const, label: "Menções", valor: contagens.total },
              { id: "radio" as const, label: "Rádio", valor: contagens.radio },
              { id: "youtube" as const, label: "YouTube", valor: contagens.youtube },
              { id: "instagram" as const, label: "Instagram", valor: contagens.instagram },
            ] as const
          ).map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setFonte(card.id)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                fonte === card.id
                  ? "border-emerald-700 bg-emerald-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="text-2xl font-bold tabular-nums text-slate-900">{card.valor}</div>
              <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                {card.label}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FONTES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFonte(item.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              fonte === item.id
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void carregar()}
          className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-white"
        >
          Atualizar
        </button>
      </div>

      {erro && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && itens.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Carregando menções...</p>
        ) : itens.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-700">Nada rolando neste filtro</p>
            <p className="mt-1 text-sm text-slate-500">
              {assuntoAplicado
                ? `Sem menções a “${assuntoAplicado}” no período. Amplie o período ou cadastre mais fontes.`
                : "Cadastre palavras-chave e fontes nas outras abas; as menções aparecem aqui."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {itens.map((item) => (
              <li key={item.chave} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[5.5rem] shrink-0 pt-0.5 text-xs text-slate-500">
                    {formatQuando(item.detectado_em)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${corFonte(item.fonte)}`}
                      >
                        {rotuloFonte(item.fonte)}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{item.termo}</span>
                      {item.detalhe && (
                        <span className="font-mono text-[11px] text-slate-400">{item.detalhe}</span>
                      )}
                    </div>
                    <div className="text-sm text-slate-800">{item.titulo}</div>
                    <div className="text-xs text-slate-500">{item.subtitulo}</div>
                    {item.contexto && (
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        “{item.contexto}”
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {item.trecho_audio && (
                        audioAberto === item.chave ? (
                          <audio
                            controls
                            autoPlay
                            src={item.trecho_audio}
                            className="h-8 max-w-[260px]"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAudioAberto(item.chave)}
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                          >
                            Ouvir trecho
                          </button>
                        )
                      )}
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-slate-700 hover:text-slate-900"
                        >
                          Ver na origem →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
