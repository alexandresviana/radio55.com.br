"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";

interface PontoVeiculos {
  hora: string;
  radio: number;
  youtube: number;
  instagram: number;
  x: number;
  meta_ads: number;
  total: number;
}

interface SerieFonte {
  id: string;
  label: string;
}

interface PontoFontes {
  hora: string;
  valores: Record<string, number>;
  total: number;
}

type SerieId = "radio" | "youtube" | "instagram" | "x" | "meta_ads";

const VEICULOS: { id: SerieId; label: string; cor: string }[] = [
  { id: "radio", label: "Rádio", cor: "#047857" },
  { id: "youtube", label: "YouTube", cor: "#b91c1c" },
  { id: "instagram", label: "Instagram", cor: "#a21caf" },
  { id: "x", label: "X", cor: "#0369a1" },
  { id: "meta_ads", label: "Anúncios", cor: "#4338ca" },
];

const PALETTE_FONTES = [
  "#047857",
  "#b91c1c",
  "#a21caf",
  "#0369a1",
  "#4338ca",
  "#c2410c",
  "#0f766e",
  "#be185d",
  "#1d4ed8",
  "#854d0e",
  "#334155",
  "#7c3aed",
];

const WIDTH = 760;
const PAD = { top: 8, right: 16, bottom: 28, left: 120 };
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

