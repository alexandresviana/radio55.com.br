"use client";

import SitesWeb from "@/components/SitesWeb";

export default function AdminWebTab() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Monitoramento da web</h2>
      </div>

      <SitesWeb />
    </>
  );
}
