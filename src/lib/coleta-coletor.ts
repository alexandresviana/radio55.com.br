import { fonteVencida, getApifyToken } from "@/lib/apify-guard";
import {
  aguardarColetaConcluida,
  desativarFontesSumidas,
  haPedidoColetaForcada,
  isColetaCompartilhada,
  isColetaSomenteConsumir,
  listarFontesAtivas,
  marcarColetaConcluida,
  marcarColetaIniciada,
  marcarFonteVerificada,
  solicitarColetaForcada,
  upsertColetaInstagramPost,
  upsertColetaMetaAd,
  upsertColetaXPost,
  withColetorLock,
  type ColetaFonte,
} from "@/lib/coleta-db";
import {
  coletarPostsInstagram,
  isInstagramFetchConfigured,
  urlHashtagInstagram,
  urlPerfilInstagram,
} from "@/lib/instagram-fetch";
import {
  coletarAnunciosMeta,
  isMetaAdsFetchConfigured,
  urlBuscaBibliotecaAds,
  urlPaginaFacebook,
} from "@/lib/meta-ads-fetch";
import { coletarTweetsX, isXFetchConfigured } from "@/lib/x-fetch";

const IG_SYNC_MS = () => minutosEnv("INSTAGRAM_SYNC_MINUTOS", 360);
const X_SYNC_MS = () => minutosEnv("X_SYNC_MINUTOS", 360);
const META_SYNC_MS = () => minutosEnv("META_ADS_SYNC_MINUTOS", 720);

function minutosEnv(nome: string, padrao: number): number {
  const raw = Number(process.env[nome] ?? padrao);
  const minutos = Number.isFinite(raw) && raw >= 5 ? raw : padrao;
  return minutos * 60 * 1000;
}

function limiteEnv(nome: string, padrao: number, min: number, max: number): number {
  const raw = Number(process.env[nome] ?? padrao);
  return Number.isFinite(raw) && raw >= min ? Math.min(Math.floor(raw), max) : padrao;
}

function vencidas(fontes: ColetaFonte[], intervaloMs: number, forcar: boolean): ColetaFonte[] {
  return forcar ? fontes : fontes.filter((f) => fonteVencida(f.ultima_verificacao_em, intervaloMs));
}

export function podeColetarApify(): boolean {
  return (
    isColetaCompartilhada() &&
    !isColetaSomenteConsumir() &&
    Boolean(getApifyToken())
  );
}

