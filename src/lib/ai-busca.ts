import { chatCompletion, isAiConfigured } from "@/lib/ai-client";
import {
  buscarTrechosRadio,
  buscarTrechosYoutube,
  type TrechoRadioEncontrado,
  type TrechoYoutubeEncontrado,
} from "@/lib/ai-busca-db";
import type {
  ConsultaInterpretada,
  FonteCitada,
  ResultadoBuscaIA,
} from "@/lib/ai-busca-types";
import { readEmissoras } from "@/lib/emissoras";
import { listarYoutubeCanais } from "@/lib/youtube-db";

export type { ConsultaInterpretada, FonteCitada, ResultadoBuscaIA } from "@/lib/ai-busca-types";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
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
    const palavras = prompt
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((p) => p.length > 3 && !["qual", "quais", "como", "onde", "quando", "sobre", "falaram", "disse", "radio", "youtube"].includes(p));
    if (palavras.length > 0) termos.push(palavras.slice(0, 3).join(" "));
  }

  return {
    fontes: fontes.length ? fontes : ["radio", "youtube"],
    termos,
    radio_nome: parsed.radio_nome ?? null,
    municipio: parsed.municipio ?? null,
    canal_youtube: parsed.canal_youtube ?? null,
    data: parsed.data ?? null,
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

function montarFontes(
  radios: TrechoRadioEncontrado[],
  youtube: TrechoYoutubeEncontrado[],
): FonteCitada[] {
  const fontes: FonteCitada[] = [];

  radios.forEach((item, index) => {
    fontes.push({
      ref: `R${index + 1}`,
      tipo: "radio",
      titulo: `${item.radio_nome} · ${item.municipio}`,
      subtitulo: item.arquivo,
      momento: formatMomento(item.momento_iso),
      texto: item.texto,
      url: `/api/gravacoes/${item.gravacao_id}/arquivo?t=${Math.floor(item.inicio_segundos)}`,
    });
  });

  youtube.forEach((item, index) => {
    fontes.push({
      ref: `Y${index + 1}`,
      tipo: "youtube",
      titulo: item.video_titulo,
      subtitulo: item.canal_titulo,
      momento: formatMomento(item.momento_iso),
      texto: item.texto,
      url: `https://www.youtube.com/watch?v=${item.video_id}&t=${Math.floor(item.inicio_segundos)}s`,
    });
  });

  return fontes;
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

export async function executarBuscaIA(prompt: string): Promise<ResultadoBuscaIA> {
  if (!isAiConfigured()) {
    throw new Error("OPENAI_API_KEY não configurado — busca com IA indisponível");
  }

  const interpretacao = await interpretarPromptUsuario(prompt.trim());

  if (interpretacao.termos.length === 0 && !interpretacao.radio_nome && !interpretacao.data) {
    throw new Error("Não foi possível extrair termos ou filtros da pergunta");
  }

  const filtros = {
    termos: interpretacao.termos,
    radio_nome: interpretacao.radio_nome,
    municipio: interpretacao.municipio,
    canal_youtube: interpretacao.canal_youtube,
    data: interpretacao.data,
    hora_de: interpretacao.hora_de,
    hora_ate: interpretacao.hora_ate,
    limite: 20,
  };

  const buscarRadio = interpretacao.fontes.includes("radio");
  const buscarYoutube = interpretacao.fontes.includes("youtube");

  const [radios, youtube] = await Promise.all([
    buscarRadio ? buscarTrechosRadio(filtros) : Promise.resolve([]),
    buscarYoutube ? buscarTrechosYoutube(filtros) : Promise.resolve([]),
  ]);

  const fontes = montarFontes(radios, youtube);
  const resposta = await gerarResposta(prompt, interpretacao, fontes);

  let aviso: string | undefined;
  if (buscarRadio && radios.length === 0) {
    aviso =
      "Nenhum trecho de rádio encontrado. Só existem transcrições para gravações com Whisper ativo e após o deploy que passou a guardar todo o histórico.";
  }

  return { interpretacao, resposta, fontes, aviso };
}

export { isAiConfigured };
