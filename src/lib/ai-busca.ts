import { chatCompletion, isAiConfigured } from "@/lib/ai-client";
import { getLimitePorPaginaIA } from "@/lib/ai-busca-config";
import {
  buscarDeteccoesRadio,
  buscarTrechosRadio,
  buscarTrechosYoutube,
  contarDeteccoesRadio,
  contarTrechosRadio,
  contarTrechosYoutube,
  type TrechoRadioEncontrado,
  type TrechoYoutubeEncontrado,
} from "@/lib/ai-busca-db";
import type {
  ConsultaInterpretada,
  FonteCitada,
  ResultadoBuscaIA,
} from "@/lib/ai-busca-types";
import { normalizeText } from "@/lib/text-normalize";
import { readEmissoras } from "@/lib/emissoras";
import { listarYoutubeCanais } from "@/lib/youtube-db";

export type { ConsultaInterpretada, FonteCitada, ResultadoBuscaIA } from "@/lib/ai-busca-types";

export interface OpcoesBuscaIA {
  prompt: string;
  pagina?: number;
  interpretacao?: ConsultaInterpretada;
}

type TrechoEncontrado = TrechoRadioEncontrado | TrechoYoutubeEncontrado;

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Extrai datas no formato DD/MM ou DD/MM/AAAA do prompt. */
function extrairDataDoPrompt(prompt: string): string | null {
  const match = prompt.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (!match) return null;

  const dia = Number(match[1]);
  const mes = Number(match[2]);
  let ano = match[3] ? Number(match[3]) : new Date().getFullYear();
  if (ano < 100) ano += 2000;

  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;

  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Extrai nome/tema após "de/sobre" antes de "no dia/em". */
function extrairTermosDoPrompt(prompt: string): string[] {
  const termos: string[] = [];

  const nomeMatch = prompt.match(
    /(?:de|sobre)\s+(.+?)(?:\s+no\s+dia|\s+em\s+\d|\s+na\s+r[aá]dio|\?|$)/i,
  );
  if (nomeMatch?.[1]) {
    const nome = nomeMatch[1].trim().replace(/[?.!,]+$/, "");
    if (nome.length > 2) termos.push(nome);
  }

  return termos;
}

function mesclarTrechosRadio(
  segmentos: TrechoRadioEncontrado[],
  deteccoes: TrechoRadioEncontrado[],
): TrechoRadioEncontrado[] {
  const vistos = new Set<string>();
  const resultado: TrechoRadioEncontrado[] = [];

  for (const item of [...segmentos, ...deteccoes]) {
    const chave = `${item.gravacao_id}:${Math.floor(item.inicio_segundos / 3)}:${normalizeText(item.texto).slice(0, 80)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(item);
  }

  return resultado.sort(
    (a, b) => new Date(b.momento_iso).getTime() - new Date(a.momento_iso).getTime(),
  );
}

async function listarRadiosCadastradas(): Promise<{ municipio: string; nome: string }[]> {
  const emissoras = await readEmissoras();
  const lista: { municipio: string; nome: string }[] = [];

  for (const [municipio, data] of Object.entries(emissoras)) {
    for (const radio of data.radios) {
      if (radio.gravar) {
        lista.push({ municipio, nome: radio.nome });
      }
    }
  }

  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function interpretarPromptUsuario(prompt: string): Promise<ConsultaInterpretada> {
  const [radios, canais] = await Promise.all([listarRadiosCadastradas(), listarYoutubeCanais()]);

  const radiosTexto = radios.map((r) => `${r.nome} (${r.municipio})`).join("; ") || "nenhuma";
  const canaisTexto = canais.map((c) => c.titulo).join("; ") || "nenhum";

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: `Você interpreta perguntas em português sobre transcrições de rádios e YouTube.
Data de hoje: ${hojeIso()}.

Rádios com gravação ativa: ${radiosTexto}
Canais YouTube monitorados: ${canaisTexto}

Retorne JSON com:
- fontes: array com "radio" e/ou "youtube" (ambos se não especificado)
- termos: palavras/expressões para buscar no texto (substantivos, nomes, temas — sem stopwords)
- radio_nome: nome parcial da rádio ou null
- municipio: município ou null
- canal_youtube: nome parcial do canal ou null
- data: YYYY-MM-DD ou null
- hora_de: HH:MM (24h) ou null
- hora_ate: HH:MM (24h) ou null
- intencao: resumo curto do que o usuário quer saber

Use null quando o filtro não for mencionado. Inferir data relativa ("hoje", "ontem") a partir de ${hojeIso()}.`,
      },
      { role: "user", content: prompt },
    ],
    { json: true },
  );

  const parsed = JSON.parse(raw) as Partial<ConsultaInterpretada>;

  const fontesRaw = Array.isArray(parsed.fontes) ? parsed.fontes : [];
  const fontes = fontesRaw.filter((f): f is "radio" | "youtube" => f === "radio" || f === "youtube");

  const termos = Array.isArray(parsed.termos)
    ? parsed.termos.map(String).filter((t) => t.trim().length > 1)
    : [];

  if (termos.length === 0) {
    termos.push(...extrairTermosDoPrompt(prompt));
  }

  if (termos.length === 0) {
    const palavras = prompt
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(
        (p) =>
          p.length > 3 &&
          ![
            "qual",
            "quais",
            "como",
            "onde",
            "quando",
            "sobre",
            "falaram",
            "disse",
            "radio",
            "youtube",
            "dia",
          ].includes(p),
      );
    if (palavras.length > 0) termos.push(palavras.slice(0, 4).join(" "));
  }

  const dataPrompt = extrairDataDoPrompt(prompt);

  return {
    fontes: fontes.length ? fontes : ["radio", "youtube"],
    termos,
    radio_nome: parsed.radio_nome ?? null,
    municipio: parsed.municipio ?? null,
    canal_youtube: parsed.canal_youtube ?? null,
    data: dataPrompt ?? parsed.data ?? null,
    hora_de: parsed.hora_de ?? null,
    hora_ate: parsed.hora_ate ?? null,
    intencao: parsed.intencao ?? prompt,
  };
}

function formatMomento(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mesclarPorMomento(
  radios: TrechoRadioEncontrado[],
  youtube: TrechoYoutubeEncontrado[],
): TrechoEncontrado[] {
  return [...radios, ...youtube].sort((a, b) => {
    const ta = a.momento_iso ? new Date(a.momento_iso).getTime() : 0;
    const tb = b.momento_iso ? new Date(b.momento_iso).getTime() : 0;
    return tb - ta;
  });
}

function montarFontesPagina(itens: TrechoEncontrado[]): FonteCitada[] {
  let indiceRadio = 0;
  let indiceYoutube = 0;

  return itens.map((item) => {
    if (item.tipo === "radio") {
      indiceRadio += 1;
      return {
        ref: `R${indiceRadio}`,
        tipo: "radio" as const,
        titulo: `${item.radio_nome} · ${item.municipio}`,
        subtitulo: item.termo_detectado
          ? `Alerta: ${item.termo_detectado} · ${item.arquivo}`
          : item.arquivo,
        momento: formatMomento(item.momento_iso),
        texto: item.texto,
        url: `/api/gravacoes/${item.gravacao_id}/arquivo?t=${Math.floor(item.inicio_segundos)}`,
      };
    }

    indiceYoutube += 1;
    return {
      ref: `Y${indiceYoutube}`,
      tipo: "youtube" as const,
      titulo: item.video_titulo,
      subtitulo: item.canal_titulo,
      momento: formatMomento(item.momento_iso),
      texto: item.texto,
      url: `https://www.youtube.com/watch?v=${item.video_id}&t=${Math.floor(item.inicio_segundos)}s`,
    };
  });
}

