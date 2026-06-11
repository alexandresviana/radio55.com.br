#!/usr/bin/env python3
import os
import sys
import time

from faster_whisper import WhisperModel

RETRYABLE_STATUS = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = int(os.environ.get("WHISPER_DOWNLOAD_ATTEMPTS", "12"))
BASE_DELAY_SEC = int(os.environ.get("WHISPER_DOWNLOAD_DELAY_SEC", "15"))


def is_retryable(error: BaseException) -> bool:
    response = getattr(error, "response", None)
    if response is not None and getattr(response, "status_code", None) in RETRYABLE_STATUS:
        return True

    message = str(error).lower()
    return any(
        token in message
        for token in (
            "429",
            "too many requests",
            "503",
            "502",
            "504",
            "timed out",
            "timeout",
            "connection reset",
            "connection refused",
        )
    )


def main() -> int:
    model_name = os.environ.get("WHISPER_MODEL", "base")
    cache_dir = os.environ.get("WHISPER_CACHE_DIR", "/app/data/whisper-cache")
    os.makedirs(cache_dir, exist_ok=True)

    print(f"Baixando modelo Whisper '{model_name}' para {cache_dir}...", flush=True)

    last_error: BaseException | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            WhisperModel(
                model_name,
                device="cpu",
                compute_type="int8",
                download_root=cache_dir,
            )
            print("Modelo pronto.", flush=True)
            return 0
        except Exception as error:
            last_error = error
            if attempt >= MAX_ATTEMPTS or not is_retryable(error):
                break

            delay = min(300, BASE_DELAY_SEC * attempt)
            print(
                f"Tentativa {attempt}/{MAX_ATTEMPTS} falhou ({error}). "
                f"Nova tentativa em {delay}s...",
                flush=True,
            )
            time.sleep(delay)

    print(f"Falha ao baixar modelo Whisper: {last_error}", file=sys.stderr, flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
