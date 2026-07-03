"use client";

import { useState } from "react";
import AdminBuscaIATab from "@/components/AdminBuscaIATab";
import AdminRadiosTab from "@/components/AdminRadiosTab";
import AdminYoutubeTab from "@/components/AdminYoutubeTab";
import Header from "@/components/Header";
import PalavrasChave from "@/components/PalavrasChave";

type AdminTab = "radios" | "youtube" | "ia";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "radios", label: "Rádios" },
  { id: "youtube", label: "YouTube" },
  { id: "ia", label: "Busca IA" },
];

export default function AdminPage() {
  const [aba, setAba] = useState<AdminTab>("radios");

  return (
    <div className="min-h-screen bg-slate-50">
      <Header subtitle="Painel administrativo" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Administração</h1>
          <p className="text-sm text-slate-500">
            Monitore rádios ao vivo, canais do YouTube e pesquise transcrições com IA.
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
        {aba === "ia" && <AdminBuscaIATab />}
      </main>
    </div>
  );
}
