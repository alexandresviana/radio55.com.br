"use client";

import BuscasX from "@/components/BuscasX";

export default function AdminXTab() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Monitoramento do X</h2>
        <p className="text-sm text-slate-500">
          Status da coleta. Cadastre o assunto na aba Assuntos e marque “Coletar X”. Posts e
          detecções ficam na página inicial.
        </p>
      </div>

      <BuscasX />
    </>
  );
}
