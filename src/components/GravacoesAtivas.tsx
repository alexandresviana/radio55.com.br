"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMinutagem } from "@/lib/text-normalize";
import PaginacaoLista, { POR_PAGINA_ADMIN } from "@/components/PaginacaoLista";

interface RecordingStatusItem {
  key: string;
  municipio: string;
  nome: string;
  ativo: boolean;
  arquivos: number;
  arquivoAtual: string | null;
  tamanhoAtualBytes: number | null;
  erro: string | null;
}

interface DeteccaoItem {
  id: number;
  gravacao_id: number;
  termo: string;
  inicio_segundos: number;
  contexto: string;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  trecho_caminho: string | null;
}

interface TranscricaoTrecho {
  inicio_segundos: number;
  horario: string;
  texto: string;
}

interface TranscricaoPreview {
  gravacao_id: number;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  trechos: TranscricaoTrecho[];
  segmentos: number;
  inicio_segundos: number | null;
  fim_segundos: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function GravacoesAtivas() {
  const [gravacoes, setGravacoes] = useState<RecordingStatusItem[]>([]);
  const [deteccoes, setDeteccoes] = useState<DeteccaoItem[]>([]);
  const [previews, setPreviews] = useState<TranscricaoPreview[]>([]);
  const [transcricaoAtiva, setTranscricaoAtiva] = useState(false);
  const [transcricaoExpandida, setTranscricaoExpandida] = useState<number | null>(null);
  const [deteccoesExpandidas, setDeteccoesExpandidas] = useState(true);
  const [reiniciando, setReiniciando] = useState<string | null>(null);
  const [paginaTranscricoes, setPaginaTranscricoes] = useState(0);
  const [paginaDeteccoes, setPaginaDeteccoes] = useState(0);
  const [totalDeteccoes, setTotalDeteccoes] = useState(0);
  const [statusErro, setStatusErro] = useState("");
  const [statusCarregando, setStatusCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const [statusRes, deteccoesRes, transcricoesRes] = await Promise.all([
      fetch("/api/gravacoes/status"),
      fetch(
        `/api/deteccoes?ao_vivo=1&limite=${POR_PAGINA_ADMIN}&offset=${paginaDeteccoes * POR_PAGINA_ADMIN}`,
      ),
      fetch("/api/transcricoes?ao_vivo=1"),
    ]);

    if (statusRes.ok) {
      const data = (await statusRes.json()) as {
        gravacoes?: RecordingStatusItem[];
        error?: string;
      };
      setGravacoes(data.gravacoes ?? []);
      setStatusErro("");
    } else {
      const data = (await statusRes.json().catch(() => ({}))) as { error?: string };
      setGravacoes([]);
      setStatusErro(data.error ?? "Erro ao carregar gravações ativas");
    }
    setStatusCarregando(false);

    if (deteccoesRes.ok) {
      const data = (await deteccoesRes.json()) as {
        deteccoes: DeteccaoItem[];
        total?: number;
        transcricao?: { ativo?: boolean };
      };
      setDeteccoes(data.deteccoes ?? []);
      setTotalDeteccoes(data.total ?? 0);
      setTranscricaoAtiva(Boolean(data.transcricao?.ativo));
    }

    if (transcricoesRes.ok) {
      const data = (await transcricoesRes.json()) as {
        previews?: TranscricaoPreview[];
        transcricao?: { ativo?: boolean };
      };
      setPreviews(data.previews ?? []);
      setTranscricaoAtiva((prev) => prev || Boolean(data.transcricao?.ativo));
    }
  }, [paginaDeteccoes]);

