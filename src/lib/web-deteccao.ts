import {
  contextoComAncora,
  filtrarMatchesPorAncora,
  resolverAncoraNoTexto,
} from "@/lib/assunto-papel";
import { listarPalavrasChaveAtivas, type PalavraChave } from "@/lib/palavras-chave-db";
import { encontrarPalavrasNoTexto, normalizeText } from "@/lib/text-normalize";
import { obterPublicacaoWebPorId } from "@/lib/web-db";
import { registrarDeteccaoWeb } from "@/lib/web-deteccoes-db";

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

/** Termos a monitorar: todas as palavras-chave ativas (não há tabela web_buscas). */
export async function listarTermosDeteccaoWeb(
  palavrasCache?: PalavraChave[],
): Promise<TermoDeteccao[]> {
  const palavras = palavrasCache ?? (await listarPalavrasChaveAtivas());
  const vistos = new Set<string>();
  const termos: TermoDeteccao[] = [];

  for (const palavra of palavras) {
    const chave = normalizeText(palavra.termo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    termos.push({ termo: palavra.termo, palavraChaveId: palavra.id });
  }

  return termos;
}

/** Um artigo puxado por um termo conta como detecção desse termo. */
export async function registrarDeteccaoDoTermoWeb(
  publicacaoId: number,
  termo: string,
  palavrasCache?: PalavraChave[],
): Promise<void> {
  const pub = await obterPublicacaoWebPorId(publicacaoId);
  if (!pub) return;

  const palavras = palavrasCache ?? (await listarPalavrasChaveAtivas());
  const texto = `${pub.titulo} — ${pub.snippet}`;
  const ancora = resolverAncoraNoTexto(texto, termo, palavras);
  if (!ancora.ok) return;

  const textoNormalizado = normalizeText(texto);
  const termoNormalizado = normalizeText(termo);
  const posicao = textoNormalizado.indexOf(termoNormalizado);

  const contexto =
    posicao >= 0
      ? montarContexto(textoNormalizado, posicao, termoNormalizado)
      : textoNormalizado.slice(0, CONTEXTO_CHARS * 2) +
        (textoNormalizado.length > CONTEXTO_CHARS * 2 ? "…" : "");

  const palavra = palavras.find((p) => normalizeText(p.termo) === normalizeText(termo));

  await registrarDeteccaoWeb({
    palavraChaveId: palavra?.id ?? null,
    publicacaoId,
    termo,
    contexto: contextoComAncora(contexto, ancora.ancoraTermo),
    ancoraTermo: ancora.ancoraTermo,
  });
}

export async function escanearDeteccoesPublicacaoWeb(
  publicacaoId: number,
  palavrasCache?: PalavraChave[],
): Promise<number> {
  const pub = await obterPublicacaoWebPorId(publicacaoId);
  if (!pub) return 0;

  const texto = `${pub.titulo} — ${pub.snippet}`;
  if (!texto.trim()) return 0;

  const palavras = palavrasCache ?? (await listarPalavrasChaveAtivas());
  const termos = await listarTermosDeteccaoWeb(palavras);
  if (termos.length === 0) return 0;

  const textoNormalizado = normalizeText(texto);
  const matches = filtrarMatchesPorAncora(
    encontrarPalavrasNoTexto(
      texto,
      termos.map((t) => t.termo),
    ),
    palavras,
  );

  let total = 0;
  for (const { match, ancoraTermo } of matches) {
    const meta = termos.find((t) => t.termo === match.termo);
    const registrada = await registrarDeteccaoWeb({
      palavraChaveId: meta?.palavraChaveId ?? null,
      publicacaoId,
      termo: match.termo,
      contexto: contextoComAncora(
        montarContexto(textoNormalizado, match.posicao, normalizeText(match.termo)),
        ancoraTermo,
      ),
      ancoraTermo,
    });
    if (registrada) total += 1;
  }
  return total;
}
