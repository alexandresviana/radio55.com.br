"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BuscaMunicipio from "@/components/BuscaMunicipio";
import FiltroRegiao from "@/components/FiltroRegiao";
import Header from "@/components/Header";
import MapaEstado from "@/components/MapaEstado";
import PainelRadios from "@/components/PainelRadios";
import { ESTADOS, UF_PADRAO, type Uf } from "@/lib/estados";
import { getRegioesFromData } from "@/lib/regioes";
import type { EmissorasData } from "@/types";

export default function MapaPage() {
  const [emissoras, setEmissoras] = useState<EmissorasData>({});
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState<Uf>(UF_PADRAO);
  const [municipioSelecionado, setMunicipioSelecionado] = useState<string | null>(null);
  const [regiaoFiltro, setRegiaoFiltro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/emissoras");
    setEmissoras(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const emissorasEstado = useMemo(() => {
    const filtrado: EmissorasData = {};
    for (const [nome, dados] of Object.entries(emissoras)) {
      const uf = dados.estado ?? "SE";
      if (uf === estado) filtrado[nome] = dados;
    }
    return filtrado;
  }, [emissoras, estado]);

  const regioes = useMemo(() => getRegioesFromData(emissorasEstado), [emissorasEstado]);
  const totalRadios = Object.values(emissorasEstado).reduce((sum, m) => sum + m.radios.length, 0);
  const geoUrl = ESTADOS.find((item) => item.uf === estado)?.geo ?? "/data/bahia-mun.json";
  const estadoLabel = ESTADOS.find((item) => item.uf === estado)?.label ?? estado;

  function handleEstadoChange(novoEstado: Uf) {
    setEstado(novoEstado);
    setMunicipioSelecionado(null);
    setRegiaoFiltro(null);
  }

  function handleRegiaoChange(regiao: string | null) {
    setRegiaoFiltro(regiao);
    if (municipioSelecionado && regiao) {
      const dados = emissorasEstado[municipioSelecionado];
      if (dados && dados.regiao !== regiao) setMunicipioSelecionado(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header subtitle="Mapa de emissoras" />
        <p className="py-20 text-center text-slate-500">Carregando mapa...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        subtitle={`${estadoLabel} · ${Object.keys(emissorasEstado).length} municípios · ${totalRadios} rádios`}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">Mapa de emissoras</h1>
          <p className="text-sm text-slate-500">
            Explore rádios por município e ouça ao vivo. O monitoramento fica na página inicial.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {ESTADOS.map((item) => (
              <button
                key={item.uf}
                type="button"
                onClick={() => handleEstadoChange(item.uf)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  estado === item.uf
                    ? "bg-emerald-700 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <BuscaMunicipio
            emissoras={emissorasEstado}
            regiaoFiltro={regiaoFiltro}
            value={municipioSelecionado}
            onChange={setMunicipioSelecionado}
          />

          <FiltroRegiao regioes={regioes} regiaoAtiva={regiaoFiltro} onChange={handleRegiaoChange} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <MapaEstado
              emissoras={emissoras}
              estado={estado}
              geoUrl={geoUrl}
              municipioSelecionado={municipioSelecionado}
              regiaoFiltro={regiaoFiltro}
              onSelectMunicipio={setMunicipioSelecionado}
            />
            <p className="mt-3 text-center text-xs text-slate-400">
              PJ = Programas Jornalísticos · Fonte: radios.com.br
            </p>
          </section>

          <section className="lg:sticky lg:top-6 lg:self-start">
            <PainelRadios
              municipio={municipioSelecionado}
              emissoras={emissorasEstado}
              regiaoFiltro={regiaoFiltro}
              onClose={() => setMunicipioSelecionado(null)}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
