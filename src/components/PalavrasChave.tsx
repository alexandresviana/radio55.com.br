"use client";

import { useCallback, useEffect, useState } from "react";

interface PalavraChave {
  id: number;
  termo: string;
  ativo: boolean;
  coletar_instagram: boolean;
  coletar_x: boolean;
  coletar_meta_ads: boolean;
}

export default function PalavrasChave() {
  const [palavras, setPalavras] = useState<PalavraChave[]>([]);
  const [novoTermo, setNovoTermo] = useState("");
  const [coletarIg, setColetarIg] = useState(false);
  const [coletarX, setColetarX] = useState(false);
  const [coletarMetaAds, setColetarMetaAds] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/palavras-chave");
    const data = (await res.json()) as { palavras?: PalavraChave[]; error?: string };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar assuntos");
      setPalavras([]);
    } else {
      setErro("");
      setPalavras(data.palavras ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function adicionar() {
    const termo = novoTermo.trim();
    if (!termo) return;

    setSalvando(true);
    setErro("");
    const res = await fetch("/api/palavras-chave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termo,
        coletarInstagram: coletarIg,
        coletarX: coletarX,
        coletarMetaAds: coletarMetaAds,
      }),
    });
    setSalvando(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErro(data.error ?? "Erro ao adicionar assunto");
      return;
    }

    setNovoTermo("");
    await carregar();
  }

  async function patch(
    id: number,
    body: {
      ativo?: boolean;
      coletarInstagram?: boolean;
      coletarX?: boolean;
      coletarMetaAds?: boolean;
    },
  ) {
    setErro("");
    const res = await fetch(`/api/palavras-chave/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErro(data.error ?? "Erro ao atualizar");
    }
    await carregar();
  }

  async function remover(id: number) {
    if (!confirm("Remover este assunto? As coletas ligadas a ele serão pausadas.")) return;
    await fetch(`/api/palavras-chave/${id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Assuntos monitorados</h2>
      <p className="mt-1 text-sm text-slate-500">
        Cadastre uma vez — o sistema procura o termo em <strong>rádio</strong>,{" "}
        <strong>YouTube</strong>, <strong>Instagram</strong>, <strong>X</strong> e{" "}
        <strong>anúncios</strong> no conteúdo já coletado. Marque as opções abaixo se também quiser{" "}
        <em>buscar conteúdo novo</em> nessas fontes.
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={novoTermo}
            onChange={(e) => setNovoTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void adicionar();
            }}
            placeholder="Ex.: governador, deputado federal, presidente, eleições"
            className="min-w-[260px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={salvando || !novoTermo.trim()}
            onClick={() => void adicionar()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Adicionar"}
          </button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={coletarIg}
              onChange={(e) => setColetarIg(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700"
            />
            Também coletar posts no Instagram
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={coletarX}
              onChange={(e) => setColetarX(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700"
            />
            Também coletar posts no X
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={coletarMetaAds}
              onChange={(e) => setColetarMetaAds(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700"
            />
            Também coletar anúncios (Biblioteca Meta)
          </label>
        </div>
        <p className="text-xs text-slate-400">
          No Instagram, uma palavra vira busca por hashtag; frases só batem em legendas/comentários
          já coletados (perfis + hashtags). No X e nos anúncios, palavra ou frase entram na busca.
        </p>
      </div>

      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Carregando assuntos...</p>
      ) : palavras.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nenhum assunto cadastrado.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Assunto</th>
                <th className="px-2 py-2">Detecta em</th>
                <th className="px-2 py-2">Coletar IG</th>
                <th className="px-2 py-2">Coletar X</th>
                <th className="px-2 py-2">Coletar Ads</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {palavras.map((item) => (
                <tr key={item.id} className="border-b border-slate-50">
                  <td className="px-2 py-3 font-medium text-slate-900">{item.termo}</td>
                  <td className="px-2 py-3 text-xs text-slate-500">
                    Rádio · YouTube · Instagram · X · Ads
                  </td>
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={item.coletar_instagram}
                      onChange={(e) =>
                        void patch(item.id, { coletarInstagram: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                      title="Buscar posts novos no Instagram"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={item.coletar_x}
                      onChange={(e) => void patch(item.id, { coletarX: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                      title="Buscar posts novos no X"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={item.coletar_meta_ads}
                      onChange={(e) =>
                        void patch(item.id, { coletarMetaAds: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                      title="Buscar anúncios na Biblioteca Meta"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => void patch(item.id, { ativo: !item.ativo })}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.ativo
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.ativo ? "Ativo" : "Pausado"}
                    </button>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void remover(item.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
