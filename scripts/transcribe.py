#!/usr/bin/env python3
import json
import os
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: transcribe.py <arquivo.wav>", file=sys.stderr)
        return 1

    audio_path = sys.argv[1]
    model_name = os.environ.get("WHISPER_MODEL", "base")
    cache_dir = os.environ.get("WHISPER_CACHE_DIR") or os.environ.get("HF_HOME")
    local_only = os.environ.get("HF_HUB_OFFLINE", "").lower() in ("1", "true", "yes")

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper não instalado", file=sys.stderr)
        return 2

    # Limita os threads do ctranslate2: sem isso o Whisper toma todos os núcleos
    # e o Node não consegue nem completar handshakes com o Postgres.
    cpu_threads = int(os.environ.get("WHISPER_CPU_THREADS", "2"))

    kwargs: dict = {
        "device": "cpu",
        "compute_type": "int8",
        "cpu_threads": cpu_threads,
    }
    if cache_dir:
        kwargs["download_root"] = cache_dir
    if local_only:
        kwargs["local_files_only"] = True

    try:
        model = WhisperModel(model_name, **kwargs)
    except Exception as error:
        if local_only:
            print(
                f"Modelo local indisponível em {cache_dir}: {error}",
                file=sys.stderr,
            )
        raise
    # word_timestamps desativado: só usamos start/end/text dos segmentos,
    # e timestamps por palavra dobram o custo de CPU.
    segments, info = model.transcribe(
        audio_path,
        language="pt",
        vad_filter=True,
        beam_size=1,
    )

    payload = {
        "language": info.language,
        "segments": [
            {
                "start": float(segment.start),
                "end": float(segment.end),
                "text": segment.text.strip(),
            }
            for segment in segments
        ],
    }

    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
