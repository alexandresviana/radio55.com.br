import { chatCompletion, isAiConfigured } from "@/lib/ai-client";
import { nomeIdioma, parseIdioma, type Idioma } from "@/i18n/idioma";
import { translate } from "@/i18n/messages";
import {
  buscarBaseRelatorioPanorama,
  type FontePanorama,
  type JanelaPanorama,
} from "@/lib/panorama-db";

export type SentimentoRelatorio = "positivo" | "neutro" | "negativo" | "misto";

export interface RelatorioAssunto {
  termo: string;
  mencoes: number;
  sentimento: SentimentoRelatorio;
  leitura: string;
}

export interface RelatorioPanorama {
  titulo: string;
  resumo: string;
  sentimento_geral: SentimentoRelatorio;
  tom: string;
  sentimentos: { positivo: number; neutro: number; negativo: number };
  assuntos: RelatorioAssunto[];
  destaques: string[];
  alertas: string[];
  gerado_em: string;
  janela: JanelaPanorama;
  fonte: FontePanorama | "todas";
  termo: string;
  total: number;
  por_fonte: { fonte: FontePanorama; mencoes: number }[];
  ia: boolean;
  aviso?: string;
}

const SENTIMENTOS = new Set<SentimentoRelatorio>(["positivo", "neutro", "negativo", "misto"]);
const TTL_MS = 10 * 60 * 1000;

type CacheGlobal = typeof globalThis & {
  __orbitRelatorioCache?: Map<string, { at: number; valor: RelatorioPanorama }>;
  __orbitRelatorioInflight?: Map<string, Promise<RelatorioPanorama>>;
};

function cache(): Map<string, { at: number; valor: RelatorioPanorama }> {
  const g = globalThis as CacheGlobal;
  if (!g.__orbitRelatorioCache) g.__orbitRelatorioCache = new Map();
  return g.__orbitRelatorioCache;
}

function inflight(): Map<string, Promise<RelatorioPanorama>> {
  const g = globalThis as CacheGlobal;
  if (!g.__orbitRelatorioInflight) g.__orbitRelatorioInflight = new Map();
  return g.__orbitRelatorioInflight;
}

function chaveCache(params: {
  janela: JanelaPanorama;
  fonte: FontePanorama | "todas";
  termo: string;
  idioma: Idioma;
}): string {
  return `${params.idioma}|${params.janela}|${params.fonte}|${params.termo.trim().toLowerCase()}`;
}

function tituloContagem(idioma: Idioma, total: number, janela: JanelaPanorama): string {
  const uma = total === 1;
  if (janela === "24h") {
    return translate(
      idioma,
      uma ? "{n} menção nas últimas 24 horas" : "{n} menções nas últimas 24 horas",
      { n: total },
    );
  }
  if (janela === "7d") {
    return translate(
      idioma,
      uma ? "{n} menção nos últimos 7 dias" : "{n} menções nos últimos 7 dias",
      { n: total },
    );
  }
  return translate(
    idioma,
    uma ? "{n} menção nos últimos 30 dias" : "{n} menções nos últimos 30 dias",
    { n: total },
  );
}

function leituraContagem(idioma: Idioma, mencoes: number): string {
  return translate(
    idioma,
    mencoes === 1 ? "{n} menção no período." : "{n} menções no período.",
    { n: mencoes },
  );
}
function rotuloJanela(janela: JanelaPanorama, idioma: Idioma): string {
  if (janela === "24h") return translate(idioma, "nas últimas 24 horas");
  if (janela === "7d") return translate(idioma, "nos últimos 7 dias");
  return translate(idioma, "nos últimos 30 dias");
}

function rotuloFonte(fonte: FontePanorama, idioma: Idioma): string {
  if (fonte === "radio") return translate(idioma, "Rádio");
  if (fonte === "youtube") return "YouTube";
  if (fonte === "instagram") return "Instagram";
  if (fonte === "meta_ads") return translate(idioma, "Anúncios");
  if (fonte === "web") return "Web";
  return "X";
}

function clampPct(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.round(n));
}

