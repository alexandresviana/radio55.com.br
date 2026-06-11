#!/usr/bin/env python3
import os
import sys

from faster_whisper import WhisperModel

model_name = os.environ.get("WHISPER_MODEL", "base")
cache_dir = os.environ.get("WHISPER_CACHE_DIR", "/opt/whisper-models")

print(f"Baixando modelo Whisper '{model_name}' para {cache_dir}...", flush=True)
WhisperModel(model_name, device="cpu", compute_type="int8", download_root=cache_dir)
print("Modelo pronto.", flush=True)
