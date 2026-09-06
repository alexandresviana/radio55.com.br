import { encontrarPalavrasNoTexto, normalizeText } from "@/lib/text-normalize";

export const PAPEIS_ASSUNTO = ["candidato", "oponente", "aliado"] as const;

export type PapelAssunto = (typeof PAPEIS_ASSUNTO)[number];

export const PAPEIS_ASSUNTO_LABEL: Record<PapelAssunto, string> = {
  candidato: "Candidato",
  oponente: "Oponente",
  aliado: "Aliado",
};

export function parsePapel(value: unknown): PapelAssunto | null {
  if (typeof value !== "string") return null;
  const normalizado = value.trim().toLowerCase();
  return PAPEIS_ASSUNTO.find((papel) => papel === normalizado) ?? null;
}

export interface PalavraParaAncora {
  termo: string;
  papel: PapelAssunto | null;
  requer_papel: PapelAssunto | null;
}

export interface MatchComAncora<T extends { termo: string }> {
  match: T;
  ancoraTermo: string | null;
}

export function normalizarPapeis(input: {
  papel?: PapelAssunto | null;
  requerPapel?: PapelAssunto | null;
}): { papel: PapelAssunto | null; requerPapel: PapelAssunto | null } {
  const papel = input.papel ?? null;
  const requerPapel = papel ? null : (input.requerPapel ?? null);
  return { papel, requerPapel };
}

export function filtrarMatchesPorAncora<T extends { termo: string }>(
  matches: T[],
  palavras: PalavraParaAncora[],
): MatchComAncora<T>[] {
  const porTermo = new Map<string, PalavraParaAncora>();
  for (const palavra of palavras) {
    const chave = normalizeText(palavra.termo);
    if (chave) porTermo.set(chave, palavra);
  }

  const entidadesNaJanela = new Map<PapelAssunto, string>();
  for (const match of matches) {
    const palavra = porTermo.get(normalizeText(match.termo));
    if (palavra?.papel && !entidadesNaJanela.has(palavra.papel)) {
      entidadesNaJanela.set(palavra.papel, palavra.termo);
    }
  }

  const saida: MatchComAncora<T>[] = [];
  const vistos = new Set<string>();

  for (const match of matches) {
    const chave = normalizeText(match.termo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);

    const palavra = porTermo.get(chave);
    if (palavra?.requer_papel) {
      const ancoraTermo = entidadesNaJanela.get(palavra.requer_papel);
      if (!ancoraTermo) continue;
      saida.push({ match, ancoraTermo });
      continue;
    }

    saida.push({ match, ancoraTermo: null });
  }

  return saida;
}

export function resolverAncoraNoTexto(
  texto: string,
  termo: string,
  palavras: PalavraParaAncora[],
): { ok: boolean; ancoraTermo: string | null } {
  const alvo = palavras.find((item) => normalizeText(item.termo) === normalizeText(termo));
  if (!alvo?.requer_papel) return { ok: true, ancoraTermo: null };

  const matches = encontrarPalavrasNoTexto(
    texto,
    palavras.map((item) => item.termo),
  );
  const decididos = filtrarMatchesPorAncora(matches, palavras);
  const hit = decididos.find((item) => normalizeText(item.match.termo) === normalizeText(termo));
  if (!hit) return { ok: false, ancoraTermo: null };
  return { ok: true, ancoraTermo: hit.ancoraTermo };
}

export function contextoComAncora(contexto: string, ancoraTermo: string | null | undefined): string {
  const ancora = ancoraTermo?.trim();
  if (!ancora) return contexto;
  const prefixo = `${ancora} · `;
  if (contexto.startsWith(prefixo)) return contexto;
  return `${prefixo}${contexto}`;
}
