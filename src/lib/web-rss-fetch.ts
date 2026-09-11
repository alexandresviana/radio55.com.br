const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; OrbitView/1.0; +https://radio55.com.br)";

const FEEDS_COMUNS = [
  "/feed",
  "/rss",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feeds/posts/default",
];

export interface ArtigoRss {
  url: string;
  titulo: string;
  fonte: string;
  dominio: string;
  publicadoEm: Date | null;
  snippet: string;
  imagemUrl: string | null;
}

export interface FeedDescoberto {
  feedUrl: string;
  titulo: string;
  dominio: string;
  urlEntrada: string;
}

export function normalizarUrl(entrada: string): string {
  const raw = entrada.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

export function extrairDominio(url: string): string {
  try {
    return new URL(normalizarUrl(url)).host.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function chaveFonteWebSite(dominio: string, feedUrl: string): string {
  return `${dominio.trim().toLowerCase()}||${feedUrl.trim()}`;
}

export function parseChaveFonteWebSite(chave: string): {
  dominio: string;
  feedUrl: string;
} {
  const idx = chave.indexOf("||");
  if (idx >= 0) {
    return {
      dominio: chave.slice(0, idx).toLowerCase(),
      feedUrl: chave.slice(idx + 2),
    };
  }
  if (chave.includes("://")) {
    return { dominio: extrairDominio(chave), feedUrl: chave };
  }
  return { dominio: chave.toLowerCase(), feedUrl: `https://${chave}` };
}

function decodificarXml(valor: string): string {
  return valor
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function atributo(tag: string, nome: string): string {
  const match = tag.match(new RegExp(`${nome}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim() ?? "";
}

function primeiraTag(bloco: string, nomes: string[]): string {
  for (const nome of nomes) {
    const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i");
    const match = bloco.match(re);
    if (match?.[1]) return decodificarXml(match[1]);
    const self = bloco.match(new RegExp(`<${nome}([^>]*)/?>`, "i"));
    if (self?.[1]) {
      const href = atributo(self[0], "href") || atributo(self[0], "url");
      if (href) return href;
    }
  }
  return "";
}

function ehFeed(xml: string): boolean {
  return /<(rss|feed|rdf:RDF)\b/i.test(xml);
}

function tituloDoFeed(xml: string): string {
  const canal = xml.match(/<channel\b[\s\S]*?<\/channel>/i)?.[0] ?? xml;
  return primeiraTag(canal, ["title"]) || "";
}

async function baixar(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} em ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function feedsNoHtml(html: string, baseUrl: string): string[] {
  const encontrados: string[] = [];
  const re =
    /<link\b[^>]*rel=["'][^"']*alternate[^"']*["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const tag = match[0];
    const type = atributo(tag, "type").toLowerCase();
    if (
      type &&
      !type.includes("rss") &&
      !type.includes("atom") &&
      !type.includes("xml")
    ) {
      continue;
    }
    const href = atributo(tag, "href");
    if (!href) continue;
    try {
      encontrados.push(new URL(href, baseUrl).toString());
    } catch {
      // ignora href inválido
    }
  }
  return [...new Set(encontrados)];
}

export async function descobrirFeed(entrada: string): Promise<FeedDescoberto> {
  const urlEntrada = normalizarUrl(entrada);
  if (!urlEntrada) {
    throw new Error("Informe a URL do site ou do feed RSS");
  }

  const dominio = extrairDominio(urlEntrada);
  if (!dominio) {
    throw new Error("URL inválida");
  }

  const candidatos: string[] = [urlEntrada];
  let origem: URL;
  try {
    origem = new URL(urlEntrada);
  } catch {
    throw new Error("URL inválida");
  }

  const corpoInicial = await baixar(urlEntrada).catch(() => "");
  if (corpoInicial && ehFeed(corpoInicial)) {
    return {
      feedUrl: urlEntrada,
      titulo: tituloDoFeed(corpoInicial) || dominio,
      dominio,
      urlEntrada: `${origem.protocol}//${origem.host}`,
    };
  }

  if (corpoInicial) {
    candidatos.push(...feedsNoHtml(corpoInicial, urlEntrada));
  }

  for (const caminho of FEEDS_COMUNS) {
    candidatos.push(new URL(caminho, `${origem.protocol}//${origem.host}`).toString());
  }

  const vistos = new Set<string>();
  for (const candidato of candidatos) {
    const chave = candidato.toLowerCase();
    if (vistos.has(chave) || chave === urlEntrada.toLowerCase()) continue;
    vistos.add(chave);
    try {
      const xml = await baixar(candidato);
      if (!ehFeed(xml)) continue;
      return {
        feedUrl: candidato,
        titulo: tituloDoFeed(xml) || dominio,
        dominio,
        urlEntrada: `${origem.protocol}//${origem.host}`,
      };
    } catch {
      // tenta o próximo
    }
  }

  throw new Error(
    "Não encontramos um feed RSS neste site. Cole a URL do feed (ex.: /feed ou /rss.xml).",
  );
}

export async function coletarFeedRss(
  feedUrl: string,
  opts: { dominio?: string; fonte?: string; limite?: number } = {},
): Promise<ArtigoRss[]> {
  const xml = await baixar(feedUrl);
  if (!ehFeed(xml)) {
    throw new Error("O endereço não devolveu um feed RSS/Atom válido");
  }

  const dominio = (opts.dominio || extrairDominio(feedUrl)).toLowerCase();
  const fonte = opts.fonte || tituloDoFeed(xml) || dominio;
  const limite = Math.min(Math.max(opts.limite ?? 25, 1), 80);

  const blocos =
    xml.match(/<item\b[\s\S]*?<\/item>/gi) ??
    xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ??
    [];

  const artigos: ArtigoRss[] = [];
  const vistos = new Set<string>();

  for (const bloco of blocos) {
    const link =
      primeiraTag(bloco, ["link"]) ||
      atributo(bloco.match(/<link\b[^>]*>/i)?.[0] ?? "", "href");
    const url = link ? normalizarUrl(link) : "";
    if (!url || vistos.has(url)) continue;
    vistos.add(url);

    const publicadoRaw = primeiraTag(bloco, [
      "pubDate",
      "published",
      "updated",
      "dc:date",
    ]);
    const publicado = publicadoRaw ? new Date(publicadoRaw) : null;

    artigos.push({
      url,
      titulo: primeiraTag(bloco, ["title"]),
      fonte,
      dominio,
      publicadoEm:
        publicado && !Number.isNaN(publicado.getTime()) ? publicado : null,
      snippet: primeiraTag(bloco, ["description", "summary", "content"]),
      imagemUrl: null,
    });

    if (artigos.length >= limite) break;
  }

  return artigos;
}