function sentimentoValido(valor: unknown): SentimentoRelatorio {
  return typeof valor === "string" && SENTIMENTOS.has(valor as SentimentoRelatorio)
    ? (valor as SentimentoRelatorio)
    : "neutro";
}

function fallbackSemIa(
  params: {
    janela: JanelaPanorama;
    fonte: FontePanorama | "todas";
    termo: string;
    idioma: Idioma;
  },
  base: Awaited<ReturnType<typeof buscarBaseRelatorioPanorama>>,
  aviso?: string,
): RelatorioPanorama {
  const idioma = params.idioma;
  const top = base.por_termo.slice(0, 4).map((item) => item.termo);
  const topTxt = top.join(", ") || translate(idioma, "os termos monitorados");
  const fontes = base.por_fonte.map(
    (item) => `${rotuloFonte(item.fonte, idioma)} (${item.mencoes})`,
  );

  return {
    titulo:
      base.total === 0
        ? translate(idioma, "Nada relevante no período")
        : tituloContagem(idioma, base.total, params.janela),
    resumo:
      base.total === 0
        ? translate(
            idioma,
            "Não houve menções às palavras monitoradas neste recorte. Amplie o período ou cadastre mais fontes.",
          )
        : fontes.length
          ? translate(idioma, "Os assuntos mais citados foram {top}, principalmente em {fontes}.", {
              top: topTxt,
              fontes: fontes.join(", "),
            })
          : translate(idioma, "Os assuntos mais citados foram {top}.", { top: topTxt }),
    sentimento_geral: "neutro",
    tom: translate(
      idioma,
      "Leitura automática sem análise de tom — ative a IA para o briefing completo.",
    ),
    sentimentos: { positivo: 0, neutro: 100, negativo: 0 },
    assuntos: base.por_termo.slice(0, 6).map((item) => ({
      termo: item.termo,
      mencoes: item.mencoes,
      sentimento: "neutro" as const,
      leitura: leituraContagem(idioma, item.mencoes),
    })),
    destaques: [],
    alertas: [],
    gerado_em: new Date().toISOString(),
    janela: params.janela,
    fonte: params.fonte,
    termo: params.termo,
    total: base.total,
    por_fonte: base.por_fonte,
    ia: false,
    aviso,
  };
}

