"use client";

import { useEffect, useRef, useState } from "react";

interface RadioPlayerProps {
  municipio: string;
  nome: string;
  regiaoCor?: string;
  onClose?: () => void;
}

interface StreamInfo {
  title: string;
  radiosUrl: string;
  playUrl: string | null;
  proxied?: boolean;
}

export default function RadioPlayer({ municipio, nome, regiaoCor = "#047857", onClose }: RadioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [info, setInfo] = useState<StreamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [volume, setVolume] = useState(0.9);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setPlaying(false);
    setInfo(null);

    const params = new URLSearchParams({ municipio, nome });
    fetch(`/api/radio-stream?${params}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Stream indisponível");
        }
        return res.json() as Promise<StreamInfo>;
      })
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [municipio, nome]);

  useEffect(() => {
    if (!info?.playUrl || !audioRef.current) return;

    const audio = audioRef.current;
    audio.src = info.playUrl;
    audio.load();

    const onPlaying = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () =>
      setError("Não foi possível reproduzir esta emissora. Tente novamente.");

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setError("Clique em play para iniciar a reprodução"));

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [info?.playUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    audio
      .play()
      .then(() => {
        setPlaying(true);
        setError("");
      })
      .catch(() => setError("Não foi possível reproduzir esta emissora"));
  }

  function handleVolumeChange(value: number) {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
  }

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      style={{ background: `linear-gradient(135deg, ${regiaoCor}12, white)` }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{nome}</p>
          <p className="truncate text-xs text-slate-500">{municipio}</p>
          {info?.title && (
            <p className="mt-1 truncate text-xs text-slate-400">{info.title}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar player"
          >
            ✕
          </button>
        )}
      </div>

      <audio ref={audioRef} preload="none" crossOrigin="anonymous" />

      {loading ? (
        <p className="text-sm text-slate-500">Carregando stream...</p>
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : !info?.playUrl ? (
        <p className="text-sm text-slate-500">Stream não disponível para esta emissora.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white shadow transition hover:opacity-90"
              style={{ backgroundColor: regiaoCor }}
              aria-label={playing ? "Pausar" : "Tocar"}
            >
              {playing ? (
                <span className="text-lg">❚❚</span>
              ) : (
                <span className="ml-0.5 text-lg">▶</span>
              )}
            </button>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Vol</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-emerald-700"
                />
              </div>
              <p className="mt-1 text-xs text-emerald-700">
                {playing ? "● Ao vivo" : "Pausado"}
              </p>
            </div>
          </div>

          {info.radiosUrl && (
            <a
              href={info.radiosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-slate-400 hover:text-emerald-700"
            >
              Fonte: radios.com.br
            </a>
          )}
        </div>
      )}
    </div>
  );
}
