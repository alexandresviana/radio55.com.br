"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SeloTermoDeteccao from "@/components/SeloTermoDeteccao";
import { useI18n } from "@/i18n/I18nProvider";

interface DeteccaoItem {
  id: number;
  termo: string;
  ancora_termo?: string;
  contexto: string;
  detectado_em: string;
  post_url: string;
  publicado_em: string | null;
  autor_username: string;
  busca_termo: string | null;
}

const POR_PAGINA = 20;

export default function XDeteccoes() {
  const { t, formatDateTime } = useI18n();
  const [deteccoes, setDeteccoes] = useState<DeteccaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);

  const buscar = useCallback(
    async (opts?: { reescanear?: boolean }) => {
      setLoading(true);
      setErro("");

      const params = new URLSearchParams();
      if (termoBusca.trim()) params.set("termo", termoBusca.trim());
      params.set("limite", String(POR_PAGINA));
      params.set("offset", String(pagina * POR_PAGINA));
      if (opts?.reescanear) params.set("reescanear", "1");

      const res = await fetch(`/api/x/deteccoes?${params}`);
      const data = (await res.json()) as {
        deteccoes?: DeteccaoItem[];
        total?: number;
        error?: string;
      };

      if (!res.ok) {
        setErro(data.error ?? "Erro ao buscar detecções");
        setDeteccoes([]);
        setTotal(0);
      } else {
        setDeteccoes(data.deteccoes ?? []);
        setTotal(data.total ?? 0);
      }

      setLoading(false);
    },
    [pagina, termoBusca],
  );

  const primeiraCarga = useRef(true);

  useEffect(() => {
    void buscar({ reescanear: primeiraCarga.current });
    primeiraCarga.current = false;
  }, [buscar]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("Detecções")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("Menções a palavras-chave e termos monitorados nos posts do X.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPagina(0);
                setTermoBusca(termo);
              }
            }}
            placeholder={t("Filtrar...")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              setPagina(0);
              setTermoBusca(termo);
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("Filtrar")}
          </button>
        </div>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{t(erro)}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">{t("Carregando detecções...")}</p>
      ) : deteccoes.length === 0 ? (
        <p className="text-sm text-slate-400">{t("Nenhuma detecção ainda.")}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {deteccoes.map((item) => (
            <li key={item.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <SeloTermoDeteccao
                  termo={item.termo}
                  ancora={item.ancora_termo}
                  className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800"
                />
                <span>@{item.autor_username || "?"}</span>
                <span>{formatDateTime(item.detectado_em)}</span>
              </div>
              {item.contexto && (
                <p className="mt-1 text-sm text-slate-700">“{item.contexto}”</p>
              )}
              <a
                href={item.post_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-medium text-sky-700 hover:text-sky-900"
              >
                {t("Ver post →")}
              </a>
            </li>
          ))}
        </ul>
      )}

      {total > POR_PAGINA && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            {t("Anterior")}
          </button>
          <span className="text-slate-500">
            {t("Página {pagina} de {total}", { pagina: pagina + 1, total: totalPaginas })}
          </span>
          <button
            type="button"
            disabled={pagina + 1 >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            {t("Próxima")}
          </button>
        </div>
      )}
    </section>
  );
}
