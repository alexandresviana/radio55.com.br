"use client";

import { REGIAO_CORES } from "@/lib/regioes";

interface FiltroRegiaoProps {
  regioes: string[];
  regiaoAtiva: string | null;
  onChange: (regiao: string | null) => void;
}

export default function FiltroRegiao({ regioes, regiaoAtiva, onChange }: FiltroRegiaoProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-medium text-slate-600">Região:</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
          regiaoAtiva === null
            ? "bg-slate-800 text-white shadow-sm"
            : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        }`}
      >
        Todas
      </button>
      {regioes.map((regiao) => {
        const cor = REGIAO_CORES[regiao as keyof typeof REGIAO_CORES] ?? "#64748b";
        const ativa = regiaoAtiva === regiao;
        return (
          <button
            key={regiao}
            type="button"
            onClick={() => onChange(regiao)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              ativa ? "text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
            style={ativa ? { backgroundColor: cor } : undefined}
          >
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
              style={{ backgroundColor: cor }}
            />
            {regiao}
          </button>
        );
      })}
    </div>
  );
}
