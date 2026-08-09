import {
  listarMetaAdsBuscasAtivas,
  obterMetaAdPorId,
} from "@/lib/meta-ads-db";
import { registrarDeteccaoMetaAds } from "@/lib/meta-ads-deteccoes-db";
import { listarPalavrasChaveAtivas, type PalavraChave } from "@/lib/palavras-chave-db";
import { encontrarPalavrasNoTexto, normalizeText } from "@/lib/text-normalize";

const CONTEXTO_CHARS = 80;

interface TermoDeteccao {
  termo: string;
  palavraChaveId: number | null;
}

function montarContexto(textoNormalizado: string, posicao: number, termo: string): string {
  const inicio = Math.max(0, posicao - CONTEXTO_CHARS);
  const fim = Math.min(textoNormalizado.length, posicao + termo.length + CONTEXTO_CHARS);
  const prefixo = inicio > 0 ? "…" : "";
  const sufixo = fim < textoNormalizado.length ? "…" : "";
  return `${prefixo}${textoNormalizado.slice(inicio, fim).trim()}${sufixo}`;
}

function textoDoAnuncio(ad: { texto: string; titulo: string; page_name: string; cta_text: string }): string {
  return [ad.titulo, ad.texto, ad.page_name, ad.cta_text].filter(Boolean).join("\n");
}

export async function listarTermosDeteccaoMetaAds(
  palavrasCache?: PalavraChave[],
): Promise<TermoDeteccao[]> {
  const [palavras, buscas] = await Promise.all([
    Promise.resolve(palavrasCache ?? (await listarPalavrasChaveAtivas())),
    listarMetaAdsBuscasAtivas(),
  ]);

  const vistos = new Set<string>();
  const termos: TermoDeteccao[] = [];

  for (const palavra of palavras) {
    const chave = normalizeText(palavra.termo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    termos.push({ termo: palavra.termo, palavraChaveId: palavra.id });
  }

  for (const busca of buscas) {
    const chave = normalizeText(busca.termo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    termos.push({ termo: busca.termo, palavraChaveId: null });
  }

  return termos;
}

export async function registrarDeteccaoDeBuscaMetaAds(
  adDbId: number,
  termo: string,
): Promise<void> {
  const ad = await obterMetaAdPorId(adDbId);
  if (!ad) return;

  const texto = textoDoAnuncio(ad);
  const textoNormalizado = normalizeText(texto);
  const termoNormalizado = normalizeText(termo);
  const posicao = textoNormalizado.indexOf(termoNormalizado);

  const contexto =
    posicao >= 0
      ? montarContexto(textoNormalizado, posicao, termoNormalizado)
      : textoNormalizado.slice(0, CONTEXTO_CHARS * 2) +
        (textoNormalizado.length > CONTEXTO_CHARS * 2 ? "…" : "");

  await registrarDeteccaoMetaAds({
    palavraChaveId: null,
    adDbId,
    termo,
    contexto,
  });
}

export async function escanearDeteccoesMetaAd(
  adDbId: number,
  palavrasCache?: PalavraChave[],
): Promise<number> {
  const ad = await obterMetaAdPorId(adDbId);
  if (!ad) return 0;

  const texto = textoDoAnuncio(ad);
  if (!texto.trim()) return 0;

  const termos = await listarTermosDeteccaoMetaAds(palavrasCache);
  if (termos.length === 0) return 0;

  const textoNormalizado = normalizeText(texto);
  const matches = encontrarPalavrasNoTexto(
    texto,
    termos.map((t) => t.termo),
  );

  let total = 0;
  const termosVistos = new Set<string>();

  for (const match of matches) {
    if (termosVistos.has(match.termo)) continue;
    termosVistos.add(match.termo);

    const meta = termos.find((t) => t.termo === match.termo);
    const registrada = await registrarDeteccaoMetaAds({
      palavraChaveId: meta?.palavraChaveId ?? null,
      adDbId,
      termo: match.termo,
      contexto: montarContexto(
        textoNormalizado,
        match.posicao,
        normalizeText(match.termo),
      ),
    });

    if (registrada) total += 1;
  }

  return total;
}
