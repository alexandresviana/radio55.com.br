const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 80;

export function getLimitePorPaginaIA(): number {
  const raw = Number(process.env.AI_BUSCA_LIMITE ?? LIMITE_PADRAO);
  if (!Number.isFinite(raw) || raw < 1) return LIMITE_PADRAO;
  return Math.min(Math.floor(raw), LIMITE_MAXIMO);
}

export function getLimiteMaximoIA(): number {
  return LIMITE_MAXIMO;
}
