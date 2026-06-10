"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { REGIAO_CORES } from "@/lib/regioes";
import type { EmissorasData, GeoCollection } from "@/types";

interface MapaSergipeProps {
  emissoras: EmissorasData;
  municipioSelecionado: string | null;
  regiaoFiltro: string | null;
  onSelectMunicipio: (nome: string) => void;
}

export default function MapaSergipe({
  emissoras,
  municipioSelecionado,
  regiaoFiltro,
  onSelectMunicipio,
}: MapaSergipeProps) {
  const [geo, setGeo] = useState<GeoCollection | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/sergipe-mun.json")
      .then((res) => res.json())
      .then((data: GeoCollection) => setGeo(data));
  }, []);

  const { paths, width, height } = useMemo(() => {
    if (!geo) return { paths: [], width: 800, height: 600 };

    const projection = geoMercator().fitSize([800, 600], geo as GeoPermissibleObjects);
    const pathGenerator = geoPath(projection);

    const generated = geo.features.map((feature) => {
      const name = feature.properties.name;
      const dados = emissoras[name];
      return {
        name,
        d: pathGenerator(feature as GeoPermissibleObjects) ?? "",
        hasRadios: Boolean(dados),
        regiao: dados?.regiao ?? null,
      };
    });

    return { paths: generated, width: 800, height: 600 };
  }, [geo, emissoras]);

  function getFill(
    hasRadios: boolean,
    regiao: string | null,
    isSelected: boolean,
    isHovered: boolean,
  ): string {
    const inFilter =
      !regiaoFiltro || (hasRadios && regiao === regiaoFiltro);

    if (!inFilter) return "#f1f5f9";

    if (!hasRadios) {
      return isSelected || isHovered ? "#cbd5e1" : "#e2e8f0";
    }

    const base =
      REGIAO_CORES[regiao as keyof typeof REGIAO_CORES] ?? "#6ee7b7";

    if (isSelected) return base;
    if (isHovered) return base;
    return `${base}99`;
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
        aria-label="Mapa interativo dos municípios de Sergipe"
      >
        {paths.map(({ name, d, hasRadios, regiao }) => {
          const isSelected = municipioSelecionado === name;
          const isHovered = hovered === name;
          const inFilter =
            !regiaoFiltro || (hasRadios && regiao === regiaoFiltro);

          return (
            <path
              key={name}
              d={d}
              fill={getFill(hasRadios, regiao, isSelected, isHovered)}
              stroke="#ffffff"
              strokeWidth={isSelected ? 2.5 : 1}
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
      </svg>

      {(hovered || municipioSelecionado) && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-slate-900/85 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur">
          {municipioSelecionado ?? hovered}
          {emissoras[municipioSelecionado ?? hovered ?? ""] && (
            <span className="ml-2 text-emerald-300">
              · {emissoras[municipioSelecionado ?? hovered ?? ""]?.regiao}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
