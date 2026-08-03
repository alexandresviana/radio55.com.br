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
          Status da coleta e posts do X. Cadastre o assunto na aba Assuntos e marque “Coletar X”
          para buscar posts novos; a detecção do termo vale em todas as mídias.
        </p>
      </div>

      <BuscasX />
      <XPosts />
      <XDeteccoes />
    </>
  );
}
