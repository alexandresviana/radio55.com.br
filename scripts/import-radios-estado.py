#!/usr/bin/env python3
"""Importa rádios de um estado a partir do radios.com.br (FM, AM e web)."""

from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import cloudscraper

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_UF = "bahia"
UF_META = {
    "bahia": {"sigla": "BA", "geo": ROOT / "public/data/bahia-mun.json"},
    "sergipe": {"sigla": "SE", "geo": ROOT / "public/data/sergipe-mun.json"},
}

scraper = cloudscraper.create_scraper(
    browser={"browser": "chrome", "platform": "darwin", "desktop": True},
)


def fetch(url: str, retries: int = 3) -> str:
    for attempt in range(retries):
        try:
            resp = scraper.get(url, timeout=45)
            if resp.status_code == 200 and "Just a moment" not in resp.text:
                return resp.text
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] {url}: {exc}")
        time.sleep(1.2 + attempt)
    return ""


def norm_key(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.strip())
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", stripped).upper()


def load_geo_names(geo_path: Path) -> dict[str, str]:
    data = json.loads(geo_path.read_text(encoding="utf-8"))
    mapping: dict[str, str] = {}
    for feature in data.get("features", []):
        name = feature.get("properties", {}).get("name", "").strip()
        if name:
            mapping[norm_key(name)] = name
    return mapping


def normalize_city(raw_city: str, geo_names: dict[str, str]) -> str:
    key = norm_key(raw_city)
    if key in geo_names:
        return geo_names[key]
    # tentativas comuns
    replacements = {
        "MORRO DE SAO PAULO": "Morro de São Paulo",
        "SAO PAULO": "Morro de São Paulo",
    }
    if key in replacements:
        return replacements[key]
    title = raw_city.strip().title()
    title = title.replace(" Da ", " da ").replace(" De ", " de ").replace(" Do ", " do ")
    title = title.replace(" Dos ", " dos ").replace(" Das ", " das ")
    if norm_key(title) in geo_names:
        return geo_names[norm_key(title)]
    return raw_city.strip()


def clean_nome(title: str) -> str:
    nome = re.sub(r"^R[aá]dio\s+", "", title.strip(), flags=re.I)
    nome = re.sub(r"\s+\d{2,3}(?:[.,]\d{1,2})?\s*(?:FM|AM|MHz)?\s*$", "", nome, flags=re.I)
    nome = re.sub(r"\s+", " ", nome).strip()
    return nome or title.strip()


def parse_listing(html: str, uf_sigla: str) -> list[dict]:
    pattern = re.compile(
        rf'<h3><a href="(https://www\.radios\.com\.br/aovivo/[^"]+/(\d+))">([^<]+)</a></h3>\s*'
        rf'<p class="localizacao">\s*<a[^>]*title="Rádios ([^/]+) / {uf_sigla} - Brasil"',
        re.S,
    )
    items: list[dict] = []
    for url, rid, title, city in pattern.findall(html):
        items.append(
            {
                "id": int(rid),
                "title": title.strip(),
                "city": city.strip(),
                "url": url,
            },
        )
    return items


def scrape_state_radios(uf_slug: str, uf_sigla: str) -> list[dict]:
    all_radios: dict[int, dict] = {}
    for kind in ("fm", "am", "web"):
        pg = 0
        empty = 0
        while pg < 120:
            suffix = f"?pg={pg}" if pg else ""
            url = f"https://www.radios.com.br/radio/uf/{uf_slug}/5/{kind}{suffix}"
            html = fetch(url)
            items = parse_listing(html, uf_sigla)
            new = 0
            for item in items:
                if item["id"] not in all_radios:
                    new += 1
                all_radios[item["id"]] = {**item, "kind": kind}
            print(f"{kind} pg={pg} items={len(items)} new={new} total={len(all_radios)}")
            if not items or new == 0:
                empty += 1
                if empty >= 2:
                    break
            else:
                empty = 0
            pg += 1
            time.sleep(0.2)
    return list(all_radios.values())


def scrape_city_regions(uf_slug: str, uf_sigla: str) -> dict[str, str]:
    html = fetch(f"https://www.radios.com.br/lista/uf/{uf_slug}/5")
    regions = re.findall(
        r'href="(https://www\.radios\.com\.br/lista/regiao/[^"]+)"[^>]*>\s*([^<]+?)\s*</a>',
        html,
    )
    city_region: dict[str, str] = {}
    for url, name in regions:
        region = name.strip()
        rurl = url.replace("/lista/regiao/", "/radio/regiao/").rstrip("/") + "/fm"
        rhtml = fetch(rurl)
        for city in re.findall(rf'title="Rádios ([^/]+) / {uf_sigla} - Brasil"', rhtml):
            city_region[city.strip()] = region
        for city in re.findall(
            r'href="https://www\.radios\.com\.br/radio/cidade/[^"]+"[^>]*>([^<]+)</a>',
            rhtml,
        ):
            c = city.strip()
            if c:
                city_region.setdefault(c, region)
    return city_region


def get_stream(radio_id: int) -> str | None:
    for ext in ("m3u", "pls"):
        content = fetch(f"https://www.radios.com.br/play/playlist/{radio_id}/listen-radio.{ext}", retries=2)
        urls = re.findall(r"https?://[^\s\r\n#]+", content or "")
        if urls:
            return urls[0].rstrip("/")
    return None