  const reiniciar = useCallback(
    async (opts?: { municipio?: string; nome?: string; key?: string }) => {
      setReiniciando(opts?.key ?? "todas");
      const res = await fetch("/api/gravacoes/reiniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          municipio: opts?.municipio,
          nome: opts?.nome,
        }),
      });
      setReiniciando(null);

      if (res.ok) {
        await carregar();
      }
    },
    [carregar],
  );

  useEffect(() => {
    void carregar();
    const timer = setInterval(() => {
      void carregar();
    }, 10_000);
    return () => clearInterval(timer);
  }, [carregar]);

  const totalPaginasTranscricoes = useMemo(
    () => Math.max(1, Math.ceil(previews.length / POR_PAGINA_ADMIN)),
    [previews.length],
  );
  const previewsPagina = useMemo(
    () =>
      previews.slice(
        paginaTranscricoes * POR_PAGINA_ADMIN,
        paginaTranscricoes * POR_PAGINA_ADMIN + POR_PAGINA_ADMIN,
      ),
    [previews, paginaTranscricoes],
  );
  const totalPaginasDeteccoes = useMemo(
    () => Math.max(1, Math.ceil(totalDeteccoes / POR_PAGINA_ADMIN)),
    [totalDeteccoes],
  );

  useEffect(() => {
    if (paginaTranscricoes >= totalPaginasTranscricoes) {
      setPaginaTranscricoes(Math.max(0, totalPaginasTranscricoes - 1));
    }
  }, [paginaTranscricoes, totalPaginasTranscricoes]);

  useEffect(() => {
    if (paginaDeteccoes >= totalPaginasDeteccoes && totalDeteccoes > 0) {
      setPaginaDeteccoes(Math.max(0, totalPaginasDeteccoes - 1));
    }
  }, [paginaDeteccoes, totalPaginasDeteccoes, totalDeteccoes]);

  const gravando = gravacoes.filter((item) => item.ativo).length;

  return (
    <div className="mb-6 space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-amber-900">Gravações ativas</h2>
            <p className="mt-1 text-xs text-amber-800">
              Atualização automática a cada 10s. Se a stream cair, reinicia sozinha em ~15s.
              Arquivos rotacionam a cada 1h para evitar MP3 truncado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {transcricaoAtiva && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Transcrição ativa
              </span>
            )}
            {gravacoes.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {gravando}/{gravacoes.length} gravando
              </span>
            )}
            <button
              type="button"
              disabled={reiniciando === "todas"}
              onClick={() => void reiniciar()}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              {reiniciando === "todas" ? "Reiniciando..." : "Reiniciar todas"}
            </button>
          </div>
        </div>

        {statusErro && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{statusErro}</p>
        )}

        {statusCarregando ? (
          <p className="mt-3 text-xs text-amber-800">Carregando status das gravações...</p>
        ) : gravacoes.length === 0 ? (
          <p className="mt-3 text-xs text-amber-800">
            Nenhuma rádio com gravação habilitada. Marque <strong>Gravar</strong> no cadastro abaixo
            e clique em <strong>Salvar alterações</strong>.
          </p>
        ) : (
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
                {item.tamanhoAtualBytes != null && (
                  <span className="font-medium text-emerald-700">
                    {formatBytes(item.tamanhoAtualBytes)}
                  </span>
                )}
              </span>
              {item.arquivoAtual && (
                <p className="w-full font-mono text-xs text-slate-500">{item.arquivoAtual}</p>
              )}
              {item.erro && <p className="w-full text-xs text-amber-800">{item.erro}</p>}
              <div className="w-full">
                <button
                  type="button"
                  disabled={reiniciando === item.key}
                  onClick={() =>
                    void reiniciar({
                      municipio: item.municipio,
                      nome: item.nome,
                      key: item.key,
                    })
                  }
                  className="rounded border border-amber-200 bg-white px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                >
                  {reiniciando === item.key ? "Reiniciando..." : "Reiniciar"}
                </button>
              </div>
            </li>
          ))}
          </ul>
        )}
      </div>

      {previews.length > 0 && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-sky-900">Transcrições ao vivo</h3>
              <p className="mt-1 text-xs text-sky-800">
                Últimos 30 minutos por emissora. Clique para expandir o texto completo.
              </p>
            </div>
            <span className="text-xs text-sky-700">{previews.length} emissora(s)</span>
          </div>

          <div className="mt-3 space-y-2">
            {previewsPagina.map((item) => {
              const aberto = transcricaoExpandida === item.gravacao_id;
              const ultimoTrecho = item.trechos.at(-1)?.texto ?? "";
              const previewTexto =
                ultimoTrecho.length > 140 ? `${ultimoTrecho.slice(0, 140)}…` : ultimoTrecho;

              return (
                <div
                  key={item.gravacao_id}
                  className="rounded-xl border border-sky-100 bg-white/90"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setTranscricaoExpandida((prev) =>
                        prev === item.gravacao_id ? null : item.gravacao_id,
                      )
                    }
                    className="flex w-full flex-wrap items-start justify-between gap-2 px-3 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {item.radio_nome} · {item.municipio}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.segmentos} trecho(s)
                        {item.inicio_segundos != null && item.fim_segundos != null && (
                          <>
                            {" "}
                            · {formatMinutagem(item.inicio_segundos)} –{" "}
                            {formatMinutagem(item.fim_segundos)}
                          </>
                        )}
                      </p>
                      {!aberto && previewTexto && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{previewTexto}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-lg border border-sky-200 px-2 py-1 text-xs text-sky-800">
                      {aberto ? "Ocultar" : "Ver transcrição"}
                    </span>
                  </button>

                  {aberto && (
                    <div className="border-t border-sky-100 px-3 pb-3">
                      <ul className="max-h-56 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
                        {item.trechos.map((trecho) => (
                          <li
                            key={`${item.gravacao_id}-${trecho.inicio_segundos}-${trecho.horario}`}
                            className="flex gap-3 text-xs leading-relaxed"
                          >
                            <time
                              dateTime={trecho.horario}
                              className="shrink-0 font-mono font-medium text-sky-800"
                              title={formatMinutagem(trecho.inicio_segundos)}
                            >
                              {trecho.horario}
                            </time>
                            <span className="text-slate-700">{trecho.texto}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <PaginacaoLista
            pagina={paginaTranscricoes}
            totalPaginas={totalPaginasTranscricoes}
            total={previews.length}
            onAnterior={() => setPaginaTranscricoes((p) => Math.max(0, p - 1))}
            onProxima={() =>
              setPaginaTranscricoes((p) => Math.min(totalPaginasTranscricoes - 1, p + 1))
            }
          />
        </div>
      )}

      {totalDeteccoes > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
          <button
            type="button"
            onClick={() => setDeteccoesExpandidas((prev) => !prev)}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <div>
              <h3 className="text-sm font-semibold text-rose-900">Palavras detectadas (ao vivo)</h3>
              <p className="mt-1 text-xs text-rose-800">
                {totalDeteccoes} ocorrência(s) recentes nas gravações em andamento.
              </p>
            </div>
            <span className="shrink-0 rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-800">
              {deteccoesExpandidas ? "Ocultar" : "Expandir"}
            </span>
          </button>

          {deteccoesExpandidas && (
            <div className="mt-3 space-y-2">
              {deteccoes.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-rose-100 bg-white/90 px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                      {item.termo}
                    </span>
                    <span className="font-medium text-slate-800">
                      {item.radio_nome} · {item.municipio}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      {formatMinutagem(item.inicio_segundos)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600">{item.contexto}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {item.trecho_caminho ? (
                      <audio
                        controls
                        preload="none"
                        src={`/api/deteccoes/${item.id}/trecho`}
                        className="h-8 max-w-[240px]"
                      />
                    ) : null}
                    <a
                      href={`/api/gravacoes/${item.gravacao_id}/arquivo?t=${Math.floor(item.inicio_segundos)}`}
                      className="text-xs font-medium text-emerald-700 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ir ao ponto exato no MP3
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
          {deteccoesExpandidas && (
            <PaginacaoLista
              pagina={paginaDeteccoes}
              totalPaginas={totalPaginasDeteccoes}
              total={totalDeteccoes}
              onAnterior={() => setPaginaDeteccoes((p) => Math.max(0, p - 1))}
              onProxima={() =>
                setPaginaDeteccoes((p) => Math.min(totalPaginasDeteccoes - 1, p + 1))
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
