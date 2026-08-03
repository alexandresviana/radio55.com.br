import { listarXBuscasAtivas, obterXPostPorId } from "@/lib/x-db";
import { registrarDeteccaoX } from "@/lib/x-deteccoes-db";
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

/** Palavras-chave globais + termos monitorados do X. */
export async function listarTermosDeteccaoX(
  palavrasCache?: PalavraChave[],
): Promise<TermoDeteccao[]> {
  const [palavras, buscas] = await Promise.all([
    Promise.resolve(palavrasCache ?? (await listarPalavrasChaveAtivas())),
    listarXBuscasAtivas(),
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

/** Post encontrado por uma busca monitorada conta como detecção do próprio termo. */
export async function registrarDeteccaoDeBuscaX(postDbId: number, termo: string): Promise<void> {
  const post = await obterXPostPorId(postDbId);
  if (!post) return;

  const textoNormalizado = normalizeText(post.texto);
  const termoNormalizado = normalizeText(termo);
  const posicao = textoNormalizado.indexOf(termoNormalizado);

  const contexto =
    posicao >= 0
      ? montarContexto(textoNormalizado, posicao, termoNormalizado)
      : textoNormalizado.slice(0, CONTEXTO_CHARS * 2) +
        (textoNormalizado.length > CONTEXTO_CHARS * 2 ? "…" : "");

  await registrarDeteccaoX({
    palavraChaveId: null,
    postDbId,
    termo,
    contexto,
  });
}

export async function escanearDeteccoesPostX(
  postDbId: number,
  palavrasCache?: PalavraChave[],
): Promise<number> {
  const post = await obterXPostPorId(postDbId);
  if (!post || !post.texto.trim()) return 0;

  const termos = await listarTermosDeteccaoX(palavrasCache);
  if (termos.length === 0) return 0;

  const textoNormalizado = normalizeText(post.texto);
  const matches = encontrarPalavrasNoTexto(
    post.texto,
    termos.map((t) => t.termo),
  );

  let total = 0;
  const termosVistos = new Set<string>();

  for (const match of matches) {
    if (termosVistos.has(match.termo)) continue;
    termosVistos.add(match.termo);

    const meta = termos.find((t) => t.termo === match.termo);
    const registrada = await registrarDeteccaoX({
      palavraChaveId: meta?.palavraChaveId ?? null,
      postDbId,
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
