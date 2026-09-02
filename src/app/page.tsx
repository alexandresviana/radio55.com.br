"use client";

import { Suspense } from "react";
import Header from "@/components/Header";
import HomeAbas from "@/components/HomeAbas";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header subtitle="Monitoramento de mídia regional" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Suspense fallback={<p className="py-16 text-center text-sm text-slate-500">Carregando...</p>}>
          <HomeAbas />
        </Suspense>
      </main>
    </div>
  );
}
