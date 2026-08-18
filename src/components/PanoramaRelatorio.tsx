"use client";

import { useCallback, useEffect, useState } from "react";
import type { RelatorioPanorama, SentimentoRelatorio } from "@/lib/ai-relatorio";
import type { FontePanorama, JanelaPanorama } from "@/lib/panorama-db";

function rotuloFonte(fonte: FontePanorama): string {
  if (fonte === "radio") return "Rádio";
  if (fonte === "youtube") return "YouTube";
  if (fonte === "instagram") return "Instagram";
  if (fonte === "meta_ads") return "Anúncios";
  return "X";
}

function rotuloSentimento(valor: SentimentoRelatorio): string {
  if (valor === "positivo") return "Positivo";
  if (valor === "negativo") return "Negativo";
  if (valor === "misto") return "Misto";
  return "Neutro";
}

function classeSentimento(valor: SentimentoRelatorio): string {
  if (valor === "positivo") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (valor === "negativo") return "bg-rose-50 text-rose-800 ring-rose-200";
  if (valor === "misto") return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function formatQuando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PanoramaRelatorio({
  janela,
  fonte,
  termo,
}: {
  janela: JanelaPanorama;
  fonte: FontePanorama | "todas";
  termo: string;
}) {
  const [relatorio, setRelatorio] = useState<RelatorioPanorama | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setErro("");

      const params = new URLSearchParams();
      params.set("janela", janela);
      params.set("fonte", fonte);
      if (termo.trim()) params.set("termo", termo.trim());
      if (refresh) params.set("refresh", "1");

      const res = await fetch(`/api/panorama/relatorio?${params}`);
      const data = (await res.json().catch(() => ({
        error: `Servidor demorou a responder (HTTP ${res.status}).`,
      }))) as { relatorio?: RelatorioPanorama; error?: string };

      if (!res.ok || !data.relatorio) {
        setErro(data.error ?? "Não foi possível montar o relatório");
        setRelatorio(null);
      } else {
        setRelatorio(data.relatorio);
      }

      setLoading(false);
    },
    [janela, fonte, termo],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (loading && !relatorio) {
    return (
      <section className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-3 w-28 rounded bg-slate-100" />
        <div className="mt-3 h-6 w-3/4 rounded bg-slate-100" />
        <div className="mt-3 h-16 rounded bg-slate-50" />
      </section>
    );
  }

  if (erro) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        {erro}
      </section>
    );
  }

  if (!relatorio) return null;

  const { sentimentos } = relatorio;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 px-5 py-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200/80">
              Relatório IA
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-snug">{relatorio.titulo}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${classeSentimento(
                relatorio.sentimento_geral,
              )}`}
            >
              {rotuloSentimento(relatorio.sentimento_geral)}
            </span>
            <button
              type="button"
              onClick={() => void carregar(true)}
              disabled={loading}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium text-emerald-100 ring-1 ring-white/20 hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
        </div>
        {relatorio.tom && (
          <p className="mt-2 text-sm text-emerald-100/80">{relatorio.tom}</p>
        )}
      </div>

      <div className="space-y-5 p-5">
        <p className="text-sm leading-relaxed text-slate-700">{relatorio.resumo}</p>

        {relatorio.total > 0 && (
          <div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="bg-emerald-500"
                style={{ width: `${sentimentos.positivo}%` }}
                title={`Positivo ${sentimentos.positivo}%`}
              />
              <div
                className="bg-slate-400"
                style={{ width: `${sentimentos.neutro}%` }}
                title={`Neutro ${sentimentos.neutro}%`}
              />
              <div
                className="bg-rose-500"
                style={{ width: `${sentimentos.negativo}%` }}
                title={`Negativo ${sentimentos.negativo}%`}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>
                <span className="font-semibold text-emerald-700">{sentimentos.positivo}%</span> positivo
              </span>
              <span>
                <span className="font-semibold text-slate-600">{sentimentos.neutro}%</span> neutro
              </span>
              <span>
                <span className="font-semibold text-rose-700">{sentimentos.negativo}%</span> negativo
              </span>
              <span className="ml-auto tabular-nums">{relatorio.total} menções</span>
            </div>
          </div>
        )}

        {relatorio.assuntos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {relatorio.assuntos.map((assunto) => (
              <div
                key={assunto.termo}
                className="max-w-full rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200"
                title={assunto.leitura}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{assunto.termo}</span>
                  <span className="tabular-nums text-xs text-slate-500">{assunto.mencoes}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${classeSentimento(
                      assunto.sentimento,
                    )}`}
                  >
                    {rotuloSentimento(assunto.sentimento)}
                  </span>
                </div>
                {assunto.leitura && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{assunto.leitura}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {relatorio.destaques.length > 0 && (
          <ul className="space-y-1.5 text-sm text-slate-700">
            {relatorio.destaques.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {relatorio.alertas.length > 0 && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              Atenção
            </p>
            <ul className="mt-1 space-y-1 text-sm text-amber-950">
              {relatorio.alertas.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {relatorio.por_fonte.length > 0 && (
          <p className="text-xs text-slate-400">
            {relatorio.por_fonte
              .map((item) => `${rotuloFonte(item.fonte)} ${item.mencoes}`)
              .join(" · ")}
            <span className="mx-2">·</span>
            Gerado {formatQuando(relatorio.gerado_em)}
            {relatorio.ia ? "" : " · sem IA"}
          </p>
        )}

        {relatorio.aviso && (
          <p className="text-xs text-slate-500">{relatorio.aviso}</p>
        )}
      </div>
    </section>
  );
}
