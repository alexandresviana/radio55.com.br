"use client";

import { useMemo, useState } from "react";
import type { EmissorasData } from "@/types";

interface BuscaMunicipioProps {
  emissoras: EmissorasData;
  regiaoFiltro: string | null;
  value: string | null;
  onChange: (municipio: string) => void;
}

export default function BuscaMunicipio({
  emissoras,
  regiaoFiltro,
  value,
  onChange,
}: BuscaMunicipioProps) {
  const [q, setQ] = useState("");

  const opcoes = useMemo(() => {
    const nomes = Object.keys(emissoras).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const filtrados = nomes.filter((nome) => {
      if (regiaoFiltro && emissoras[nome]?.regiao !== regiaoFiltro) return false;
      if (!q.trim()) return true;
      return nome.toLocaleLowerCase("pt-BR").includes(q.trim().toLocaleLowerCase("pt-BR"));
    });
    return filtrados.slice(0, 12);
  }, [emissoras, regiaoFiltro, q]);

  return (
    <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
      <label className="sr-only" htmlFor="busca-municipio">
        Buscar município
      </label>
      <input
        id="busca-municipio"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar município (ex: Salvador)"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none ring-emerald-600/30 placeholder:text-slate-400 focus:ring-2"
        autoComplete="off"
      />
      {(q.trim().length > 0 || !value) && opcoes.length > 0 && q.trim().length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {opcoes.map((nome) => (
            <li key={nome}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-emerald-50"
                onClick={() => {
                  onChange(nome);
                  setQ("");
                }}
              >
                <span>{nome}</span>
                <span className="text-xs text-slate-400">
                  {emissoras[nome]?.radios.length ?? 0} rádios
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