def fetch_streams(items: list[dict], workers: int = 10) -> dict[int, str | None]:
    streams: dict[int, str | None] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(get_stream, item["id"]): item["id"] for item in items}
        done = 0
        for future in as_completed(futures):
            rid = futures[future]
            try:
                streams[rid] = future.result()
            except Exception:  # noqa: BLE001
                streams[rid] = None
            done += 1
            if done % 50 == 0:
                print(f"streams {done}/{len(items)}")
    return streams


def build_outputs(
    radios: list[dict],
    streams: dict[int, str | None],
    geo_names: dict[str, str],
    city_regions: dict[str, str],
    uf_sigla: str,
) -> tuple[dict, dict]:
    emissoras: dict = {}
    stream_map: dict = {}

    for radio in radios:
        city = normalize_city(radio["city"], geo_names)
        nome_base = clean_nome(radio["title"])
        regiao = city_regions.get(radio["city"], city_regions.get(city, uf_sigla))
        tipo = "comunitaria" if radio.get("kind") == "web" else "comercial"

        entry = emissoras.setdefault(
            city,
            {"estado": uf_sigla, "regiao": regiao, "radios": []},
        )

        nome = nome_base
        used = {r["nome"] for r in entry["radios"]}
        if nome in used:
            suffix = radio["title"].split()[-1]
            nome = f"{nome_base} ({suffix})"
            n = 2
            while nome in used:
                nome = f"{nome_base} ({suffix}-{n})"
                n += 1

        entry["radios"].append({"nome": nome, "pj": 0, "tipo": tipo})

        stream_key = f"{uf_sigla}|{city}|{nome}"
        stream_map[stream_key] = {
            "estado": uf_sigla,
            "municipio": city,
            "nome": nome,
            "radiosId": radio["id"],
            "radiosUrl": radio["url"],
            "title": radio["title"],
            "streamUrl": streams.get(radio["id"]),
        }

    return emissoras, stream_map


def merge_emissoras(existing: dict, incoming: dict) -> dict:
    merged = dict(existing)
    for city, data in incoming.items():
        if city not in merged:
            merged[city] = data
            continue
        if merged[city].get("estado") != data.get("estado"):
            # colisão de nomes entre estados — prefixa UF na chave
            key = f"{city} ({data['estado']})"
            merged[key] = data
            continue
        seen = {r["nome"] for r in merged[city]["radios"]}
        for radio in data["radios"]:
            if radio["nome"] not in seen:
                merged[city]["radios"].append(radio)
    return merged


def merge_streams(existing: dict, incoming: dict) -> dict:
    merged = dict(existing)
    merged.update(incoming)
    return merged


def ensure_estado(existing: dict, default: str = "SE") -> dict:
    for data in existing.values():
        data.setdefault("estado", default)
    return existing


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--uf", default=DEFAULT_UF, choices=sorted(UF_META))
    parser.add_argument("--skip-scrape", action="store_true")
    parser.add_argument("--raw-cache", type=Path, default=None)
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()

    meta = UF_META[args.uf]
    uf_sigla = meta["sigla"]
    geo_names = load_geo_names(meta["geo"])

    cache_path = args.raw_cache or ROOT / f"data/.import-cache-{args.uf}.json"

    if args.skip_scrape and cache_path.exists():
        radios = json.loads(cache_path.read_text(encoding="utf-8"))
        print(f"cache: {len(radios)} rádios")
    else:
        radios = scrape_state_radios(args.uf, uf_sigla)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(radios, ensure_ascii=False, indent=2), encoding="utf-8")

    city_regions = scrape_city_regions(args.uf, uf_sigla) if uf_sigla == "BA" else {}
    print(f"regiões/cidades: {len(city_regions)}")

    streams = fetch_streams(radios, workers=args.workers)
    with_stream = sum(1 for v in streams.values() if v)
    print(f"streams ok: {with_stream}/{len(streams)}")

    incoming_emissoras, incoming_streams = build_outputs(
        radios, streams, geo_names, city_regions, uf_sigla,
    )

    emissoras_path = ROOT / "data/emissoras.json"
    streams_path = ROOT / "data/radios-streams.json"
    seed_path = ROOT / "src/data/emissoras.json"

    existing_emissoras = json.loads(emissoras_path.read_text(encoding="utf-8")) if emissoras_path.exists() else {}
    existing_streams = json.loads(streams_path.read_text(encoding="utf-8")) if streams_path.exists() else {}

    existing_emissoras = ensure_estado(existing_emissoras, "SE")
    merged_emissoras = merge_emissoras(existing_emissoras, incoming_emissoras)
    merged_streams = merge_streams(existing_streams, incoming_streams)

    emissoras_path.write_text(json.dumps(merged_emissoras, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    seed_path.write_text(json.dumps(merged_emissoras, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    streams_path.write_text(json.dumps(merged_streams, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    total_radios = sum(len(m["radios"]) for m in incoming_emissoras.values())
    print(
        f"OK {uf_sigla}: +{len(incoming_emissoras)} municípios, +{total_radios} rádios, "
        f"streams={len(incoming_streams)}",
    )


if __name__ == "__main__":
    main()
