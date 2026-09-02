"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminBuscaIATab from "@/components/AdminBuscaIATab";
import BuscaTranscricoes from "@/components/BuscaTranscricoes";
import GravacoesArquivos from "@/components/GravacoesArquivos";
import InstagramDeteccoes from "@/components/InstagramDeteccoes";
import InstagramPosts from "@/components/InstagramPosts";
import MetaAdsAnuncios from "@/components/MetaAdsAnuncios";
import MetaAdsDeteccoes from "@/components/MetaAdsDeteccoes";
import PainelDeteccoes from "@/components/PainelDeteccoes";
import Panorama from "@/components/Panorama";
import XDeteccoes from "@/components/XDeteccoes";
import XPosts from "@/components/XPosts";
import YoutubeBuscaTranscricoes from "@/components/YoutubeBuscaTranscricoes";
import YoutubeDeteccoes from "@/components/YoutubeDeteccoes";

type HomeTab = "panorama" | "radio" | "youtube" | "instagram" | "x" | "meta" | "ia";

const TABS: { id: HomeTab; label: string }[] = [
  { id: "panorama", label: "Panorama" },
  { id: "radio", label: "Rádio" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X" },
  { id: "meta", label: "Anúncios" },
  { id: "ia", label: "Busca IA" },
];

const ABAS = new Set<HomeTab>(TABS.map((tab) => tab.id));

function abaValida(valor: string | null): HomeTab {
  if (valor && ABAS.has(valor as HomeTab)) return valor as HomeTab;
  return "panorama";
}

export default function HomeAbas() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [aba, setAba] = useState<HomeTab>(() => abaValida(searchParams.get("aba")));

  useEffect(() => {
    setAba(abaValida(searchParams.get("aba")));
  }, [searchParams]);

  function mudarAba(proxima: HomeTab) {
    setAba(proxima);
    const params = new URLSearchParams(searchParams.toString());
    if (proxima === "panorama") params.delete("aba");
    else params.set("aba", proxima);
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/", { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => mudarAba(tab.id)}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
              aba === tab.id
                ? "border-b-2 border-emerald-700 bg-white text-emerald-800"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {aba === "panorama" && <Panorama />}

      {aba === "radio" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Busca nas rádios</h2>
            <p className="text-sm text-slate-500">
              Transcrições, detecções e arquivos — o MP3 antigo sai do disco após 24h, mas a busca
              e a reprodução seguem pelo armazenamento.
            </p>
          </div>
          <BuscaTranscricoes />
          <PainelDeteccoes />
          <GravacoesArquivos />
        </div>
      )}

      {aba === "youtube" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Busca no YouTube</h2>
            <p className="text-sm text-slate-500">
              Pesquise nas legendas e veja as detecções dos canais monitorados.
            </p>
          </div>
          <YoutubeBuscaTranscricoes />
          <YoutubeDeteccoes />
        </div>
      )}

      {aba === "instagram" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Instagram</h2>
            <p className="text-sm text-slate-500">
              Publicações coletadas e menções aos assuntos monitorados.
            </p>
          </div>
          <InstagramPosts />
          <InstagramDeteccoes />
        </div>
      )}

      {aba === "x" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">X</h2>
            <p className="text-sm text-slate-500">Posts coletados e detecções dos termos monitorados.</p>
          </div>
          <XPosts />
          <XDeteccoes />
        </div>
      )}

      {aba === "meta" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Anúncios</h2>
            <p className="text-sm text-slate-500">
              Biblioteca de anúncios e detecções dos assuntos monitorados.
            </p>
          </div>
          <MetaAdsAnuncios />
          <MetaAdsDeteccoes />
        </div>
      )}

      {aba === "ia" && <AdminBuscaIATab />}
    </div>
  );
}
