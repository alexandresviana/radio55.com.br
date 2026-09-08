import {
  isColetaCompartilhada,
  listarInstagramPostsCompartilhados,
  listarMetaAdsCompartilhados,
  listarXPostsCompartilhados,
  upsertColetaFonte,
} from "@/lib/coleta-db";
import {
  escanearDeteccoesPostInstagram,
  registrarDeteccaoDeBusca,
} from "@/lib/instagram-deteccao";
import {
  listarInstagramBuscasAtivas,
  listarInstagramPerfisAtivos,
  marcarBuscaVerificada,
  marcarPerfilVerificado,
  registrarPostInstagram,
} from "@/lib/instagram-db";
import { termoInstagramEhHashtag } from "@/lib/instagram-fetch";
import {
  escanearDeteccoesMetaAd,
  registrarDeteccaoDeBuscaMetaAds,
} from "@/lib/meta-ads-deteccao";
import {
  listarMetaAdsBuscasAtivas,
  listarMetaAdsPaginasAtivas,
  marcarMetaAdsBuscaVerificada,
  marcarMetaAdsPaginaVerificada,
  registrarMetaAd,
} from "@/lib/meta-ads-db";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import { escanearDeteccoesPostX, registrarDeteccaoDeBuscaX } from "@/lib/x-deteccao";
import { listarXBuscasAtivas, marcarXBuscaVerificada, registrarPostX } from "@/lib/x-db";

export async function publicarFontesInstagram(): Promise<void> {
  if (!isColetaCompartilhada()) return;
  const [perfis, buscas] = await Promise.all([
    listarInstagramPerfisAtivos(),
    listarInstagramBuscasAtivas(),
  ]);
  for (const perfil of perfis) {
    await upsertColetaFonte("instagram_perfil", perfil.username);
  }
  for (const busca of buscas) {
    if (termoInstagramEhHashtag(busca.termo)) {
      await upsertColetaFonte("instagram_hashtag", busca.termo);
    }
  }
}

export async function publicarFontesX(): Promise<void> {
  if (!isColetaCompartilhada()) return;
  const buscas = await listarXBuscasAtivas();
  for (const busca of buscas) {
    await upsertColetaFonte("x_termo", busca.termo);
  }
}

export async function publicarFontesMetaAds(): Promise<void> {
  if (!isColetaCompartilhada()) return;
  const [buscas, paginas] = await Promise.all([
    listarMetaAdsBuscasAtivas(),
    listarMetaAdsPaginasAtivas(),
  ]);
  for (const busca of buscas) {
    await upsertColetaFonte("meta_termo", busca.termo);
  }
  for (const pagina of paginas) {
    await upsertColetaFonte("meta_pagina", pagina.slug);
  }
}

export async function consumirInstagramCompartilhado(): Promise<number> {
  if (!isColetaCompartilhada()) return 0;

  const [perfis, buscas] = await Promise.all([
    listarInstagramPerfisAtivos(),
    listarInstagramBuscasAtivas(),
  ]);
  const hashtags = buscas.filter((b) => termoInstagramEhHashtag(b.termo));
  if (perfis.length === 0 && hashtags.length === 0) return 0;

  const posts = await listarInstagramPostsCompartilhados({
    usernames: perfis.map((p) => p.username),
    hashtags: hashtags.map((b) => b.termo),
  });

  const perfilPorUsername = new Map(perfis.map((p) => [p.username.toLowerCase(), p]));
  const buscaPorTermo = new Map(hashtags.map((b) => [b.termo.toLowerCase(), b]));
  const palavras = await listarPalavrasChaveAtivas();
  let novos = 0;

  for (const post of posts) {
    const perfil = perfilPorUsername.get(post.owner_username.toLowerCase());
    const busca =
      post.fonte_plataforma === "instagram_hashtag"
        ? buscaPorTermo.get(post.fonte_chave.toLowerCase())
        : undefined;
    if (!perfil && !busca) continue;

    const salvo = await registrarPostInstagram({
      perfilId: perfil?.id ?? null,
      buscaId: busca?.id ?? null,
      ownerUsername: post.owner_username,
      postId: post.post_id,
      shortCode: post.short_code,
      url: post.url,
      tipo: post.tipo,
      legenda: post.legenda,
      publicadoEm: post.publicado_em ? new Date(post.publicado_em) : null,
      videoUrl: post.video_url,
      imagemUrl: post.imagem_url,
      curtidas: post.curtidas,
      comentarios: post.comentarios,
    });
    if (!salvo) continue;
    if (salvo.novo) novos += 1;
    if (salvo.novo || salvo.legendaMudou) {
      await escanearDeteccoesPostInstagram(salvo.id, palavras);
      if (busca) await registrarDeteccaoDeBusca(salvo.id, busca.termo, palavras);
    }
  }

  for (const perfil of perfis) await marcarPerfilVerificado(perfil.id, null);
  for (const busca of hashtags) await marcarBuscaVerificada(busca.id, null);
  return novos;
}

