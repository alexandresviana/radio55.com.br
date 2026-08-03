"use client";

import BuscasX from "@/components/BuscasX";
import XDeteccoes from "@/components/XDeteccoes";
import XPosts from "@/components/XPosts";

export default function AdminXTab() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Monitoramento do X</h2>
        <p className="text-sm text-slate-500">
          Varre posts públicos por termo ou frase no X. As menções entram no feed “O que está
          rolando?” junto com rádio, YouTube e Instagram.
        </p>
      </div>

      <BuscasX />
      <XPosts />
      <XDeteccoes />
    </>
  );
}
