"use client";

import { REGIAO_CORES } from "@/lib/regioes";
import type { EmissorasData } from "@/types";

interface PainelRadiosProps {
  municipio: string | null;
  emissoras: EmissorasData;
  regiaoFiltro: string | null;
  onClose: () => void;
}

export default function PainelRadios({
  municipio,
  emissoras,
  regiaoFiltro,
  onClose,
}: PainelRadiosProps) {
  if (!municipio) {
    return (
      <aside className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Emissoras</h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-500">
          Clique em um município no mapa para ver as rádios cadastradas e a quantidade de
          programas jornalísticos (PJ).
        </p>
        {regiaoFiltro && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Filtro ativo: <strong>{regiaoFiltro}</strong>
          </p>
        )}
        <div className="mt-6 space-y-2 text-xs text-slate-400">
          <p>
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-400 align-middle" />{" "}
            Município com emissoras
          </p>
          <p>
            <span className="inline-block h-3 w-3 rounded-sm bg-slate-200 align-middle" /> Sem
            emissoras cadastradas
          </p>
        </div>
      </aside>
    );
  }

  const dados = emissoras[municipio];
  const regiaoCor = dados
    ? (REGIAO_CORES[dados.regiao as keyof typeof REGIAO_CORES] ?? "#059669")
    : "#64748b";

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className="flex items-start justify-between rounded-t-2xl px-6 py-4"
        style={{ background: `linear-gradient(135deg, ${regiaoCor}18, transparent)` }}
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{municipio}</h2>
          {dados && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: regiaoCor }}
              />
              {dados.regiao}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Fechar painel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!dados || dados.radios.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma emissora cadastrada para este município.
          </p>
        ) : regiaoFiltro && dados.regiao !== regiaoFiltro ? (
          <p className="text-sm text-slate-500">
            Este município não pertence à região filtrada ({regiaoFiltro}).
          </p>
        ) : (
          <ul className="space-y-3">
            {dados.radios.map((radio) => (
              <li
                key={`${municipio}-${radio.nome}`}
                className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-800">{radio.nome}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {radio.tipo === "comercial" ? "Emissora comercial" : "Emissora comunitária"}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: regiaoCor }}
                  >
                    PJ {String(radio.pj).padStart(2, "0")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dados && dados.radios.length > 0 && (!regiaoFiltro || dados.regiao === regiaoFiltro) && (
        <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400">
          {dados.radios.length} emissora{dados.radios.length !== 1 ? "s" : ""} · Total PJ:{" "}
          {dados.radios.reduce((sum, r) => sum + r.pj, 0)}
        </div>
      )}
    </aside>
  );
}
