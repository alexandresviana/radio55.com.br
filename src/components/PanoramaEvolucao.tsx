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
const HEIGHT = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 36 };

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function niceMax(valor: number): number {
  if (valor <= 0) return 4;
  const pot = 10 ** Math.floor(Math.log10(valor));
  const n = Math.ceil(valor / pot);
  if (n <= 2) return 2 * pot;
  if (n <= 5) return 5 * pot;
  return 10 * pot;
}

export default function PanoramaEvolucao({ termo }: { termo?: string }) {
  const gradId = useId();
  const [pontos, setPontos] = useState<PontoEvolucao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [ocultas, setOcultas] = useState<Set<SerieId>>(new Set());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    const params = new URLSearchParams();
    if (termo?.trim()) params.set("termo", termo.trim());

    const res = await fetch(`/api/panorama/evolucao?${params}`);
    const data = (await res.json()) as { pontos?: PontoEvolucao[]; error?: string };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar gráfico");
      setPontos([]);
    } else {
      setPontos(data.pontos ?? []);
    }
    setLoading(false);
  }, [termo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const maxY = useMemo(() => {
    let max = 0;
    for (const p of pontos) {
      for (const s of SERIES) {
        if (ocultas.has(s.id)) continue;
        max = Math.max(max, p[s.id]);
      }
    }
    return niceMax(max);
  }, [pontos, ocultas]);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  function xAt(i: number): number {
    if (pontos.length <= 1) return PAD.left + plotW / 2;
    return PAD.left + (i / (pontos.length - 1)) * plotW;
  }

  function yAt(v: number): number {
    return PAD.top + plotH - (v / maxY) * plotH;
  }

  function pathSerie(id: SerieId): string {
    if (pontos.length === 0) return "";
    return pontos
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p[id]).toFixed(1)}`)
      .join(" ");
  }

  function toggleSerie(id: SerieId) {
    setOcultas((atual) => {
      const next = new Set(atual);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hover = hoverIdx != null ? pontos[hoverIdx] : null;
  const total24h = pontos.reduce((acc, p) => acc + p.total, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Evolução nas últimas 24 horas</h3>
          <p className="mt-1 text-sm text-slate-500">
            Menções por hora em cada veículo monitorado
            {termo?.trim() ? ` · filtro “${termo.trim()}”` : ""}.
            {!loading && total24h === 0 ? " Sem menções no período." : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SERIES.map((s) => {
            const off = ocultas.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSerie(s.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  off
                    ? "border-slate-100 bg-slate-50 text-slate-400"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: off ? "#cbd5e1" : s.cor }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
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
            aria-label="Gráfico de linhas com menções por hora nas últimas 24 horas"
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

            {pontos.map((p, i) => {
              if (i % 3 !== 0 && i !== pontos.length - 1) return null;
              return (
                <text
                  key={p.hora}
                  x={xAt(i)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-slate-400"
                  style={{ fontSize: 10 }}
                >
                  {formatHora(p.hora)}
                </text>
              );
            })}

            {SERIES.map((s) =>
              ocultas.has(s.id) ? null : (
                <path
                  key={s.id}
                  d={pathSerie(s.id)}
                  fill="none"
                  stroke={s.cor}
                  strokeWidth="2.25"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ),
            )}

            {pontos.map((_, i) => (
              <rect
                key={`hit-${i}`}
                x={xAt(i) - plotW / pontos.length / 2}
                y={PAD.top}
                width={Math.max(plotW / pontos.length, 8)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            ))}

            {hoverIdx != null && (
              <line
                x1={xAt(hoverIdx)}
                x2={xAt(hoverIdx)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="#94a3b8"
                strokeDasharray="4 3"
              />
            )}

            {SERIES.map((s) =>
              ocultas.has(s.id) || hoverIdx == null ? null : (
                <circle
                  key={`dot-${s.id}`}
                  cx={xAt(hoverIdx)}
                  cy={yAt(pontos[hoverIdx]![s.id])}
                  r="3.5"
                  fill={s.cor}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              ),
            )}
          </svg>

          {hover && (
            <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
              <p className="mb-1 font-medium text-slate-800">{formatHora(hover.hora)}</p>
              {SERIES.filter((s) => !ocultas.has(s.id)).map((s) => (
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