function tituloJanela(janela: Janela, veiculo?: string): string {
  const base =
    janela === "7d"
      ? "Evolução nos últimos 7 dias"
      : janela === "30d"
        ? "Evolução nos últimos 30 dias"
        : "Evolução nas últimas 24 horas";
  return veiculo ? `${base} · ${veiculo}` : base;
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

function truncarLabel(label: string, max = 16): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function valorPonto(
  ponto: PontoVeiculos | PontoFontes,
  serieId: string,
  modo: "veiculos" | "fontes",
): number {
  // Defensivo: durante a troca de modo, pontos antigos podem ter o formato anterior.
  if (modo === "veiculos") {
    const v = (ponto as PontoVeiculos)[serieId as SerieId];
    return typeof v === "number" ? v : 0;
  }
  return (ponto as PontoFontes).valores?.[serieId] ?? 0;
}

export default function PanoramaEvolucao({
  termo,
  janela = "24h",
  onFonteChange,
}: {
  termo?: string;
  janela?: Janela;
  onFonteChange?: (fonte: SerieId | "todas") => void;
}) {
  const gradId = useId().replace(/:/g, "");
  const [fonteDrill, setFonteDrill] = useState<SerieId | null>(null);
  const [series, setSeries] = useState<{ id: string; label: string; cor: string }[]>(VEICULOS);
  const [pontos, setPontos] = useState<(PontoVeiculos | PontoFontes)[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const modo = fonteDrill ? "fontes" : "veiculos";
  const veiculoAtual = VEICULOS.find((v) => v.id === fonteDrill);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    setHoverIdx(null);
    const params = new URLSearchParams();
    if (termo?.trim()) params.set("termo", termo.trim());
    params.set("janela", janela);
    if (fonteDrill) params.set("fonte", fonteDrill);

    const res = await fetch(`/api/panorama/evolucao?${params}`);
    const data = (await res.json()) as {
      pontos?: (PontoVeiculos | PontoFontes)[];
      series?: SerieFonte[];
      error?: string;
    };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar gráfico");
      setPontos([]);
      setSeries(fonteDrill ? [] : VEICULOS);
    } else if (fonteDrill) {
      const corBase = VEICULOS.find((v) => v.id === fonteDrill)?.cor ?? "#334155";
      setSeries(
        (data.series ?? []).map((s, i) => ({
          id: s.id,
          label: s.label,
          cor: PALETTE_FONTES[i % PALETTE_FONTES.length] ?? corBase,
        })),
      );
      setPontos(data.pontos ?? []);
    } else {
      setSeries(VEICULOS);
      setPontos(data.pontos ?? []);
    }
    setLoading(false);
  }, [termo, janela, fonteDrill]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const maxY = useMemo(() => {
    let max = 0;
    for (const p of pontos) {
      for (const s of series) {
        max = Math.max(max, valorPonto(p, s.id, modo));
      }
    }
    return niceMax(max);
  }, [pontos, series, modo]);

  const height =
    PAD.top + Math.max(series.length, 1) * (ROW_H + ROW_GAP) - ROW_GAP + PAD.bottom;
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

  function pathSerie(id: string, row: number): string {
    if (pontos.length === 0) return "";
    return pontos
      .map((p, i) => {
        const cmd = i === 0 ? "M" : "L";
        return `${cmd} ${xAt(i).toFixed(1)} ${yInRow(row, valorPonto(p, id, modo)).toFixed(1)}`;
      })
      .join(" ");
  }

  function areaSerie(id: string, row: number): string {
    if (pontos.length === 0) return "";
    const base = rowTop(row) + ROW_H - INNER_PAD;
    const line = pathSerie(id, row);
    const lastX = xAt(pontos.length - 1);
    const firstX = xAt(0);
    return `${line} L ${lastX.toFixed(1)} ${base.toFixed(1)} L ${firstX.toFixed(1)} ${base.toFixed(1)} Z`;
  }

  function abrirFonte(id: SerieId) {
    // Limpa antes de trocar o modo: evita renderizar dados no formato antigo.
    setPontos([]);
    setSeries([]);
    setLoading(true);
    setFonteDrill(id);
    onFonteChange?.(id);
  }

  function voltarVeiculos() {
    setPontos([]);
    setSeries(VEICULOS);
    setLoading(true);
    setFonteDrill(null);
    onFonteChange?.("todas");
  }

  const hover = hoverIdx != null ? pontos[hoverIdx] : null;
  const totalPeriodo = pontos.reduce((acc, p) => acc + (p.total ?? 0), 0);
  const passoLabel = passoLabelEixo(pontos.length, janela);
  const subtitulo = fonteDrill
    ? `Menções por ${janela === "24h" ? "hora" : "dia"} em cada fonte monitorada · clique em Voltar para os veículos`
    : `Menções por ${janela === "24h" ? "hora" : "dia"} · clique no nome do veículo para ver as fontes`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {tituloJanela(janela, veiculoAtual?.label)}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {subtitulo}
            {termo?.trim() ? ` · filtro “${termo.trim()}”` : ""}.
            {!loading && totalPeriodo === 0 && series.length === 0
              ? " Nenhuma fonte monitorada."
              : !loading && totalPeriodo === 0
                ? " Sem menções no período."
                : ""}
          </p>
        </div>
        {fonteDrill && (
          <button
            type="button"
            onClick={voltarVeiculos}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ← Voltar aos veículos
          </button>
        )}
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-500">Carregando gráfico...</p>
      ) : series.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">
          Nenhuma conta/rádio monitorada neste veículo.
        </p>
      ) : (
        <div className="relative w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${height}`}
            className="h-auto w-full min-w-[560px]"
            role="img"
            aria-label={tituloJanela(janela, veiculoAtual?.label)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              {series.map((s) => (
                <linearGradient
                  key={s.id}
                  id={`${gradId}-${s.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
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

            {series.map((s, row) => {
              const top = rowTop(row);
              const grad = `${gradId}-${s.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
              const clicavel = !fonteDrill;
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
                  <path d={areaSerie(s.id, row)} fill={`url(#${grad})`} />
                  <path
                    d={pathSerie(s.id, row)}
                    fill="none"
                    stroke={s.cor}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <text
                    x={PAD.left - 10}
                    y={top + ROW_H / 2 + 4}
                    textAnchor="end"
                    className={clicavel ? "fill-slate-800" : "fill-slate-700"}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: clicavel ? "pointer" : "default",
                    }}
                  >
                    {truncarLabel(s.label, fonteDrill ? 18 : 14)}
                  </text>
                  {clicavel && (
                    <rect
                      x={0}
                      y={top}
                      width={PAD.left + plotW}
                      height={ROW_H}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onClick={() => abrirFonte(s.id as SerieId)}
                    >
                      <title>Ver fontes de {s.label}</title>
                    </rect>
                  )}
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

            {series.map((s, row) =>
              hoverIdx == null ? null : (
                <g key={`dot-${s.id}`}>
                  <circle
                    cx={xAt(hoverIdx)}
                    cy={yInRow(row, valorPonto(pontos[hoverIdx]!, s.id, modo))}
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
                    {valorPonto(pontos[hoverIdx]!, s.id, modo)}
                  </text>
                </g>
              ),
            )}
          </svg>

          {hover && (
            <div className="pointer-events-none absolute right-3 top-3 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
              <p className="mb-1 font-medium text-slate-800">
                {formatRotuloHover(hover.hora, janela)}
              </p>
              {series.map((s) => (
                <p key={s.id} className="flex items-center justify-between gap-4 text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.cor }} />
                    {truncarLabel(s.label, 20)}
                  </span>
                  <span className="font-medium text-slate-900">
                    {valorPonto(hover, s.id, modo)}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
