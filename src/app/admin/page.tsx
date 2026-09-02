"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminInstagramTab from "@/components/AdminInstagramTab";
import AdminMetaAdsTab from "@/components/AdminMetaAdsTab";
import AdminRadiosTab from "@/components/AdminRadiosTab";
import AdminXTab from "@/components/AdminXTab";
import AdminYoutubeTab from "@/components/AdminYoutubeTab";
import Header from "@/components/Header";
import PalavrasChave from "@/components/PalavrasChave";

type AdminTab = "assuntos" | "radios" | "youtube" | "instagram" | "x" | "meta";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "assuntos", label: "Assuntos" },
  { id: "radios", label: "Rádios" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X" },
  { id: "meta", label: "Anúncios" },
];

const ABAS = new Set<AdminTab>(TABS.map((t) => t.id));

function abaValida(valor: string | null): AdminTab {
  if (valor && ABAS.has(valor as AdminTab)) return valor as AdminTab;
  return "assuntos";
}

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [aba, setAba] = useState<AdminTab>(() => abaValida(searchParams.get("aba")));

  useEffect(() => {
    setAba(abaValida(searchParams.get("aba")));
  }, [searchParams]);

  function mudarAba(proxima: AdminTab) {
    setAba(proxima);
    const params = new URLSearchParams(searchParams.toString());
    params.set("aba", proxima);
    router.replace(`/admin?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header subtitle="Configuração das fontes" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
          <p className="text-sm text-slate-500">
            Cadastro de assuntos e fontes. Buscas e detecções ficam nas abas da página inicial.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
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

        {aba === "assuntos" && <PalavrasChave />}
        {aba === "radios" && <AdminRadiosTab />}
        {aba === "youtube" && <AdminYoutubeTab />}
        {aba === "instagram" && <AdminInstagramTab />}
        {aba === "x" && <AdminXTab />}
        {aba === "meta" && <AdminMetaAdsTab />}
      </main>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50">
          <Header subtitle="Configuração das fontes" />
          <p className="py-20 text-center text-sm text-slate-500">Carregando admin...</p>
        </div>
      }
    >
      <AdminPageInner />
    </Suspense>
  );
}
