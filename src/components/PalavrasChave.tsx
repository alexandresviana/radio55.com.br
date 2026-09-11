"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PAPEIS_ASSUNTO,
  PAPEIS_ASSUNTO_LABEL,
  type PapelAssunto,
} from "@/lib/assunto-papel";

interface PalavraChave {
  id: number;
  termo: string;
  ativo: boolean;
  coletar_instagram: boolean;
  coletar_x: boolean;
  coletar_meta_ads: boolean;
  coletar_web: boolean;
  papel: PapelAssunto | null;
  requer_papel: PapelAssunto | null;
}

type TipoAssunto = "solto" | "pessoa" | "tema";

function tipoDaPalavra(item: Pick<PalavraChave, "papel" | "requer_papel">): TipoAssunto {
  if (item.papel) return "pessoa";
  if (item.requer_papel) return "tema";
  return "solto";
}

function rotuloRelacao(item: PalavraChave): string {
  if (item.papel) return PAPEIS_ASSUNTO_LABEL[item.papel];
  if (item.requer_papel) return `só com ${PAPEIS_ASSUNTO_LABEL[item.requer_papel].toLowerCase()}`;
  return "Solto";
}

export default function PalavrasChave() {
  const [palavras, setPalavras] = useState<PalavraChave[]>([]);
  const [novoTermo, setNovoTermo] = useState("");
  const [novoTipo, setNovoTipo] = useState<TipoAssunto>("solto");
  const [novoPapel, setNovoPapel] = useState<PapelAssunto>("candidato");
  const [coletarIg, setColetarIg] = useState(false);
  const [coletarX, setColetarX] = useState(false);
  const [coletarMetaAds, setColetarMetaAds] = useState(false);
  const [coletarWeb, setColetarWeb] = useState(true);
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
        coletarWeb: coletarWeb,
        papel: novoTipo === "pessoa" ? novoPapel : null,
        requerPapel: novoTipo === "tema" ? novoPapel : null,
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
      coletarWeb?: boolean;
      papel?: PapelAssunto | null;
      requerPapel?: PapelAssunto | null;
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

  async function alterarTipo(item: PalavraChave, tipo: TipoAssunto) {
    if (tipo === "solto") {
      await patch(item.id, { papel: null, requerPapel: null });
      return;
    }

    const papel = item.papel ?? item.requer_papel ?? "candidato";
    await patch(item.id, {
      papel: tipo === "pessoa" ? papel : null,
      requerPapel: tipo === "tema" ? papel : null,
    });
  }

  async function alterarPapel(item: PalavraChave, papel: PapelAssunto) {
    const tipo = tipoDaPalavra(item);
    if (tipo === "solto") return;
    await patch(item.id, {
      papel: tipo === "pessoa" ? papel : null,
      requerPapel: tipo === "tema" ? papel : null,
    });
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
        <strong>YouTube</strong>, <strong>Instagram</strong>, <strong>X</strong>,{" "}
        <strong>anúncios</strong> e <strong>web</strong>. Uma <em>pessoa</em> (candidato, oponente,
        aliado) vale sozinha. Na <strong>web</strong>, temas com papel (ex.:{" "}
        <em>saúde só com candidato</em>) não fazem busca própria no Google News — eles são
        detectados quando aparecem junto de alguém do mesmo papel, evitando ruído.
        Um <em>tema</em> só conta no mesmo pedaço de texto que alguém daquele papel.
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
            placeholder="Ex.: acm neto, saúde, educação"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={novoTipo}
            onChange={(e) => setNovoTipo(e.target.value as TipoAssunto)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="solto">Solto</option>
            <option value="pessoa">Pessoa</option>
            <option value="tema">Tema</option>
          </select>
          {novoTipo !== "solto" && (
            <select
              value={novoPapel}
              onChange={(e) => setNovoPapel(e.target.value as PapelAssunto)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {PAPEIS_ASSUNTO.map((papel) => (
                <option key={papel} value={papel}>
                  {novoTipo === "tema"
                    ? `Só com ${PAPEIS_ASSUNTO_LABEL[papel].toLowerCase()}`
                    : PAPEIS_ASSUNTO_LABEL[papel]}
                </option>
              ))}
            </select>
          )}
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
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={coletarWeb}
              onChange={(e) => setColetarWeb(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700"
            />
            Também coletar notícias na web (Google News)
          </label>
        </div>
        <p className="text-xs text-slate-400">
          Ex.: <strong>acm neto</strong> como pessoa/candidato e <strong>saúde</strong> como tema
          só com candidato. Saúde solta deixa de entrar.
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
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Assunto</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2">Papel</th>
                <th className="px-2 py-2">Coletar IG</th>
                <th className="px-2 py-2">Coletar X</th>
                <th className="px-2 py-2">Coletar Ads</th>
                <th className="px-2 py-2">Coletar Web</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {palavras.map((item) => {
                const tipo = tipoDaPalavra(item);
                return (
                  <tr key={item.id} className="border-b border-slate-50">
                    <td className="px-2 py-3 font-medium text-slate-900">
                      {item.termo}
                      <div className="text-xs font-normal text-slate-400">{rotuloRelacao(item)}</div>
                    </td>
                    <td className="px-2 py-3">
                      <select
                        value={tipo}
                        onChange={(e) => void alterarTipo(item, e.target.value as TipoAssunto)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                      >
                        <option value="solto">Solto</option>
                        <option value="pessoa">Pessoa</option>
                        <option value="tema">Tema</option>
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      {tipo === "solto" ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <select
                          value={item.papel ?? item.requer_papel ?? "candidato"}
                          onChange={(e) => void alterarPapel(item, e.target.value as PapelAssunto)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                        >
                          {PAPEIS_ASSUNTO.map((papel) => (
                            <option key={papel} value={papel}>
                              {tipo === "tema"
                                ? `Só com ${PAPEIS_ASSUNTO_LABEL[papel].toLowerCase()}`
                                : PAPEIS_ASSUNTO_LABEL[papel]}
                            </option>
                          ))}
                        </select>
                      )}
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
                      <input
                        type="checkbox"
                        checked={item.coletar_web && !item.requer_papel}
                        disabled={Boolean(item.requer_papel)}
                        onChange={(e) => void patch(item.id, { coletarWeb: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-700 disabled:opacity-40"
                        title={
                          item.requer_papel
                            ? "Tema com papel não faz busca própria — só é contado quando aparece junto de uma pessoa"
                            : "Buscar notícias no Google News (web)"
                        }
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
