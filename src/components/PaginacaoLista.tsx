"use client";

interface PaginacaoListaProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  loading?: boolean;
  onAnterior: () => void;
  onProxima: () => void;
}

export const POR_PAGINA_ADMIN = 5;

export default function PaginacaoLista({
  pagina,
  totalPaginas,
  total,
  loading = false,
  onAnterior,
  onProxima,
}: PaginacaoListaProps) {
  if (totalPaginas <= 1) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-500">
        {total} item(ns) · página {pagina + 1} de {totalPaginas}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pagina === 0 || loading}
          onClick={onAnterior}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={pagina >= totalPaginas - 1 || loading}
          onClick={onProxima}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
