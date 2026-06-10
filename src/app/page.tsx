"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FiltroRegiao from "@/components/FiltroRegiao";
import Header from "@/components/Header";
import MapaSergipe from "@/components/MapaSergipe";
import PainelRadios from "@/components/PainelRadios";
import { getRegioesFromData } from "@/lib/regioes";
import type { EmissorasData } from "@/types";

export default function Home() {
  const [emissoras, setEmissoras] = useState<EmissorasData>({});
  const [loading, setLoading] = useState(true);
  const [municipioSelecionado, setMunicipioSelecionado] = useState<string | null>(null);
  const [regiaoFiltro, setRegiaoFiltro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/emissoras");
    setEmissoras(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const regioes = useMemo(() => getRegioesFromData(emissoras), [emissoras]);
  const totalRadios = Object.values(emissoras).reduce((sum, m) => sum + m.radios.length, 0);

  function handleRegiaoChange(regiao: string | null) {
    setRegiaoFiltro(regiao);
    if (municipioSelecionado && regiao) {
      const dados = emissoras[municipioSelecionado];
      if (dados && dados.regiao !== regiao) setMunicipioSelecionado(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <p className="py-20 text-center text-slate-500">Carregando mapa...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        subtitle={`${Object.keys(emissoras).length} municípios · ${totalRadios} rádios cadastradas`}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <FiltroRegiao
            regioes={regioes}
            regiaoAtiva={regiaoFiltro}
            onChange={handleRegiaoChange}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <MapaSergipe
              emissoras={emissoras}
              municipioSelecionado={municipioSelecionado}
              regiaoFiltro={regiaoFiltro}
              onSelectMunicipio={setMunicipioSelecionado}
            />
            <p className="mt-3 text-center text-xs text-slate-400">
              PJ = Programas Jornalísticos · Fonte: levantamento Rádio 55
            </p>
          </section>

          <section className="lg:sticky lg:top-6 lg:self-start">
            <PainelRadios
              municipio={municipioSelecionado}
              emissoras={emissoras}
              regiaoFiltro={regiaoFiltro}
              onClose={() => setMunicipioSelecionado(null)}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
