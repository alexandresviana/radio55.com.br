#!/usr/bin/env python3
import json
import os
import sys


def _limit_threads() -> int:
    """Trava OpenMP/BLAS *antes* de importar ctranslate2, senão usam todos os núcleos."""
    try:
        cpu_threads = max(1, int(os.environ.get("WHISPER_CPU_THREADS", "1")))
    except ValueError:
        cpu_threads = 1
    n = str(cpu_threads)
    for key in (
        "OMP_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "MKL_NUM_THREADS",
        "VECLIB_MAXIMUM_THREADS",
        "NUMEXPR_NUM_THREADS",
        "CT2_INTER_THREADS",
    ):
        os.environ[key] = n
    return cpu_threads


CPU_THREADS = _limit_threads()


def _lower_priority() -> None:
    try:
        os.nice(15)
    except OSError:
        pass


def load_model():
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper não instalado", file=sys.stderr)
        raise SystemExit(2)

    model_name = os.environ.get("WHISPER_MODEL", "base")
    cache_dir = os.environ.get("WHISPER_CACHE_DIR") or os.environ.get("HF_HOME")
    local_only = os.environ.get("HF_HUB_OFFLINE", "").lower() in ("1", "true", "yes")

    kwargs: dict = {
        "device": "cpu",
        "compute_type": "int8",
        "cpu_threads": CPU_THREADS,
        "num_workers": 1,
    }
    if cache_dir:
        kwargs["download_root"] = cache_dir
    if local_only:
        kwargs["local_files_only"] = True

    try:
        return WhisperModel(model_name, **kwargs)
    except Exception as error:
        if local_only:
            print(
                f"Modelo local indisponível em {cache_dir}: {error}",
                file=sys.stderr,
            )
        raise


def transcribe_file(model, audio_path: str) -> dict:
    # word_timestamps desativado: só usamos start/end/text dos segmentos.
    segments, info = model.transcribe(
        audio_path,
        language="pt",
        vad_filter=True,
        beam_size=1,
    )
    return {
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


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def run_worker() -> int:
    _lower_priority()
    print("[whisper] carregando modelo...", file=sys.stderr, flush=True)
    model = load_model()
    emit({"event": "ready"})
    print("[whisper] modelo pronto — aguardando chunks", file=sys.stderr, flush=True)

    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as error:
            emit({"ok": False, "error": f"JSON inválido: {error}"})
            continue

        req_id = req.get("id")
        audio_path = req.get("path")
        if not audio_path:
            emit({"ok": False, "id": req_id, "error": "path ausente"})
            continue

        try:
            payload = transcribe_file(model, audio_path)
            payload["ok"] = True
            payload["id"] = req_id
            emit(payload)
        except Exception as error:
            emit({"ok": False, "id": req_id, "error": str(error)})

    return 0


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1] in ("--worker", "-w"):
        return run_worker()

    if len(sys.argv) < 2:
        print("Uso: transcribe.py <arquivo.wav> | --worker", file=sys.stderr)
        return 1

    model = load_model()
    emit(transcribe_file(model, sys.argv[1]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
