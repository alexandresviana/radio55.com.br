"use client";

import CanaisYouTube from "@/components/CanaisYouTube";
import YoutubeDeteccoes from "@/components/YoutubeDeteccoes";
import YoutubePainel from "@/components/YoutubePainel";

export default function AdminYoutubeTab() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Canais do YouTube</h2>
        <p className="text-sm text-slate-500">
          Monitora legendas dos vídeos publicados e aplica as mesmas palavras-chave das rádios.
        </p>
      </div>

      <CanaisYouTube />
      <YoutubePainel />
      <YoutubeDeteccoes />
    </>
  );
}
