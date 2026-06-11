"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMinutagem } from "@/lib/text-normalize";

interface MonitorStatus {
  ativo: boolean;
  sincronizando: boolean;
  processando: boolean;
  erro: string | null;
  ultima_sincronizacao: string | null;
  ultimo_processamento: string | null;
  videos_processados: number;
}

interface YoutubeVideo {
  id: number;
  video_id: string;
  titulo: string;
  canal_titulo?: string;
  status: string;
  erro_msg: string | null;
  publicado_em: string | null;
  segmentos_total?: number;
}

interface TranscricaoResumo {
  videoDbId: number;
  videoId: string;
  titulo: string;
  canalTitulo: string;
  segmentosTotal: number;
  resumo: string;
  duracaoSegundos: number | null;
}

interface TranscricaoSegmento {
  inicio_segundos: number;
  fim_segundos: number;
  texto: string;
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Na fila",
  processando: "Processando",
  concluido: "Concluído",
  erro: "Erro",
  sem_transcript: "Sem legenda",
  aguardando: "Aguardando estreia",
};

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "pendente", label: "Fila" },
  { id: "aguardando", label: "Aguardando" },
  { id: "concluido", label: "Concluídos" },
  { id: "sem_transcript", label: "Sem legenda" },
] as const;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function YoutubePainel() {
  const [monitor, setMonitor] = useState<MonitorStatus | null>(null);
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [resumos, setResumos] = useState<TranscricaoResumo[]>([]);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todos");
  const [expandido, setExpandido] = useState<number | null>(null);
  const [segmentos, setSegmentos] = useState<Record<number, TranscricaoSegmento[]>>({});
  const [carregandoSegmentos, setCarregandoSegmentos] = useState<number | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const statusParam =
      filtro !== "todos" ? `&status=${filtro === "pendente" ? "pendente" : filtro}` : "";
    const [statusRes, videosRes] = await Promise.all([
      fetch("/api/youtube/status"),
      fetch(`/api/youtube/videos?limite=20${statusParam}`),
    ]);

    const statusData = (await statusRes.json()) as {
      monitor?: MonitorStatus;
      resumos?: TranscricaoResumo[];
      error?: string;
    };
    const videosData = (await videosRes.json()) as {
      videos?: YoutubeVideo[];
      error?: string;
    };

    if (!statusRes.ok || !videosRes.ok) {
      setErro(statusData.error ?? videosData.error ?? "Erro ao carregar painel YouTube");
      return;
    }

    setErro("");
    setMonitor(statusData.monitor ?? null);
    setResumos(statusData.resumos ?? []);
    setVideos(videosData.videos ?? []);
  }, [filtro]);

  useEffect(() => {
    void carregar();
    const timer = setInterval(() => {
      void carregar();
    }, 15_000);
    return () => clearInterval(timer);
  }, [carregar]);

  const resumosPorVideo = useMemo(() => {
    const map = new Map<number, TranscricaoResumo>();
    for (const resumo of resumos) {
      map.set(resumo.videoDbId, resumo);
    }
    return map;
  }, [resumos]);

  async function toggleTranscricao(videoDbId: number) {
    if (expandido === videoDbId) {
      setExpandido(null);
      return;
    }

    setExpandido(videoDbId);

    if (segmentos[videoDbId]) return;

    setCarregandoSegmentos(videoDbId);
    const res = await fetch(`/api/youtube/transcricoes?video_db_id=${videoDbId}&limite=120`);
    const data = (await res.json()) as { segmentos?: TranscricaoSegmento[] };
    setCarregandoSegmentos(null);

    if (res.ok && data.segmentos) {
      setSegmentos((prev) => ({ ...prev, [videoDbId]: data.segmentos ?? [] }));
    }
  }

  if (!monitor && videos.length === 0 && !erro) {
    return null;
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Monitoramento de vídeos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Legendas via múltiplas fontes. Estreias agendadas ficam em aguardando e são reprocessadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {monitor && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Serviço</p>
            <p className="mt-1 font-medium text-slate-900">
              {monitor.ativo ? "Ativo" : "Inativo"}
              {monitor.sincronizando ? " · sync" : ""}
              {monitor.processando ? " · proc." : ""}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Processados</p>
            <p className="mt-1 font-medium text-slate-900">{monitor.videos_processados}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Última sync</p>
            <p className="mt-1 font-medium text-slate-900">
              {formatDateTime(monitor.ultima_sincronizacao)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Último vídeo</p>
            <p className="mt-1 font-medium text-slate-900">
              {formatDateTime(monitor.ultimo_processamento)}
            </p>
          </div>
        </div>
      )}

      {monitor?.erro && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{monitor.erro}</p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTROS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFiltro(item.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filtro === item.id
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {videos.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum vídeo neste filtro.</p>
      ) : (
        <div className="space-y-2">
          {videos.map((video) => {
            const resumo = resumosPorVideo.get(video.id);
            const aberto = expandido === video.id;
            const trechos = segmentos[video.id] ?? [];

            return (
              <div
                key={video.id}
                className="rounded-xl border border-slate-100 bg-slate-50/80"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={`https://www.youtube.com/watch?v=${video.video_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-900 hover:text-red-600"
                    >
                      {video.titulo}
                    </a>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {video.canal_titulo} · {formatDateTime(video.publicado_em)}
                    </p>
                    {video.status === "concluido" && resumo && (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                        {resumo.resumo}
                        {resumo.segmentosTotal > 0 && (
                          <span className="ml-2 text-xs text-slate-400">
                            ({resumo.segmentosTotal} trechos
                            {resumo.duracaoSegundos
                              ? ` · ${formatMinutagem(resumo.duracaoSegundos)}`
                              : ""}
                            )
                          </span>
                        )}
                      </p>
                    )}
                    {video.erro_msg && (
                      <p className="mt-1 text-xs text-amber-700">{video.erro_msg}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                      {STATUS_LABEL[video.status] ?? video.status}
                    </span>
                    {video.status === "concluido" && (
                      <button
                        type="button"
                        onClick={() => void toggleTranscricao(video.id)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        {aberto ? "Ocultar" : "Transcrição"}
                      </button>
                    )}
                  </div>
                </div>

                {aberto && (
                  <div className="border-t border-slate-100 bg-white px-3 py-3">
                    {carregandoSegmentos === video.id ? (
                      <p className="text-sm text-slate-500">Carregando trechos...</p>
                    ) : trechos.length === 0 ? (
                      <p className="text-sm text-slate-400">Nenhum trecho salvo.</p>
                    ) : (
                      <div className="max-h-48 space-y-1 overflow-y-auto text-sm text-slate-700">
                        {trechos.map((segmento, index) => (
                          <p key={`${video.id}-${index}`}>
                            <span className="mr-2 font-mono text-xs text-slate-400">
                              {formatMinutagem(segmento.inicio_segundos)}
                            </span>
                            {segmento.texto}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
