"use client";

import { useCallback, useEffect, useState } from "react";

interface PalavraChave {
  id: number;
  termo: string;
  ativo: boolean;
}

export default function PalavrasChave() {
  const [palavras, setPalavras] = useState<PalavraChave[]>([]);
  const [novoTermo, setNovoTermo] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/palavras-chave");
    const data = (await res.json()) as { palavras?: PalavraChave[]; error?: string };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao carregar palavras-chave");
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
    const res = await fetch("/api/palavras-chave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termo }),
    });
    setSalvando(false);

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setErro(data.error ?? "Erro ao adicionar palavra");
      return;
    }

    setNovoTermo("");
    await carregar();
  }

  async function alternar(id: number, ativo: boolean) {
    await fetch(`/api/palavras-chave/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo }),
    });
    await carregar();
  }

  async function remover(id: number) {
    if (!confirm("Remover esta palavra-chave?")) return;
    await fetch(`/api/palavras-chave/${id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Palavras-chave</h2>
      <p className="mt-1 text-sm text-slate-500">
        Cadastre termos para monitorar automaticamente nas transcrições das gravações ativas.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={novoTermo}
          onChange={(e) => setNovoTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void adicionar();
          }}
          placeholder="Ex.: licitação, prefeito, calamidade"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={salvando}
          onClick={() => void adicionar()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {salvando ? "Salvando..." : "Adicionar"}
        </button>
      </div>

      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Carregando palavras...</p>
      ) : palavras.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nenhuma palavra cadastrada.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {palavras.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
            >
              <span className="font-medium text-slate-800">{item.termo}</span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void alternar(item.id, !item.ativo)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.ativo
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.ativo ? "Ativa" : "Pausada"}
                </button>
                <button
                  type="button"
                  onClick={() => void remover(item.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remover
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
