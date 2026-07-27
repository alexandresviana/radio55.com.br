"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { getRegiaoCor } from "@/lib/regioes";
import type { EmissorasData, GeoCollection } from "@/types";

interface MapaEstadoProps {
  emissoras: EmissorasData;
  estado: string;
  geoUrl: string;
  municipioSelecionado: string | null;
  regiaoFiltro: string | null;
  onSelectMunicipio: (nome: string) => void;
}

interface PathItem {
  name: string;
  d: string;
  hasRadios: boolean;
  regiao: string | null;
  radiosCount: number;
  cx: number;
  cy: number;
  isCapital: boolean;
}

export default function MapaEstado({
  emissoras,
  estado,
  geoUrl,
  municipioSelecionado,
  regiaoFiltro,
  onSelectMunicipio,
}: MapaEstadoProps) {
  const [geo, setGeo] = useState<GeoCollection | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const emissorasEstado = useMemo(() => {
    const filtrado: EmissorasData = {};
    for (const [nome, dados] of Object.entries(emissoras)) {
      const uf = dados.estado ?? "SE";
      if (uf === estado) filtrado[nome] = dados;
    }
    return filtrado;
  }, [emissoras, estado]);

  useEffect(() => {
    fetch(geoUrl)
      .then((res) => res.json())
      .then((data: GeoCollection) => setGeo(data));
  }, [geoUrl]);

  const { paths, labels, width, height } = useMemo(() => {
    if (!geo) return { paths: [] as PathItem[], labels: [] as PathItem[], width: 800, height: 600 };

    const projection = geoMercator().fitSize([800, 600], geo as GeoPermissibleObjects);
    const pathGenerator = geoPath(projection);

    const generated: PathItem[] = geo.features.map((feature) => {
      const name = feature.properties.name;
      const dados = emissorasEstado[name];
      const centroid = pathGenerator.centroid(feature as GeoPermissibleObjects);
      const regiao = dados?.regiao ?? null;
      return {
        name,
        d: pathGenerator(feature as GeoPermissibleObjects) ?? "",
        hasRadios: Boolean(dados),
        regiao,
        radiosCount: dados?.radios.length ?? 0,
        cx: centroid[0] ?? 0,
        cy: centroid[1] ?? 0,
        isCapital: Boolean(regiao?.toLowerCase().includes("capital")),
      };
    });

    // Municípios sem rádio por baixo; com rádio por cima (evita sumir na costa).
    generated.sort((a, b) => Number(a.hasRadios) - Number(b.hasRadios));

    const capital = generated.filter((p) => p.isCapital && p.hasRadios);
    const topPorRadios = [...generated]
      .filter((p) => p.hasRadios && !p.isCapital)
      .sort((a, b) => b.radiosCount - a.radiosCount)
      .slice(0, estado === "BA" ? 6 : 3);

    const labelNames = new Set([
      ...capital.map((p) => p.name),
      ...topPorRadios.map((p) => p.name),
    ]);
    if (municipioSelecionado) labelNames.add(municipioSelecionado);

    const labels = generated.filter((p) => labelNames.has(p.name) && p.hasRadios);

    return { paths: generated, labels, width: 800, height: 600 };
  }, [geo, emissorasEstado, estado, municipioSelecionado]);

  function getFill(
    hasRadios: boolean,
    regiao: string | null,
  ): string {
    const inFilter = !regiaoFiltro || (hasRadios && regiao === regiaoFiltro);

    if (!inFilter) return "#f1f5f9";

    if (!hasRadios) {
      return "#e2e8f0";
    }

    return getRegiaoCor(regiao ?? estado);
  }

  if (!geo) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center rounded-2xl bg-slate-100">
        <p className="text-slate-500">Carregando mapa...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-emerald-50/30 to-amber-50/20 p-4 shadow-sm">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto h-auto w-full max-w-4xl"
        role="img"
        aria-label={`Mapa interativo dos municípios — ${estado}`}
      >
        {paths.map(({ name, d, hasRadios, regiao, isCapital }) => {
          const isSelected = municipioSelecionado === name;
          const isHovered = hovered === name;
          const inFilter = !regiaoFiltro || (hasRadios && regiao === regiaoFiltro);

          return (
            <path
              key={name}
              d={d}
              fill={getFill(hasRadios, regiao)}
              stroke={isSelected || isCapital ? "#0f172a" : "#ffffff"}
              strokeWidth={isSelected ? 2.5 : isCapital ? 1.8 : 1}
              opacity={inFilter ? 1 : 0.35}
              className="cursor-pointer transition-all duration-150"
              onClick={() => onSelectMunicipio(name)}
              onMouseEnter={() => setHovered(name)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{name}</title>
            </path>
          );
        })}

        {labels.map(({ name, cx, cy, isCapital, radiosCount }) => {
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
          const isSelected = municipioSelecionado === name;
          return (
            <g
              key={`label-${name}`}
              className="pointer-events-none"
              opacity={regiaoFiltro && !isSelected ? 0.85 : 1}
            >
              {(isCapital || isSelected) && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={isCapital ? 5 : 3.5}
                  fill="#0f172a"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              )}
              <text
                x={cx}
                y={cy + (isCapital || isSelected ? 16 : 0)}
                textAnchor="middle"
                className="fill-slate-900"
                style={{
                  fontSize: isCapital ? 13 : 11,
                  fontWeight: isCapital || isSelected ? 700 : 600,
                  paintOrder: "stroke",
                  stroke: "rgba(255,255,255,0.9)",
                  strokeWidth: 3,
                }}
              >
                {name}
                {isCapital ? ` · ${radiosCount}` : ""}
              </text>
            </g>
          );
        })}
      </svg>

      {(hovered || municipioSelecionado) && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-slate-900/85 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur">
          {municipioSelecionado ?? hovered}
          {emissorasEstado[municipioSelecionado ?? hovered ?? ""] && (
            <span className="ml-2 text-emerald-300">
              · {emissorasEstado[municipioSelecionado ?? hovered ?? ""]?.regiao}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
