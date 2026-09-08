const APIFY_BASE = "https://api.apify.com/v2";
const RUNS_PADRAO = 24;
const CACHE_MS = 60_000;

type RunsCache = { at: number; count: number };

type ApifyGlobal = typeof globalThis & {
  __radio55ApifyRuns?: RunsCache;
};

export function getApifyToken(): string {
  // Acesso dinâmico: o webpack não embute string vazia no build da imagem.
  const raw = process.env["APIFY_TOKEN"];
  return typeof raw === "string" ? raw.trim() : "";
}

export function getApifyMaxRunsDia(): number {
  const raw = Number(process.env.APIFY_MAX_RUNS_DIA ?? RUNS_PADRAO);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : RUNS_PADRAO;
}

/** Uma vez: ignora o intervalo de 6h/12h e paga a Apify agora. */
export function deveForcarColetaApify(): boolean {
  return process.env.FORCAR_COLETA_APIFY === "true";
}

/** Fonte ainda dentro do intervalo — não paga a Apify de novo (sobrevive a restart). */
export function fonteVencida(
  ultimaIso: string | null | undefined,
  intervaloMs: number,
): boolean {
  if (!ultimaIso) return true;
  const idade = Date.now() - new Date(ultimaIso).getTime();
  return !Number.isFinite(idade) || idade >= intervaloMs * 0.9;
}

async function contarRuns24h(token: string): Promise<number> {
  const globalRef = globalThis as ApifyGlobal;
  const cached = globalRef.__radio55ApifyRuns;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.count;

  const url = `${APIFY_BASE}/actor-runs?token=${encodeURIComponent(token)}&limit=200&desc=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const payload = (await res.json()) as {
    data?: { items?: Array<{ startedAt?: string }> };
  };
  const items = payload.data?.items ?? [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const count = items.filter((run) => {
    const started = run.startedAt ? new Date(run.startedAt).getTime() : 0;
    return started >= cutoff;
  }).length;

  globalRef.__radio55ApifyRuns = { at: Date.now(), count };
  return count;
}

function somarRunLocal(): void {
  const globalRef = globalThis as ApifyGlobal;
  if (!globalRef.__radio55ApifyRuns) return;
  globalRef.__radio55ApifyRuns.count += 1;
}

/** Teto compartilhado no token — os 3 projetos somam no mesmo limite. */
export async function autorizarRunApify(rotulo: string): Promise<boolean> {
  const token = getApifyToken();
  if (!token) return false;

  const max = getApifyMaxRunsDia();
  try {
    const count = await contarRuns24h(token);
    if (count >= max) {
      console.warn(
        `[apify] teto de ${max} execuções/24h atingido (${count}) — pulando ${rotulo}`,
      );
      return false;
    }
  } catch (error) {
    console.warn(
      `[apify] não leu o uso (${error instanceof Error ? error.message : error}) — segue ${rotulo}`,
    );
  }

  somarRunLocal();
  return true;
}
