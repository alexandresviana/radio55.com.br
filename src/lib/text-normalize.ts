export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function formatMinutagem(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface KeywordMatch {
  termo: string;
  posicao: number;
}

export function encontrarPalavrasNoTexto(
  texto: string,
  palavras: string[],
): KeywordMatch[] {
  const normalizado = normalizeText(texto);
  const matches: KeywordMatch[] = [];

  for (const palavra of palavras) {
    const termo = normalizeText(palavra);
    if (!termo) continue;

    let from = 0;
    while (from < normalizado.length) {
      const index = normalizado.indexOf(termo, from);
      if (index === -1) break;

      const before = index === 0 ? " " : normalizado[index - 1];
      const after =
        index + termo.length >= normalizado.length
          ? " "
          : normalizado[index + termo.length];
      const isBoundary = (char: string) => !/[a-z0-9]/.test(char);
      const termoUnico = !termo.includes(" ");

      if (!termoUnico || (isBoundary(before) && isBoundary(after))) {
        matches.push({ termo: palavra, posicao: index });
      }

      from = index + termo.length;
    }
  }

  return matches.sort((a, b) => a.posicao - b.posicao);
}
