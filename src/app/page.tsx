"use client";

import Header from "@/components/Header";
import Panorama from "@/components/Panorama";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header subtitle="Monitoramento de mídia regional" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Panorama />
      </main>
    </div>
  );
}
