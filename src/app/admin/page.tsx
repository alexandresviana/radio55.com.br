"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GravacoesArquivos from "@/components/GravacoesArquivos";
import Header from "@/components/Header";
import { REGIOES } from "@/lib/regioes";
import type { EmissorasData, Radio } from "@/types";

interface RecordingStatusItem {
  key: string;
  municipio: string;
  nome: string;
  ativo: boolean;
  arquivos: number;
  ultimoArquivo: string | null;
  erro: string | null;
}

const emptyRadio = (): Radio => ({ nome: "", pj: 1, tipo: "comunitaria", gravar: false });

export default function AdminPage() {
  const [emissoras, setEmissoras] = useState<EmissorasData>({});
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [novoMunicipio, setNovoMunicipio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [gravacoes, setGravacoes] = useState<RecordingStatusItem[]>([]);

  const carregarGravacoes = useCallback(async () => {
    const res = await fetch("/api/gravacoes/status");
    if (!res.ok) return;
    const data = (await res.json()) as { gravacoes: RecordingStatusItem[] };
    setGravacoes(data.gravacoes);
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [emRes, munRes] = await Promise.all([
      fetch("/api/emissoras"),
      fetch("/api/municipios"),
    ]);
    setEmissoras(await emRes.json());
    setMunicipios(await munRes.json());
    await carregarGravacoes();
    setLoading(false);
  }, [carregarGravacoes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const timer = setInterval(() => {
      void carregarGravacoes();
    }, 30_000);
    return () => clearInterval(timer);
  }, [carregarGravacoes]);

  const municipiosDisponiveis = useMemo(
    () => municipios.filter((m) => !emissoras[m]),
    [municipios, emissoras],
  );

  const lista = useMemo(
    () => Object.keys(emissoras).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [emissoras],
  );

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
    await carregarGravacoes();
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
      [novoMunicipio]: { regiao: REGIOES[0], radios: [] },
    }));
    setSelecionado(novoMunicipio);
    setNovoMunicipio("");
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
    return (
      <div className="min-h-screen bg-slate-50">
        <Header subtitle="Painel administrativo" />
        <p className="px-6 py-12 text-center text-slate-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header subtitle="Painel administrativo" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Gerenciar emissoras</h1>
            <p className="text-sm text-slate-500">
              {lista.length} municípios cadastrados
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => salvar(emissoras)}
            className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
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

        {gravacoes.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <h2 className="text-sm font-semibold text-amber-900">Gravações ativas</h2>
            <p className="mt-1 text-xs text-amber-800">
              Arquivos MP3 em segmentos de 1h, removidos automaticamente após 24 horas.
            </p>
            <ul className="mt-3 space-y-2">
              {gravacoes.map((item) => (
                <li
                  key={item.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">
                    {item.nome} · {item.municipio}
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        item.ativo
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.ativo ? "Gravando" : "Parado"}
                    </span>
                    <span className="text-slate-500">{item.arquivos} arquivo(s)</span>
                  </span>
                  {item.erro && (
                    <p className="w-full text-xs text-red-600">{item.erro}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <GravacoesArquivos />

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Municípios
            </h2>
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
                  <h2 className="text-xl font-semibold text-slate-900">{selecionado}</h2>
                  <button
                    type="button"
                    onClick={() => removerMunicipio(selecionado)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
                  >
                    Remover município
                  </button>
                </div>

                <div className="mb-6">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Região</label>
                  <select
                    value={atual.regiao}
                    onChange={(e) =>
                      atualizarMunicipio(selecionado, { regiao: e.target.value })
                    }
                    className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {REGIOES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium text-slate-800">Emissoras</h3>
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
                      className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[1fr_80px_140px_120px_auto]"
                    >
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
                  ))}

                  {atual.radios.length === 0 && (
                    <p className="text-sm text-slate-400">Nenhuma emissora cadastrada.</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
