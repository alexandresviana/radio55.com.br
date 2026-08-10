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

const WIDTH = 760;
const PAD = { top: 8, right: 16, bottom: 28, left: 88 };
const ROW_H = 52;
const ROW_GAP = 6;
const INNER_PAD = 6;

type Janela = "24h" | "7d" | "30d";

function formatRotuloEixo(iso: string, janela: Janela): string {
  const data = new Date(iso);
  if (janela === "24h") {
    return data.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatRotuloHover(iso: string, janela: Janela): string {
  const data = new Date(iso);
  if (janela === "24h") {
    return data.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return data.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function tituloJanela(janela: Janela): string {
  if (janela === "7d") return "Evolução nos últimos 7 dias";
  if (janela === "30d") return "Evolução nos últimos 30 dias";
  return "Evolução nas últimas 24 horas";
}

function subtituloJanela(janela: Janela): string {
  if (janela === "24h") return "Menções por hora em cada veículo";
  return "Menções por dia em cada veículo";
}

function passoLabelEixo(total: number, janela: Janela): number {
  if (janela === "24h") return 3;
  if (janela === "7d") return 1;
  if (total <= 15) return 2;
  return 5;
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
  const gradId = useId().replace(/:/g, "");
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

  const maxY = useMemo(() => {
    let max = 0;
    for (const p of pontos) {
      for (const s of SERIES) max = Math.max(max, p[s.id]);
    }
    return niceMax(max);
  }, [pontos]);

  const height = PAD.top + SERIES.length * (ROW_H + ROW_GAP) - ROW_GAP + PAD.bottom;
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotTop = PAD.top;
  const plotBottom = height - PAD.bottom;

  function xAt(i: number): number {
    if (pontos.length <= 1) return PAD.left + plotW / 2;
    return PAD.left + (i / (pontos.length - 1)) * plotW;
  }

  function rowTop(row: number): number {
    return PAD.top + row * (ROW_H + ROW_GAP);
  }

  function yInRow(row: number, valor: number): number {
    const top = rowTop(row) + INNER_PAD;
    const h = ROW_H - INNER_PAD * 2;
    return top + h - (valor / maxY) * h;
  }

  function pathSerie(id: SerieId, row: number): string {
    if (pontos.length === 0) return "";
    return pontos
      .map((p, i) => {
        const cmd = i === 0 ? "M" : "L";
        return `${cmd} ${xAt(i).toFixed(1)} ${yInRow(row, p[id]).toFixed(1)}`;
      })
      .join(" ");
  }

  function areaSerie(id: SerieId, row: number): string {
    if (pontos.length === 0) return "";
    const base = rowTop(row) + ROW_H - INNER_PAD;
    const line = pontos
      .map((p, i) => {
        const cmd = i === 0 ? "M" : "L";
        return `${cmd} ${xAt(i).toFixed(1)} ${yInRow(row, p[id]).toFixed(1)}`;
      })
      .join(" ");
    const lastX = xAt(pontos.length - 1);
    const firstX = xAt(0);
    return `${line} L ${lastX.toFixed(1)} ${base.toFixed(1)} L ${firstX.toFixed(1)} ${base.toFixed(1)} Z`;
  }

  const hover = hoverIdx != null ? pontos[hoverIdx] : null;
  const totalPeriodo = pontos.reduce((acc, p) => acc + p.total, 0);
  const passoLabel = passoLabelEixo(pontos.length, janela);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{tituloJanela(janela)}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {subtituloJanela(janela)}
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
            viewBox={`0 0 ${WIDTH} ${height}`}
            className="h-auto w-full min-w-[560px]"
            role="img"
            aria-label={tituloJanela(janela)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              {SERIES.map((s) => (
                <linearGradient
                  key={s.id}
                  id={`${gradId}-${s.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={s.cor} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={s.cor} stopOpacity="0.02" />
                </linearGradient>
              ))}
            </defs>

            {SERIES.map((s, row) => {
              const top = rowTop(row);
              return (
                <g key={s.id}>
                  <rect
                    x={PAD.left}
                    y={top}
                    width={plotW}
                    height={ROW_H}
                    fill="#f8fafc"
                    rx="6"
                  />
                  <line
                    x1={PAD.left}
                    x2={PAD.left + plotW}
                    y1={top + ROW_H - INNER_PAD}
                    y2={top + ROW_H - INNER_PAD}
                    stroke="#e2e8f0"
                  />
                  <text
                    x={PAD.left - 10}
                    y={top + ROW_H / 2 + 4}
                    textAnchor="end"
                    className="fill-slate-700"
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    {s.label}
                  </text>
                  <path d={areaSerie(s.id, row)} fill={`url(#${gradId}-${s.id})`} />
                  <path
                    d={pathSerie(s.id, row)}
                    fill="none"
                    stroke={s.cor}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {pontos.map((p, i) => {
              if (i % passoLabel !== 0 && i !== pontos.length - 1) return null;
              return (
                <text
                  key={p.hora}
                  x={xAt(i)}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-slate-400"
                  style={{ fontSize: 10 }}
                >
                  {formatRotuloEixo(p.hora, janela)}
                </text>
              );
            })}

            {pontos.map((_, i) => (
              <rect
                key={`hit-${i}`}
                x={xAt(i) - plotW / Math.max(pontos.length, 1) / 2}
                y={plotTop}
                width={Math.max(plotW / Math.max(pontos.length, 1), 8)}
                height={plotBottom - plotTop}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            ))}

            {hoverIdx != null && (
              <line
                x1={xAt(hoverIdx)}
                x2={xAt(hoverIdx)}
                y1={plotTop}
                y2={plotBottom}
                stroke="#94a3b8"
                strokeDasharray="4 3"
              />
            )}

            {SERIES.map((s, row) =>
              hoverIdx == null ? null : (
                <g key={`dot-${s.id}`}>
                  <circle
                    cx={xAt(hoverIdx)}
                    cy={yInRow(row, pontos[hoverIdx]![s.id])}
                    r="3.5"
                    fill={s.cor}
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                  <text
                    x={PAD.left + plotW - 4}
                    y={rowTop(row) + 14}
                    textAnchor="end"
                    className="fill-slate-500"
                    style={{ fontSize: 10 }}
                  >
                    {pontos[hoverIdx]![s.id]}
                  </text>
                </g>
              ),
            )}
          </svg>

          {hover && (
            <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
              <p className="mb-1 font-medium text-slate-800">
                {formatRotuloHover(hover.hora, janela)}
              </p>
              {SERIES.map((s) => (
                <p key={s.id} className="flex items-center justify-between gap-4 text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.cor }} />
                    {s.label}
                  </span>
                  <span className="font-medium text-slate-900">{hover[s.id]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
