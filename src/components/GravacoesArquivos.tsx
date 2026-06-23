"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PaginacaoLista, { POR_PAGINA_ADMIN } from "@/components/PaginacaoLista";

interface GravacaoArquivo {
  id: number;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  gravado_em: string;
  tamanho_bytes: number;
  em_gravacao: boolean;
  arquivo_valido: boolean | null;
  arquivo_erro: string | null;
  bunny_uploaded_em: string | null;
}

interface RadioOption {
  municipio: string;
  radio_nome: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function GravacoesArquivos() {
  const [arquivos, setArquivos] = useState<GravacaoArquivo[]>([]);
  const [radios, setRadios] = useState<RadioOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [municipio, setMunicipio] = useState("");
  const [radio, setRadio] = useState("");
  const [dia, setDia] = useState("");
  const [horaDe, setHoraDe] = useState("");
  const [horaAte, setHoraAte] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);

  const municipios = useMemo(
    () => [...new Set(radios.map((r) => r.municipio))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [radios],
  );

  const radiosDoMunicipio = useMemo(
    () =>
      radios
        .filter((r) => !municipio || r.municipio === municipio)
        .map((r) => r.radio_nome)
        .filter((nome, idx, arr) => arr.indexOf(nome) === idx)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [radios, municipio],
  );

  const carregarOpcoes = useCallback(async () => {
    const res = await fetch("/api/gravacoes?opcoes=1");
    if (!res.ok) return;
    const data = (await res.json()) as { radios: RadioOption[] };
    setRadios(data.radios ?? []);
  }, []);

  const buscar = useCallback(async (opts?: { pagina?: number }) => {
    setLoading(true);
    setErro("");

    const paginaAtual = opts?.pagina ?? pagina;

    const params = new URLSearchParams();
    if (municipio) params.set("municipio", municipio);
    if (radio) params.set("radio", radio);
    if (dia) params.set("dia", dia);
    if (horaDe) params.set("horaDe", horaDe);
    if (horaAte) params.set("horaAte", horaAte);
    params.set("limite", String(POR_PAGINA_ADMIN));
    params.set("offset", String(paginaAtual * POR_PAGINA_ADMIN));

    const res = await fetch(`/api/gravacoes?${params}`);
    const data = (await res.json()) as {
      arquivos?: GravacaoArquivo[];
      total?: number;
      error?: string;
    };

    if (!res.ok) {
      setErro(data.error ?? "Erro ao buscar gravações");
      setArquivos([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setArquivos(data.arquivos ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [municipio, radio, dia, horaDe, horaAte, pagina]);

  useEffect(() => {
    setPagina(0);
  }, [municipio, radio, dia, horaDe, horaAte]);

  useEffect(() => {
    void carregarOpcoes();
  }, [carregarOpcoes]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_ADMIN));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Arquivos gravados</h2>
          <p className="mt-1 text-sm text-slate-500">
            MP3 indexados automaticamente. Use Atualizar para recarregar a lista.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void buscar()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Município</label>
          <select
            value={municipio}
            onChange={(e) => {
              setMunicipio(e.target.value);
              setRadio("");
            }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {municipios.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Rádio</label>
          <select
            value={radio}
            onChange={(e) => setRadio(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {radiosDoMunicipio.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Dia</label>
          <input
            type="date"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Hora de</label>
          <input
            type="time"
            value={horaDe}
            onChange={(e) => setHoraDe(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Hora até</label>
          <input
            type="time"
            value={horaAte}
            onChange={(e) => setHoraAte(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mb-4">
        <button
          type="button"
          onClick={() => {
            setPagina(0);
            void buscar({ pagina: 0 });
          }}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          Buscar
        </button>
      </div>

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando arquivos...</p>
      ) : arquivos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum arquivo encontrado para os filtros selecionados.</p>
      ) : (
        <>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Data/hora</th>
                <th className="px-4 py-3">Rádio</th>
                <th className="px-4 py-3">Município</th>
                <th className="px-4 py-3">Arquivo</th>
                <th className="px-4 py-3">Tamanho</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ouvir</th>
              </tr>
            </thead>
            <tbody>
              {arquivos.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(item.gravado_em)}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{item.radio_nome}</td>
                  <td className="px-4 py-3 text-slate-600">{item.municipio}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.arquivo}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className={item.em_gravacao ? "font-medium text-emerald-700" : ""}>
                      {formatBytes(item.tamanho_bytes)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.em_gravacao ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
                        Ao vivo
                      </span>
                    ) : item.arquivo_valido === false ? (
                      <span
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                        title={item.arquivo_erro ?? "Arquivo truncado ou ilegível"}
                      >
                        Inválido
                      </span>
                    ) : item.bunny_uploaded_em ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                        No storage
                      </span>
                    ) : (
                      <span
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                        title="Aguardando envio ao Bunny Storage"
                      >
                        Enviando...
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.arquivo_valido === false ? (
                      <span className="text-xs text-amber-700" title={item.arquivo_erro ?? undefined}>
                        Indisponível
                      </span>
                    ) : !item.em_gravacao && !item.bunny_uploaded_em ? (
                      <span className="text-xs text-slate-500">Aguardando storage</span>
                    ) : (
                      <audio
                        controls
                        preload={item.em_gravacao ? "auto" : "none"}
                        src={`/api/gravacoes/${item.id}/arquivo`}
                        className="h-8 max-w-[220px]"
                        title={
                          item.em_gravacao
                            ? "Reprodução ao vivo — o áudio continua conforme a gravação avança"
                            : undefined
                        }
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginacaoLista
          pagina={pagina}
          totalPaginas={totalPaginas}
          total={total}
          loading={loading}
          onAnterior={() => setPagina((p) => Math.max(0, p - 1))}
          onProxima={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
        />
        </>
      )}
    </section>
  );
}
