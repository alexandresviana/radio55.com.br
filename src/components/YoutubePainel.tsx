"use client";

import { useCallback, useEffect, useState } from "react";
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

interface TranscricaoSegmento {
  inicio_segundos: number;
  texto: string;
}

interface TranscricaoPreview {
  videoId: string;
  titulo: string;
  canalTitulo: string;
  segmentos: TranscricaoSegmento[];
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Na fila",
  processando: "Processando",
  concluido: "Concluído",
  erro: "Erro",
  sem_transcript: "Sem legenda",
};

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
  const [previews, setPreviews] = useState<TranscricaoPreview[]>([]);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [statusRes, videosRes] = await Promise.all([
      fetch("/api/youtube/status"),
      fetch("/api/youtube/videos?limite=30"),
    ]);

    const statusData = (await statusRes.json()) as {
      monitor?: MonitorStatus;
      previews?: TranscricaoPreview[];
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
    setPreviews(statusData.previews ?? []);
    setVideos(videosData.videos ?? []);
  }, []);

  useEffect(() => {
    void carregar();
    const timer = setInterval(() => {
      void carregar();
    }, 10_000);
    return () => clearInterval(timer);
  }, [carregar]);

  if (!monitor && videos.length === 0 && !erro) {
    return null;
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Monitoramento de vídeos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sincroniza novos vídeos via RSS e processa legendas automaticamente.
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
              {monitor.sincronizando ? " · sincronizando" : ""}
              {monitor.processando ? " · processando" : ""}
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

      {previews.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Transcrições recentes</h3>
          <div className="space-y-3">
            {previews.map((preview) => (
              <div key={preview.videoId} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{preview.titulo}</p>
                    <p className="text-xs text-slate-500">{preview.canalTitulo}</p>
                  </div>
                  <a
                    href={`https://www.youtube.com/watch?v=${preview.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    Abrir no YouTube
                  </a>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto text-sm text-slate-700">
                  {preview.segmentos.slice(0, 12).map((segmento, index) => (
                    <p key={`${preview.videoId}-${index}`}>
                      <span className="mr-2 font-mono text-xs text-slate-400">
                        {formatMinutagem(segmento.inicio_segundos)}
                      </span>
                      {segmento.texto}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold text-slate-800">Fila de vídeos</h3>
      {videos.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum vídeo na fila ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Vídeo</th>
                <th className="px-2 py-2">Canal</th>
                <th className="px-2 py-2">Publicado</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Trechos</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id} className="border-b border-slate-50">
                  <td className="px-2 py-3">
                    <a
                      href={`https://www.youtube.com/watch?v=${video.video_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-900 hover:text-red-600"
                    >
                      {video.titulo}
                    </a>
                    {video.erro_msg && (
                      <p className="mt-1 text-xs text-red-600">{video.erro_msg}</p>
                    )}
                  </td>
                  <td className="px-2 py-3 text-slate-600">{video.canal_titulo}</td>
                  <td className="px-2 py-3 text-slate-600">
                    {formatDateTime(video.publicado_em)}
                  </td>
                  <td className="px-2 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {STATUS_LABEL[video.status] ?? video.status}
                    </span>
                  </td>
                  <td className="px-2 py-3">{video.segmentos_total ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