export async function executarColetaApifyUnificada(
  opts?: { forcar?: boolean },
): Promise<"ok" | "ocupado" | "pulado"> {
  if (!podeColetarApify()) return "pulado";

  const resultado = await withColetorLock(async () => {
    await marcarColetaIniciada();
    try {
      const sumidas = await desativarFontesSumidas();
      if (sumidas > 0) {
        console.info(`[coleta] ${sumidas} fonte(s) sem tenant há 7d — desativadas`);
      }

      const forcar = opts?.forcar === true;
      await coletarInstagramUnificado(forcar);
      await coletarXUnificado(forcar);
      await coletarMetaUnificado(forcar);
      await marcarColetaConcluida(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha na coleta";
      await marcarColetaConcluida(message);
      throw error;
    }
  });

  if (resultado === "ocupado") {
    console.info("[coleta] outro processo já está coletando — aguardando");
    return "ocupado";
  }
  return "ok";
}

let syncForcadoEmAndamento: Promise<void> | null = null;

/** No coletor, roda a Apify. No consumidor, pede e espera o coletor terminar. */
export async function garantirColetaAtualizada(opts?: { forcar?: boolean }): Promise<void> {
  if (!isColetaCompartilhada() || !opts?.forcar) return;
  if (syncForcadoEmAndamento) return syncForcadoEmAndamento;

  syncForcadoEmAndamento = (async () => {
    const pedido = await solicitarColetaForcada();
    if (podeColetarApify()) {
      const resultado = await executarColetaApifyUnificada({ forcar: true });
      if (resultado === "ok") return;
    }
    const ok = await aguardarColetaConcluida(pedido);
    if (!ok) {
      throw new Error("A atualização está demorando. Tente de novo em alguns minutos.");
    }
  })().finally(() => {
    syncForcadoEmAndamento = null;
  });

  return syncForcadoEmAndamento;
}

export async function coletarSeHouverPedidoForcado(): Promise<void> {
  if (!podeColetarApify()) return;
  if (!(await haPedidoColetaForcada())) return;
  await executarColetaApifyUnificada({ forcar: true });
}

async function coletarInstagramUnificado(forcar: boolean): Promise<void> {
  if (!isInstagramFetchConfigured()) return;

  const perfis = vencidas(
    await listarFontesAtivas("instagram_perfil"),
    IG_SYNC_MS(),
    forcar,
  );
  const hashtags = vencidas(
    await listarFontesAtivas("instagram_hashtag"),
    IG_SYNC_MS() * 2,
    forcar,
  );
  if (perfis.length === 0 && hashtags.length === 0) return;

  try {
    const posts = await coletarPostsInstagram(
      {
        perfis: perfis.map((f) => f.chave),
        termos: hashtags.map((f) => f.chave),
      },
      {
        limitePorFonte: limiteEnv("INSTAGRAM_POSTS_POR_PERFIL", 3, 1, 50),
        apenasMaisRecentesQue: forcar ? "7 days" : "12 hours",
      },
    );

    const perfilSet = new Set(perfis.map((f) => f.chave));
    const hashtagSet = new Set(hashtags.map((f) => f.chave));

    for (const post of posts) {
      const input = (post.inputUrl ?? "").toLowerCase();
      const fonteHashtag = [...hashtagSet].find(
        (h) => input.includes(`/tags/${h}`) || input === urlHashtagInstagram(h).toLowerCase(),
      );
      const fontePerfil = [...perfilSet].find(
        (u) =>
          post.ownerUsername === u ||
          input.includes(`instagram.com/${u}`) ||
          input === urlPerfilInstagram(u).toLowerCase(),
      );

      await upsertColetaInstagramPost({
        post_id: post.postId,
        short_code: post.shortCode,
        url: post.url,
        tipo: post.tipo,
        legenda: post.legenda,
        publicado_em: post.publicadoEm,
        owner_username: post.ownerUsername,
        video_url: post.videoUrl,
        imagem_url: post.imagemUrl,
        curtidas: post.curtidas,
        comentarios: post.comentarios,
        fonte_plataforma: fonteHashtag ? "instagram_hashtag" : "instagram_perfil",
        fonte_chave: fonteHashtag ?? fontePerfil ?? post.ownerUsername,
      });
    }

    for (const fonte of [...perfis, ...hashtags]) {
      await marcarFonteVerificada(fonte.id, null);
    }
    console.info(
      `[coleta] Instagram: ${posts.length} post(s) de ${perfis.length} perfil(is) + ${hashtags.length} hashtag(s)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha Instagram";
    console.error("[coleta]", message);
    for (const fonte of [...perfis, ...hashtags]) {
      await marcarFonteVerificada(fonte.id, message);
    }
  }
}

async function coletarXUnificado(forcar: boolean): Promise<void> {
  if (!isXFetchConfigured()) return;

  const termos = vencidas(await listarFontesAtivas("x_termo"), X_SYNC_MS(), forcar);
  if (termos.length === 0) return;

  try {
    const tweets = await coletarTweetsX(
      termos.map((f) => f.chave),
      { limiteTotal: limiteEnv("X_TWEETS_POR_CICLO", 8, 5, 200) },
    );

    for (const tweet of tweets) {
      await upsertColetaXPost({
        tweet_id: tweet.tweetId,
        url: tweet.url,
        texto: tweet.texto,
        autor_username: tweet.autorUsername,
        autor_nome: tweet.autorNome,
        publicado_em: tweet.publicadoEm,
        imagem_url: tweet.imagemUrl,
        curtidas: tweet.curtidas,
        retweets: tweet.retweets,
        respostas: tweet.respostas,
        search_term: (tweet.searchTerm || "").toLowerCase(),
      });
    }

    for (const fonte of termos) {
      await marcarFonteVerificada(fonte.id, null);
    }
    console.info(`[coleta] X: ${tweets.length} post(s) de ${termos.length} termo(s)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha X";
    console.error("[coleta]", message);
    for (const fonte of termos) {
      await marcarFonteVerificada(fonte.id, message);
    }
  }
}

async function coletarMetaUnificado(forcar: boolean): Promise<void> {
  if (!isMetaAdsFetchConfigured()) return;

  const buscas = vencidas(await listarFontesAtivas("meta_termo"), META_SYNC_MS(), forcar);
  const paginas = vencidas(await listarFontesAtivas("meta_pagina"), META_SYNC_MS(), forcar);
  if (buscas.length === 0 && paginas.length === 0) return;

  const urls = [
    ...buscas.map((f) => urlBuscaBibliotecaAds(f.chave)),
    ...paginas.map((f) => urlPaginaFacebook(f.chave)),
  ];

  try {
    const anuncios = await coletarAnunciosMeta(urls, {
      limiteTotal: limiteEnv("META_ADS_POR_CICLO", 5, 5, 200),
    });

    const termoSet = new Set(buscas.map((f) => f.chave));
    const paginaSet = new Set(paginas.map((f) => f.chave));

    for (const anuncio of anuncios) {
      const termo = (anuncio.searchTerm ?? "").toLowerCase();
      const pagina =
        [...paginaSet].find(
          (p) =>
            anuncio.pageId === p ||
            anuncio.pageProfileUri.toLowerCase().includes(p) ||
            anuncio.inputUrl.toLowerCase().includes(p),
        ) ?? "";

      await upsertColetaMetaAd({
        ad_archive_id: anuncio.adArchiveId,
        url: anuncio.url,
        page_id: anuncio.pageId,
        page_name: anuncio.pageName,
        page_profile_uri: anuncio.pageProfileUri,
        texto: anuncio.texto,
        titulo: anuncio.titulo,
        cta_text: anuncio.ctaText,
        link_url: anuncio.linkUrl,
        imagem_url: anuncio.imagemUrl,
        video_url: anuncio.videoUrl,
        inicio_em: anuncio.inicioEm,
        fim_em: anuncio.fimEm,
        search_term: termo || null,
        fonte_chave: (termoSet.has(termo) ? termo : pagina) || termo || pagina,
      });
    }

    for (const fonte of [...buscas, ...paginas]) {
      await marcarFonteVerificada(fonte.id, null);
    }
    console.info(
      `[coleta] Meta: ${anuncios.length} anúncio(s) de ${buscas.length} termo(s) + ${paginas.length} página(s)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha Meta";
    console.error("[coleta]", message);
    for (const fonte of [...buscas, ...paginas]) {
      await marcarFonteVerificada(fonte.id, message);
    }
  }
}
