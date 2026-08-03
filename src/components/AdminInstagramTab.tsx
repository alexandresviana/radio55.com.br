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
          Acompanhe perfis e veja o status da coleta por termo. Os assuntos (o que detectar em
          todas as mídias) ficam na aba Assuntos — marque “Coletar IG” para puxar posts por
          hashtag.
        </p>
      </div>

      <BuscasInstagram />
      <PerfisInstagram />
      <InstagramPosts />
      <InstagramDeteccoes />
    </>
  );
}
