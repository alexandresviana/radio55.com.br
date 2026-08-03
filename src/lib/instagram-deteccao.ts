import { obterComentarioInstagramPorId } from "@/lib/instagram-comentarios-db";
import { listarInstagramBuscasAtivas, obterInstagramPostPorId } from "@/lib/instagram-db";
import { registrarDeteccaoInstagram } from "@/lib/instagram-deteccoes-db";
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

/** Palavras-chave globais + termos monitorados do Instagram (frases e hashtags). */
export async function listarTermosDeteccaoInstagram(
  palavrasCache?: PalavraChave[],
): Promise<TermoDeteccao[]> {
  const [palavras, buscas] = await Promise.all([
    Promise.resolve(palavrasCache ?? (await listarPalavrasChaveAtivas())),
    listarInstagramBuscasAtivas(),
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

/**
 * Publicação encontrada por uma hashtag monitorada conta como detecção
 * do próprio termo, mesmo que ele não apareça literalmente na legenda.
 */
export async function registrarDeteccaoDeBusca(
  postDbId: number,
  termo: string,
): Promise<void> {
  const post = await obterInstagramPostPorId(postDbId);
  if (!post) return;

  const legendaNormalizada = normalizeText(post.legenda);
  const termoNormalizado = normalizeText(termo);
  const posicao = legendaNormalizada.indexOf(termoNormalizado);
  const rotulo = /\s/.test(termo) ? termo : `#${termo}`;

  const contexto =
    posicao >= 0
      ? montarContexto(legendaNormalizada, posicao, termoNormalizado)
      : legendaNormalizada.slice(0, CONTEXTO_CHARS * 2) +
        (legendaNormalizada.length > CONTEXTO_CHARS * 2 ? "…" : "");

  await registrarDeteccaoInstagram({
    palavraChaveId: null,
    postDbId,
    termo: rotulo,
    contexto,
  });
}

async function registrarMatches(
  texto: string,
  termos: TermoDeteccao[],
  opts: { postDbId: number; comentarioDbId?: number },
): Promise<number> {
  if (!texto.trim() || termos.length === 0) return 0;

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
    const registrada = await registrarDeteccaoInstagram({
      palavraChaveId: meta?.palavraChaveId ?? null,
      postDbId: opts.postDbId,
      comentarioDbId: opts.comentarioDbId,
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

/** Varre a legenda de uma publicação. Retorna nº de detecções registradas. */
export async function escanearDeteccoesPostInstagram(
  postDbId: number,
  palavrasCache?: PalavraChave[],
): Promise<number> {
  const post = await obterInstagramPostPorId(postDbId);
  if (!post || !post.legenda.trim()) return 0;

  const termos = await listarTermosDeteccaoInstagram(palavrasCache);
  return registrarMatches(post.legenda, termos, { postDbId });
}

/** Varre o texto de um comentário. Retorna nº de detecções registradas. */
export async function escanearDeteccoesComentarioInstagram(
  comentarioDbId: number,
  palavrasCache?: PalavraChave[],
): Promise<number> {
  const comentario = await obterComentarioInstagramPorId(comentarioDbId);
  if (!comentario || !comentario.texto.trim()) return 0;

  const termos = await listarTermosDeteccaoInstagram(palavrasCache);
  return registrarMatches(comentario.texto, termos, {
    postDbId: comentario.post_db_id,
    comentarioDbId,
  });
}
