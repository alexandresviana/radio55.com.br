"use client";

import CanaisYouTube from "@/components/CanaisYouTube";
import YoutubePainel from "@/components/YoutubePainel";

export default function AdminYoutubeTab() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Canais do YouTube</h2>
        <p className="text-sm text-slate-500">
          Cadastre canais e acompanhe a coleta. A busca nas legendas fica na página inicial.
        </p>
      </div>

      <CanaisYouTube />
      <YoutubePainel />
    </>
  );
}
