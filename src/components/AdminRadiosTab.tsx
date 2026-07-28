"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BuscaTranscricoes from "@/components/BuscaTranscricoes";
import GravacoesArquivos from "@/components/GravacoesArquivos";
import GravacoesAtivas from "@/components/GravacoesAtivas";
import PainelDeteccoes from "@/components/PainelDeteccoes";
import { ESTADOS, UF_PADRAO, type Uf } from "@/lib/estados";
import { getRegioesParaSelect, REGIOES_SUGERIDAS } from "@/lib/regioes";
import type { EmissorasData, Radio } from "@/types";

const emptyRadio = (): Radio => ({ nome: "", pj: 1, tipo: "comunitaria", gravar: false });

export default function AdminRadiosTab() {
  const [emissoras, setEmissoras] = useState<EmissorasData>({});
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [estadoAdmin, setEstadoAdmin] = useState<Uf>(UF_PADRAO);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [novoMunicipio, setNovoMunicipio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [emRes, munRes] = await Promise.all([
      fetch("/api/emissoras"),
      fetch(`/api/municipios?estado=${estadoAdmin}`),
    ]);
    setEmissoras(await emRes.json());
    setMunicipios(await munRes.json());
    setLoading(false);
  }, [estadoAdmin]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const municipiosDisponiveis = useMemo(
    () => municipios.filter((m) => !emissoras[m]),
    [municipios, emissoras],
  );

  const lista = useMemo(
    () =>
      Object.keys(emissoras)
        .filter((nome) => (emissoras[nome].estado ?? UF_PADRAO) === estadoAdmin)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [emissoras, estadoAdmin],
  );

  const regioesSelect = useMemo(() => getRegioesParaSelect(emissoras), [emissoras]);

  async function salvar(data: EmissorasData) {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/emissoras", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!res.ok) {
      setMessage({ type: "error", text: "Erro ao salvar. Verifique os dados." });
      return;
    }
    setEmissoras(data);
    setMessage({ type: "ok", text: "Salvo com sucesso!" });
    setTimeout(() => setMessage(null), 3000);
  }

  function atualizarMunicipio(nome: string, patch: Partial<EmissorasData[string]>) {
    setEmissoras((prev) => ({
      ...prev,
      [nome]: { ...prev[nome], ...patch },
    }));
  }

  function adicionarMunicipio() {
    if (!novoMunicipio) return;
    setEmissoras((prev) => ({
      ...prev,
      [novoMunicipio]: {
        estado: estadoAdmin,
        regiao: REGIOES_SUGERIDAS[0],
        radios: [],
      },
    }));
    setSelecionado(novoMunicipio);
    setNovoMunicipio("");
  }

  async function limparBase() {
    const ok = confirm(
      "Isso apaga TODA a base (gravações, transcrições, YouTube, palavras-chave e emissoras) e recarrega só o seed atual.\n\nO login (usuário/senha da dash) NÃO é afetado.\n\nContinuar?",
    );
    if (!ok) return;
    const confirmacao = window.prompt('Digite LIMPAR para confirmar:');
    if (confirmacao !== "LIMPAR") {
      setMessage({ type: "error", text: "Limpeza cancelada." });
      return;
    }

    setResetting(true);
    setMessage(null);
    const res = await fetch("/api/admin/reset-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "LIMPAR" }),
    });
    setResetting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: data.error ?? "Falha ao limpar a base." });
      return;
    }

    const data = await res.json();
    setMessage({
      type: "ok",
      text: `Base limpa. ${data.emissorasRecarregadas} municípios recarregados do seed.`,
    });
    await carregar();
  }

  function removerMunicipio(nome: string) {
    if (!confirm(`Remover ${nome} e todas as suas emissoras?`)) return;
    const next = { ...emissoras };
    delete next[nome];
    setEmissoras(next);
    if (selecionado === nome) setSelecionado(null);
  }

  const atual = selecionado ? emissoras[selecionado] : null;

  if (loading) {
    return <p className="py-12 text-center text-slate-500">Carregando emissoras...</p>;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Rádios</h2>
          <p className="text-sm text-slate-500">{lista.length} municípios cadastrados</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={resetting || saving}
            onClick={() => void limparBase()}
            className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
          >
            {resetting ? "Limpando..." : "Limpar base"}
          </button>
          <button
            type="button"
            disabled={saving || resetting}
            onClick={() => salvar(emissoras)}
            className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

      {message && (
        <p
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            message.type === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <GravacoesAtivas />
      <BuscaTranscricoes />
      <PainelDeteccoes />
      <GravacoesArquivos />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Municípios
          </h3>
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {lista.map((nome) => (
              <li key={nome}>
                <button
                  type="button"
                  onClick={() => setSelecionado(nome)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    selecionado === nome
                      ? "bg-emerald-50 font-medium text-emerald-800"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {nome}
                  <span className="ml-1 text-xs text-slate-400">
                    ({emissoras[nome].radios.length})
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="mb-1 block text-xs font-medium text-slate-500">Estado</label>
            <select
              value={estadoAdmin}
              onChange={(e) => {
                setEstadoAdmin(e.target.value as Uf);
                setSelecionado(null);
                setNovoMunicipio("");
              }}
              className="mb-3 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            >
              {ESTADOS.map((item) => (
                <option key={item.uf} value={item.uf}>
                  {item.label}
                </option>
              ))}
            </select>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Adicionar município
            </label>
            <select
              value={novoMunicipio}
              onChange={(e) => setNovoMunicipio(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            >
              <option value="">Selecione...</option>
              {municipiosDisponiveis.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={adicionarMunicipio}
              disabled={!novoMunicipio}
              className="mt-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              + Adicionar
            </button>
          </div>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {!selecionado || !atual ? (
            <p className="text-slate-500">Selecione um município para editar.</p>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <h3 className="text-xl font-semibold text-slate-900">{selecionado}</h3>
                <button
                  type="button"
                  onClick={() => removerMunicipio(selecionado)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
                >
                  Remover município
                </button>
              </div>

              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
                  <select
                    value={atual.estado ?? estadoAdmin}
                    onChange={(e) =>
                      atualizarMunicipio(selecionado, { estado: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {ESTADOS.map((item) => (
                      <option key={item.uf} value={item.uf}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Região</label>
                  <input
                    list="regioes-admin"
                    value={atual.regiao}
                    onChange={(e) => atualizarMunicipio(selecionado, { regiao: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                  <datalist id="regioes-admin">
                    {regioesSelect.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between">
                <h4 className="font-medium text-slate-800">Emissoras</h4>
                <button
                  type="button"
                  onClick={() =>
                    atualizarMunicipio(selecionado, {
                      radios: [...atual.radios, emptyRadio()],
                    })
                  }
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  + Nova emissora
                </button>
              </div>

              <div className="space-y-4">
                {atual.radios.map((radio, idx) => (
                  <div
                    key={idx}
                    className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-[1fr_80px_140px_120px_auto]">
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Nome</label>
                        <input
                          value={radio.nome}
                          onChange={(e) => {
                            const radios = [...atual.radios];
                            radios[idx] = { ...radio, nome: e.target.value };
                            atualizarMunicipio(selecionado, { radios });
                          }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          placeholder="Ex: Fan FM"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">PJ</label>
                        <input
                          type="number"
                          min={0}
                          value={radio.pj}
                          onChange={(e) => {
                            const radios = [...atual.radios];
                            radios[idx] = { ...radio, pj: Number(e.target.value) };
                            atualizarMunicipio(selecionado, { radios });
                          }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Tipo</label>
                        <select
                          value={radio.tipo}
                          onChange={(e) => {
                            const radios = [...atual.radios];
                            radios[idx] = {
                              ...radio,
                              tipo: e.target.value as Radio["tipo"],
                            };
                            atualizarMunicipio(selecionado, { radios });
                          }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          <option value="comunitaria">Comunitária</option>
                          <option value="comercial">Comercial</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(radio.gravar)}
                            onChange={(e) => {
                              const radios = [...atual.radios];
                              radios[idx] = { ...radio, gravar: e.target.checked };
                              atualizarMunicipio(selecionado, { radios });
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                          />
                          <span className="text-slate-700">Gravar</span>
                        </label>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => {
                            const radios = atual.radios.filter((_, i) => i !== idx);
                            atualizarMunicipio(selecionado, { radios });
                          }}
                          className="rounded-lg px-3 py-2 text-sm text-red-500 transition hover:bg-red-50"
                        >
                          Remover
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-slate-500">URL do stream</label>
                      <input
                        type="url"
                        value={radio.streamUrl ?? ""}
                        onChange={(e) => {
                          const radios = [...atual.radios];
                          radios[idx] = { ...radio, streamUrl: e.target.value };
                          atualizarMunicipio(selecionado, { radios });
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                        placeholder="https://exemplo.com/stream (vazio = radios.com.br)"
                      />
                    </div>
                  </div>
                ))}

                {atual.radios.length === 0 && (
                  <p className="text-sm text-slate-400">Nenhuma emissora cadastrada.</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
