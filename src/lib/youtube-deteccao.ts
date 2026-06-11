import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import { encontrarPalavrasNoTexto } from "@/lib/text-normalize";
import { registrarDeteccaoYoutube } from "@/lib/youtube-deteccoes-db";
import { listarSegmentosYoutube } from "@/lib/youtube-transcricoes-db";

export interface YoutubeSegmentoDeteccao {
  inicioSegundos: number;
  fimSegundos: number;
  texto: string;
}

const JANELA_SEGMENTOS = 3;

function extrairContexto(texto: string, posicao: number, termo: string): string {
  const inicio = Math.max(0, posicao - 80);
  const fim = Math.min(texto.length, posicao + termo.length + 80);
  return texto.slice(inicio, fim).trim();
}

export async function detectarPalavrasEmSegmentosYoutube(
  videoDbId: number,
  segmentos: YoutubeSegmentoDeteccao[],
): Promise<number> {
  const palavras = await listarPalavrasChaveAtivas();
  if (palavras.length === 0 || segmentos.length === 0) return 0;

  const termos = palavras.map((item) => item.termo);
  let registradas = 0;

  for (let index = 0; index < segmentos.length; index += 1) {
    const janela = segmentos.slice(index, index + JANELA_SEGMENTOS);
    const textoJanela = janela.map((item) => item.texto.trim()).filter(Boolean).join(" ");
    if (!textoJanela) continue;

    const segmentoBase = segmentos[index];
    const matches = encontrarPalavrasNoTexto(textoJanela, termos);

    for (const match of matches) {
      const palavra = palavras.find(
        (item) => item.termo.toLowerCase() === match.termo.toLowerCase(),
      );

      const deteccao = await registrarDeteccaoYoutube({
        palavraChaveId: palavra?.id ?? null,
        videoDbId,
        termo: match.termo,
        inicioSegundos: segmentoBase.inicioSegundos,
        fimSegundos: segmentoBase.fimSegundos,
        contexto: extrairContexto(textoJanela, match.posicao, match.termo),
      });

      if (deteccao) registradas += 1;
    }
  }

  return registradas;
}

export async function escanearDeteccoesVideoYoutube(videoDbId: number): Promise<number> {
  const segmentos = await listarSegmentosYoutube(videoDbId, 5000);
  if (segmentos.length === 0) return 0;

  return detectarPalavrasEmSegmentosYoutube(
    videoDbId,
    segmentos.map((item) => ({
      inicioSegundos: item.inicio_segundos,
      fimSegundos: item.fim_segundos,
      texto: item.texto,
    })),
  );
}
