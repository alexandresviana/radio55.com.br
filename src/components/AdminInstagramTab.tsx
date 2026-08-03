"use client";

import BuscasInstagram from "@/components/BuscasInstagram";
import InstagramDeteccoes from "@/components/InstagramDeteccoes";
import InstagramPosts from "@/components/InstagramPosts";
import PerfisInstagram from "@/components/PerfisInstagram";

export default function AdminInstagramTab() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Monitoramento do Instagram</h2>
        <p className="text-sm text-slate-500">
          Varre publicações públicas por termo (hashtag) em todo o Instagram e, opcionalmente,
          acompanha perfis específicos. As legendas passam pelas mesmas palavras-chave das rádios.
        </p>
      </div>

      <BuscasInstagram />
      <PerfisInstagram />
      <InstagramPosts />
      <InstagramDeteccoes />
    </>
  );
}