export async function consumirXCompartilhado(): Promise<number> {
  if (!isColetaCompartilhada()) return 0;

  const buscas = await listarXBuscasAtivas();
  if (buscas.length === 0) return 0;

  const posts = await listarXPostsCompartilhados({
    termos: buscas.map((b) => b.termo),
  });
  const buscaPorTermo = new Map(buscas.map((b) => [b.termo.toLowerCase(), b]));
  const palavras = await listarPalavrasChaveAtivas();
  let novos = 0;

  for (const post of posts) {
    const busca = buscaPorTermo.get(post.search_term.toLowerCase());
    if (!busca) continue;

    const salvo = await registrarPostX({
      buscaId: busca.id,
      autorUsername: post.autor_username,
      autorNome: post.autor_nome,
      tweetId: post.tweet_id,
      url: post.url,
      texto: post.texto,
      publicadoEm: post.publicado_em ? new Date(post.publicado_em) : null,
      imagemUrl: post.imagem_url,
      curtidas: post.curtidas,
      retweets: post.retweets,
      respostas: post.respostas,
    });
    if (!salvo) continue;
    if (salvo.novo) novos += 1;
    if (salvo.novo || salvo.textoMudou) {
      await escanearDeteccoesPostX(salvo.id, palavras);
      await registrarDeteccaoDeBuscaX(salvo.id, busca.termo, palavras);
    }
  }

  for (const busca of buscas) await marcarXBuscaVerificada(busca.id, null);
  return novos;
}

export async function consumirMetaAdsCompartilhado(): Promise<number> {
  if (!isColetaCompartilhada()) return 0;

  const [buscas, paginas] = await Promise.all([
    listarMetaAdsBuscasAtivas(),
    listarMetaAdsPaginasAtivas(),
  ]);
  if (buscas.length === 0 && paginas.length === 0) return 0;

  const ads = await listarMetaAdsCompartilhados({
    termos: buscas.map((b) => b.termo),
    paginas: paginas.map((p) => p.slug),
  });

  const buscaPorTermo = new Map(buscas.map((b) => [b.termo.toLowerCase(), b]));
  const paginaPorSlug = new Map(paginas.map((p) => [p.slug.toLowerCase(), p]));
  const paginaPorId = new Map(paginas.filter((p) => /^\d+$/.test(p.slug)).map((p) => [p.slug, p]));
  const palavras = await listarPalavrasChaveAtivas();
  let novos = 0;

  for (const ad of ads) {
    const busca = ad.search_term ? buscaPorTermo.get(ad.search_term.toLowerCase()) : undefined;
    const pagina =
      paginaPorId.get(ad.page_id) ??
      paginaPorSlug.get(ad.fonte_chave.toLowerCase()) ??
      paginas.find(
        (p) =>
          ad.page_profile_uri.toLowerCase().includes(p.slug.toLowerCase()) ||
          ad.page_name.toLowerCase() === p.slug.toLowerCase(),
      );
    if (!busca && !pagina) continue;

    const salvo = await registrarMetaAd({
      buscaId: busca?.id ?? null,
      paginaId: pagina?.id ?? null,
      adArchiveId: ad.ad_archive_id,
      pageId: ad.page_id,
      pageName: ad.page_name,
      url: ad.url,
      texto: ad.texto,
      titulo: ad.titulo,
      ctaText: ad.cta_text,
      linkUrl: ad.link_url,
      imagemUrl: ad.imagem_url,
      videoUrl: ad.video_url,
      inicioEm: ad.inicio_em ? new Date(ad.inicio_em) : null,
      fimEm: ad.fim_em ? new Date(ad.fim_em) : null,
    });
    if (!salvo) continue;
    if (salvo.novo) novos += 1;
    if (salvo.novo || salvo.textoMudou) {
      await escanearDeteccoesMetaAd(salvo.id, palavras);
      if (busca) await registrarDeteccaoDeBuscaMetaAds(salvo.id, busca.termo, palavras);
    }
  }

  for (const busca of buscas) await marcarMetaAdsBuscaVerificada(busca.id, null);
  for (const pagina of paginas) await marcarMetaAdsPaginaVerificada(pagina.id, null);
  return novos;
}
