"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";

interface PontoEvolucao {
  hora: string;
  radio: number;
  youtube: number;
  instagram: number;
  x: number;
  meta_ads: number;
  total: number;
}

type SerieId = "radio" | "youtube" | "instagram" | "x" | "meta_ads";

const SERIES: { id: SerieId; label: string; cor: string }[] = [
  { id: "radio", label: "Rádio", cor: "#047857" },
  { id: "youtube", label: "YouTube", cor: "#b91c1c" },
  { id: "instagram", label: "Instagram", cor: "#a21caf" },
  { id: "x", label: "X", cor: "#0369a1" },
  { id: "meta_ads", label: "Anúncios", cor: "#4338ca" },
];

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 20, right: 20, bottom: 40, left: 40 };

type Janela = "24h" | "7d" | "30d";

function tituloJanela(janela: Janela): string {
  if (janela === "7d") return "Menções por veículo — últimos 7 dias";
  if (janela === "30d") return "Menções por veículo — últimos 30 dias";
  return "Menções por veículo — últimas 24 horas";
}

function niceMax(valor: number): number {
  if (valor <= 0) return 4;
  const pot = 10 ** Math.floor(Math.log10(valor));
  const n = Math.ceil(valor / pot);
  if (n <= 2) return 2 * pot;
  if (n <= 5) return 5 * pot;
  return 10 * pot;
}

export default function PanoramaEvolucao({
  termo,
  janela = "24h",
}: {
  termo?: string;
  janela?: Janela;
}) {
  const gradId = useId();
  const [pontos, setPontos] = useState<PontoEvolucao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    setHoverIdx(null);
    const params = new URLSearchParams();
    if (termo?.trim()) params.set("termo", termo.trim());
    params.set("janela", janela);

    const res = await fetch(`/api/panorama/evolucao?${params}`);
    const data = (await res.json()) as { pontos?: PontoEvolucao[]; error?: string };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar gráfico");
      setPontos([]);
    } else {
      setPontos(data.pontos ?? []);
    }
    setLoading(false);
  }, [termo, janela]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totais = useMemo(
    () =>
      SERIES.map((s) => ({
        ...s,
        valor: pontos.reduce((acc, p) => acc + p[s.id], 0),
      })),
    [pontos],
  );

  const maxY = useMemo(
    () => niceMax(Math.max(0, ...totais.map((t) => t.valor))),
    [totais],
  );

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const n = totais.length;

  function xAt(i: number): number {
    if (n <= 1) return PAD.left + plotW / 2;
    return PAD.left + (i / (n - 1)) * plotW;
  }

  function yAt(v: number): number {
    return PAD.top + plotH - (v / maxY) * plotH;
  }

  const pathLinha = totais
    .map((t, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(t.valor).toFixed(1)}`)
    .join(" ");

  const totalPeriodo = totais.reduce((acc, t) => acc + t.valor, 0);
  const hover = hoverIdx != null ? totais[hoverIdx] : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{tituloJanela(janela)}</h3>
        <p className="mt-1 text-sm text-slate-500">
          Total de menções por veículo no período selecionado
          {termo?.trim() ? ` · filtro “${termo.trim()}”` : ""}.
          {!loading && totalPeriodo === 0 ? " Sem menções no período." : ""}
        </p>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-500">Carregando gráfico...</p>
      ) : (
        <div className="relative w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full min-w-[520px]"
            role="img"
            aria-label={tituloJanela(janela)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              <linearGradient id={`${gradId}-bg`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#ffffff" />
              </linearGradient>
            </defs>

            <rect
              x={PAD.left}
              y={PAD.top}
              width={plotW}
              height={plotH}
              fill={`url(#${gradId}-bg)`}
              rx="6"
            />

            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = PAD.top + plotH * (1 - t);
              const valor = Math.round(maxY * t);
              return (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    x2={PAD.left + plotW}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray={t === 0 ? undefined : "3 3"}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-400"
                    style={{ fontSize: 10 }}
                  >
                    {valor}
                  </text>
                </g>
              );
            })}

            {/* Linhas verticais paralelas por veículo */}
            {totais.map((t, i) => (
              <line
                key={`v-${t.id}`}
                x1={xAt(i)}
                x2={xAt(i)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="#e2e8f0"
                strokeDasharray="2 4"
              />
            ))}

            <path
              d={pathLinha}
              fill="none"
              stroke="#0f172a"
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {totais.map((t, i) => (
              <g key={t.id}>
                <line
                  x1={xAt(i)}
                  x2={xAt(i)}
                  y1={yAt(0)}
                  y2={yAt(t.valor)}
                  stroke={t.cor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity={0.35}
                />
                <circle
                  cx={xAt(i)}
                  cy={yAt(t.valor)}
                  r={hoverIdx === i ? 6 : 5}
                  fill={t.cor}
                  stroke="#fff"
                  strokeWidth="2"
                />
                <text
                  x={xAt(i)}
                  y={yAt(t.valor) - 12}
                  textAnchor="middle"
                  className="fill-slate-700"
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  {t.valor}
                </text>
                <text
                  x={xAt(i)}
                  y={HEIGHT - 12}
                  textAnchor="middle"
                  className="fill-slate-600"
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  {t.label}
                </text>
                <rect
                  x={xAt(i) - plotW / n / 2}
                  y={PAD.top}
                  width={Math.max(plotW / n, 24)}
                  height={plotH + PAD.bottom}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                />
              </g>
            ))}
          </svg>

          {hover && (
            <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
              <p className="mb-1 inline-flex items-center gap-1.5 font-medium text-slate-800">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hover.cor }} />
                {hover.label}
              </p>
              <p className="text-slate-600">
                <span className="font-medium text-slate-900">{hover.valor}</span> menções
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