async function gerarComIa(
  params: {
    janela: JanelaPanorama;
    fonte: FontePanorama | "todas";
    termo: string;
    idioma: Idioma;
  },
  base: Awaited<ReturnType<typeof buscarBaseRelatorioPanorama>>,
): Promise<RelatorioPanorama> {
  const idioma = params.idioma;
  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: `Você é analista de monitoramento de mídia do Orbit View (rádio, YouTube, Instagram, X e anúncios no Brasil).
Escreva em ${nomeIdioma(idioma)}, direto, sem jargão de marketing.
Os nomes dos campos JSON permanecem exatamente como abaixo. O texto dos valores (titulo, resumo, tom, leitura, destaques, alertas) deve estar em ${nomeIdioma(idioma)}.
Use só o que está nos números e trechos. Não invente declaração, veículo ou fato.
Se o material for pouco ou ambíguo, diga isso no resumo.

Responda JSON com:
- titulo: manchete curta (até 90 caracteres)
- resumo: 2 ou 3 frases sobre o que rolou
- sentimento_geral: positivo | neutro | negativo | misto
- tom: uma linha sobre o tom dominante
- sentimentos: { positivo, neutro, negativo } percentuais que somam 100, estimados pelos trechos
- assuntos: até 6 itens { termo, mencoes, sentimento, leitura } (leitura = 1 frase)
- destaques: 3 a 5 bullets concretos (quem falou o quê, onde)
- alertas: só crise, ataque, desinformação ou tom hostil; senão []`,
      },
      {
        role: "user",
        content: JSON.stringify({
          periodo: rotuloJanela(params.janela, idioma),
          filtro_assunto: params.termo || null,
          filtro_veiculo: params.fonte === "todas" ? null : params.fonte,
          total_mencoes: base.total,
          por_fonte: base.por_fonte,
          por_termo: base.por_termo,
          amostra_trechos: base.trechos,
        }),
      },
    ],
    { json: true, temperature: 0.3 },
  );

  const parsed = JSON.parse(raw) as Partial<RelatorioPanorama>;
  const sentimentosBrutos = parsed.sentimentos ?? { positivo: 0, neutro: 100, negativo: 0 };
  let positivo = clampPct(sentimentosBrutos.positivo);
  let neutro = clampPct(sentimentosBrutos.neutro);
  let negativo = clampPct(sentimentosBrutos.negativo);
  const soma = positivo + neutro + negativo;
  if (soma !== 100 && soma > 0) {
    positivo = Math.round((positivo / soma) * 100);
    negativo = Math.round((negativo / soma) * 100);
    neutro = Math.max(0, 100 - positivo - negativo);
  }

  const assuntosFonte = Array.isArray(parsed.assuntos) ? parsed.assuntos : [];
  const assuntos: RelatorioAssunto[] = assuntosFonte
    .slice(0, 6)
    .map((item) => ({
      termo: String(item.termo ?? "").trim(),
      mencoes: Number(item.mencoes) || 0,
      sentimento: sentimentoValido(item.sentimento),
      leitura: String(item.leitura ?? "").trim(),
    }))
    .filter((item) => item.termo);

  if (assuntos.length === 0) {
    for (const item of base.por_termo.slice(0, 6)) {
      assuntos.push({
        termo: item.termo,
        mencoes: item.mencoes,
        sentimento: "neutro",
        leitura: leituraContagem(idioma, item.mencoes),
      });
    }
  }

  return {
    titulo: String(parsed.titulo ?? "").trim() || tituloContagem(idioma, base.total, params.janela),
    resumo: String(parsed.resumo ?? "").trim() || translate(idioma, "Não foi possível sintetizar o período."),
    sentimento_geral: sentimentoValido(parsed.sentimento_geral),
    tom: String(parsed.tom ?? "").trim(),
    sentimentos: { positivo, neutro, negativo },
    assuntos,
    destaques: Array.isArray(parsed.destaques)
      ? parsed.destaques.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
      : [],
    alertas: Array.isArray(parsed.alertas)
      ? parsed.alertas.map((item) => String(item).trim()).filter(Boolean).slice(0, 4)
      : [],
    gerado_em: new Date().toISOString(),
    janela: params.janela,
    fonte: params.fonte,
    termo: params.termo,
    total: base.total,
    por_fonte: base.por_fonte,
    ia: true,
  };
}

export async function gerarRelatorioPanorama(params: {
  janela?: JanelaPanorama;
  fonte?: FontePanorama | "todas";
  termo?: string;
  refresh?: boolean;
  idioma?: Idioma;
}): Promise<RelatorioPanorama> {
  const janela = params.janela ?? "24h";
  const fonte = params.fonte ?? "todas";
  const termo = params.termo?.trim() ?? "";
  const idioma = parseIdioma(params.idioma) ?? "pt";
  const key = chaveCache({ janela, fonte, termo, idioma });

  if (!params.refresh) {
    const hit = cache().get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.valor;

    const pending = inflight().get(key);
    if (pending) return pending;
  }

  const job = (async () => {
    const base = await buscarBaseRelatorioPanorama({ janela, fonte, termo: termo || undefined });

    if (base.total === 0) {
      return fallbackSemIa({ janela, fonte, termo, idioma }, base);
    }

    if (!isAiConfigured()) {
      return fallbackSemIa(
        { janela, fonte, termo, idioma },
        base,
        translate(idioma, "Briefing numérico — configure OPENAI_API_KEY para análise de tom e destaques."),
      );
    }

    try {
      return await gerarComIa({ janela, fonte, termo, idioma }, base);
    } catch (error) {
      return fallbackSemIa(
        { janela, fonte, termo, idioma },
        base,
        error instanceof Error
          ? error.message
          : translate(idioma, "A IA não respondeu; mostrando só os números."),
      );
    }
  })();

  inflight().set(key, job);
  try {
    const valor = await job;
    cache().set(key, { at: Date.now(), valor });
    return valor;
  } finally {
    inflight().delete(key);
  }
}