async function gerarResposta(
  prompt: string,
  interpretacao: ConsultaInterpretada,
  fontes: FonteCitada[],
): Promise<string> {
  if (fontes.length === 0) {
    return "Não encontrei trechos transcritos que correspondam à sua pergunta com os filtros interpretados. Tente ampliar o intervalo de datas, verificar o nome da emissora ou usar termos diferentes.";
  }

  const contexto = fontes
    .map(
      (f) =>
        `[${f.ref}] (${f.tipo === "radio" ? "Rádio" : "YouTube"}) ${f.titulo} — ${f.momento}\n"${f.texto}"`,
    )
    .join("\n\n");

  return chatCompletion([
    {
      role: "system",
      content: `Você é assistente do portal Rádio 55 (Sergipe). Responda em português do Brasil, de forma clara e jornalística.
Use APENAS os trechos fornecidos. Cite fontes como [R1], [Y2] etc.
Se os trechos forem insuficientes, diga isso explicitamente.
Não invente fatos.`,
    },
    {
      role: "user",
      content: `Pergunta: ${prompt}

Intenção interpretada: ${interpretacao.intencao}

Trechos encontrados:
${contexto}`,
    },
  ]);
}

export async function executarBuscaIA(opts: OpcoesBuscaIA): Promise<ResultadoBuscaIA> {
  if (!isAiConfigured()) {
    throw new Error("OPENAI_API_KEY não configurado — busca com IA indisponível");
  }

  const prompt = opts.prompt.trim();
  const pagina = Math.max(0, opts.pagina ?? 0);
  const porPagina = getLimitePorPaginaIA();

  const interpretacao =
    opts.interpretacao ?? (await interpretarPromptUsuario(prompt));

  if (interpretacao.termos.length === 0 && !interpretacao.radio_nome && !interpretacao.data) {
    throw new Error("Não foi possível extrair termos ou filtros da pergunta");
  }

  const filtrosBase = {
    termos: interpretacao.termos,
    radio_nome: interpretacao.radio_nome,
    municipio: interpretacao.municipio,
    canal_youtube: interpretacao.canal_youtube,
    data: interpretacao.data,
    hora_de: interpretacao.hora_de,
    hora_ate: interpretacao.hora_ate,
  };

  const buscarRadio = interpretacao.fontes.includes("radio");
  const buscarYoutube = interpretacao.fontes.includes("youtube");
  const fetchSize = Math.min(800, Math.max(porPagina, (pagina + 1) * porPagina * 2));

  async function buscarRadioMesclado(data: string | null) {
    const filtros = { ...filtrosBase, data, limite: fetchSize, offset: 0 };
    const [segmentos, deteccoes] = await Promise.all([
      buscarTrechosRadio(filtros),
      buscarDeteccoesRadio(filtros),
    ]);
    return mesclarTrechosRadio(segmentos, deteccoes);
  }

  let radios = buscarRadio ? await buscarRadioMesclado(filtrosBase.data) : [];
  let youtube = buscarYoutube
    ? await buscarTrechosYoutube({ ...filtrosBase, limite: fetchSize, offset: 0 })
    : [];

  if (buscarRadio && radios.length === 0 && filtrosBase.data) {
    radios = await buscarRadioMesclado(null);
    if (radios.length > 0) {
      interpretacao.data = null;
    }
  }

  const mesclado = mesclarPorMomento(radios, youtube);
  const inicio = pagina * porPagina;
  const fim = inicio + porPagina;
  const itensPagina = mesclado.slice(inicio, fim);

  const [countSegmentos, countDeteccoes, countYoutube] = await Promise.all([
    buscarRadio ? contarTrechosRadio(filtrosBase) : Promise.resolve(0),
    buscarRadio ? contarDeteccoesRadio(filtrosBase) : Promise.resolve(0),
    buscarYoutube ? contarTrechosYoutube(filtrosBase) : Promise.resolve(0),
  ]);

  const totalRadio = countSegmentos + countDeteccoes;
  const totalYoutube = countYoutube;
  const totalEstimado = totalRadio + totalYoutube;
  const total =
    mesclado.length < fetchSize ? mesclado.length : Math.min(800, totalEstimado);
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  const fontes = montarFontesPagina(itensPagina);
  const resposta =
    pagina === 0 ? await gerarResposta(prompt, interpretacao, fontes) : "";

  let aviso: string | undefined;
  if (buscarRadio && totalRadio === 0) {
    aviso =
      "Nenhum trecho encontrado nas transcrições nem nos alertas de palavras-chave para os filtros usados.";
  } else if (buscarRadio && itensPagina.some((i) => i.tipo === "radio" && i.termo_detectado)) {
    aviso =
      "Parte dos resultados veio dos alertas de palavras-chave (transcrição completa pode não estar salva para essa data).";
  } else if (mesclado.length >= fetchSize && totalEstimado > mesclado.length) {
    aviso = `Mostrando até ${fetchSize} trechos mais recentes; o total pode ser maior (${totalEstimado} ocorrências brutas).`;
  }

  return {
    interpretacao,
    resposta,
    fontes,
    aviso,
    pagina,
    porPagina,
    total,
    totalPaginas,
    totalRadio,
    totalYoutube,
  };
}

export { isAiConfigured, getLimitePorPaginaIA };
