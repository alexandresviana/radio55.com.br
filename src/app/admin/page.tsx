"use client";

import { useState } from "react";
import AdminBuscaIATab from "@/components/AdminBuscaIATab";
import AdminInstagramTab from "@/components/AdminInstagramTab";
import AdminRadiosTab from "@/components/AdminRadiosTab";
import AdminYoutubeTab from "@/components/AdminYoutubeTab";
import Header from "@/components/Header";
import PalavrasChave from "@/components/PalavrasChave";

type AdminTab = "radios" | "youtube" | "instagram" | "ia";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "radios", label: "Rádios" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
  { id: "ia", label: "Busca IA" },
];

export default function AdminPage() {
  const [aba, setAba] = useState<AdminTab>("radios");

  return (
    <div className="min-h-screen bg-slate-50">
      <Header subtitle="Configuração das fontes" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
          <p className="text-sm text-slate-500">
            Cadastre palavras-chave, rádios para gravar, canais e perfis. O feed fica na página
            inicial.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAba(tab.id)}
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

        {aba !== "ia" && <PalavrasChave />}

        {aba === "radios" && <AdminRadiosTab />}
        {aba === "youtube" && <AdminYoutubeTab />}
        {aba === "instagram" && <AdminInstagramTab />}
        {aba === "ia" && <AdminBuscaIATab />}
      </main>
    </div>
  );
}
