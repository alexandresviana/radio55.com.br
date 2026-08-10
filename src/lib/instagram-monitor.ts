import { isDatabaseConfigured } from "@/lib/db";
import {
  listarComentariosParaReescanear,
  listarPostsParaColetarComentarios,
  marcarComentariosColetados,
  registrarComentarioInstagram,
} from "@/lib/instagram-comentarios-db";
import {
  listarInstagramBuscasAtivas,
  listarInstagramPerfisAtivos,
  marcarBuscaVerificada,
  marcarPerfilVerificado,
  registrarPostInstagram,
} from "@/lib/instagram-db";
import {
  escanearDeteccoesComentarioInstagram,
  escanearDeteccoesPostInstagram,
  registrarDeteccaoDeBusca,
} from "@/lib/instagram-deteccao";
import { listarPostsInstagramParaReescanear } from "@/lib/instagram-deteccoes-db";
import {
  coletarComentariosInstagram,
  coletarPostsInstagram,
  extrairShortCodeInstagram,
  extrairTermoDeUrlHashtag,
  isInstagramFetchConfigured,
  normalizarUrlInstagram,
  termoInstagramEhHashtag,
  urlHashtagInstagram,
  urlPerfilInstagram,
} from "@/lib/instagram-fetch";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";

// Pacote econômico: Apify cobra por item retornado — defaults conservadores.
const SYNC_MINUTOS_PADRAO = 120;
const RESCAN_MS = 60_000;
const RESCAN_LOTE = 10;
const RESCAN_LOTE_COMENTARIOS = 20;
const COMENTARIOS_INTERVALO_PADRAO = 180;
const COMENTARIOS_LOTE_POSTS = 3;
const POSTS_POR_FONTE_PADRAO = 5;
const AGENDAR_SYNC_DEBOUNCE_MS = 60_000;
const AGENDAR_SYNC_COOLDOWN_MS = 10 * 60_000;

function getSyncMs(): number {
  const raw = Number(process.env.INSTAGRAM_SYNC_MINUTOS ?? SYNC_MINUTOS_PADRAO);
  const minutos = Number.isFinite(raw) && raw >= 5 ? raw : SYNC_MINUTOS_PADRAO;
  return minutos * 60 * 1000;
}

function getPostsPorPerfil(): number {
  const raw = Number(process.env.INSTAGRAM_POSTS_POR_PERFIL ?? POSTS_POR_FONTE_PADRAO);
  return Number.isFinite(raw) && raw >= 1
    ? Math.min(Math.floor(raw), 50)
    : POSTS_POR_FONTE_PADRAO;
}

function getComentariosMs(): number {
  const raw = Number(
    process.env.INSTAGRAM_COMENTARIOS_INTERVALO_MINUTOS ?? COMENTARIOS_INTERVALO_PADRAO,
  );
  const minutos = Number.isFinite(raw) && raw >= 5 ? raw : COMENTARIOS_INTERVALO_PADRAO;
  return minutos * 60 * 1000;
}

function getComentariosPorPost(): number {
  const raw = Number(process.env.INSTAGRAM_COMENTARIOS_POR_POST ?? 10);
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 100) : 10;
}

/** Opt-in: só coleta comentários com INSTAGRAM_COMENTARIOS_ENABLED=true. */
function comentariosHabilitados(): boolean {
  return process.env.INSTAGRAM_COMENTARIOS_ENABLED === "true";
}

type MonitorGlobal = typeof globalThis & {
  __radio55InstagramMonitor?: InstagramMonitorService;
  __radio55InstagramSyncTimer?: NodeJS.Timeout;
};

class InstagramMonitorService {
  private started = false;
  private syncTimer?: NodeJS.Timeout;
  private rescanTimer?: NodeJS.Timeout;
  private comentariosTimer?: NodeJS.Timeout;
  private syncing = false;
  private rescanning = false;
  private coletandoComentarios = false;
  private rescanOffset = 0;
  private rescanComentariosOffset = 0;
  private lastError: string | null = null;
  private lastSyncAt: string | null = null;
  private lastComentariosAt: string | null = null;
  private postsColetados = 0;
  private comentariosColetados = 0;

  async start(): Promise<void> {
    if (this.started || !isDatabaseConfigured()) return;
    if (process.env.INSTAGRAM_ENABLED === "false") {
      console.warn("[instagram] INSTAGRAM_ENABLED=false — monitor desativado");
      return;
    }
    if (!isInstagramFetchConfigured()) {
      console.warn("[instagram] token de coleta ausente — monitor desativado");
      return;
    }

    this.started = true;
    void this.reescanearDeteccoes();

    // Posts primeiro; comentários só depois (precisam das URLs já gravadas).
    void this.syncPerfis().then(() => {
      if (comentariosHabilitados()) void this.coletarComentarios();
    });

    this.syncTimer = setInterval(() => {
      void this.syncPerfis();
    }, getSyncMs());

    this.rescanTimer = setInterval(() => {
      void this.reescanearDeteccoes();
    }, RESCAN_MS);

    if (comentariosHabilitados()) {
      this.comentariosTimer = setInterval(() => {
        void this.coletarComentarios();
      }, getComentariosMs());
    } else {
      console.warn(
        "[instagram] comentários desativados — use INSTAGRAM_COMENTARIOS_ENABLED=true para ligar",
      );
    }
  }

  getStatus() {
    return {
      ativo: this.started,
      coleta_configurada: isInstagramFetchConfigured(),
      sincronizando: this.syncing,
      erro: this.lastError,
      ultima_sincronizacao: this.lastSyncAt,
      posts_coletados: this.postsColetados,
      intervalo_minutos: Math.round(getSyncMs() / 60000),
      comentarios_habilitados: comentariosHabilitados(),
      comentarios_coletados: this.comentariosColetados,
      ultima_coleta_comentarios: this.lastComentariosAt,
      comentarios_intervalo_minutos: Math.round(getComentariosMs() / 60000),
    };
  }

  async forceSync(): Promise<void> {
    await this.syncPerfis();
    if (comentariosHabilitados()) {
      await this.coletarComentarios();
    }
  }

  private async syncPerfis(): Promise<void> {
    if (this.syncing || !isDatabaseConfigured() || !isInstagramFetchConfigured()) return;

    this.syncing = true;
    try {
      const [perfis, buscas] = await Promise.all([
        listarInstagramPerfisAtivos(),
        listarInstagramBuscasAtivas(),
      ]);
      if (perfis.length === 0 && buscas.length === 0) return;

      // Só termos sem espaço viram coleta por hashtag; frases ("fabio mitidieri")
      // são buscadas nas legendas/comentários já coletados.
      const buscasHashtag = buscas.filter((b) => termoInstagramEhHashtag(b.termo));

      const posts =
        perfis.length > 0 || buscasHashtag.length > 0
          ? await coletarPostsInstagram(
              {
                perfis: perfis.map((p) => p.username),
                termos: buscasHashtag.map((b) => b.termo),
              },
              {
                limitePorFonte: getPostsPorPerfil(),
                // Evita pagar de novo posts antigos já salvos (buffer 30 min).
                apenasMaisRecentesQue: this.lastSyncAt
                  ? new Date(
                      new Date(this.lastSyncAt).getTime() - 30 * 60_000,
                    ).toISOString()
                  : "2 days",
              },
            )
          : [];

      // Recarrega depois da coleta: o usuário pode ter removido um perfil/termo
      // enquanto a Apify ainda rodava (evita FK inválida no insert).
      const [perfisAtuais, buscasAtuais] = await Promise.all([
        listarInstagramPerfisAtivos(),
        listarInstagramBuscasAtivas(),
      ]);
      const buscasHashtagAtuais = buscasAtuais.filter((b) =>
        termoInstagramEhHashtag(b.termo),
      );

      const perfilPorUsername = new Map(
        perfisAtuais.map((p) => [p.username.toLowerCase(), p]),
      );
      const perfilPorUrl = new Map(
        perfisAtuais.map((p) => [
          normalizarUrlInstagram(urlPerfilInstagram(p.username)),
          p,
        ]),
      );
      const buscaPorUrl = new Map(
        buscasHashtagAtuais.map((b) => [
          normalizarUrlInstagram(urlHashtagInstagram(b.termo)),
          b,
        ]),
      );
      const buscaPorTermo = new Map(
        buscasHashtagAtuais.map((b) => [b.termo.toLowerCase(), b]),
      );
      const palavras = await listarPalavrasChaveAtivas();

      for (const post of posts) {
        const inputNorm = normalizarUrlInstagram(post.inputUrl);
        const termoDaUrl = extrairTermoDeUrlHashtag(post.inputUrl);
        const busca =
          buscaPorUrl.get(inputNorm) ??
          (termoDaUrl ? buscaPorTermo.get(termoDaUrl) : undefined);
        const perfil =
          perfilPorUrl.get(inputNorm) ?? perfilPorUsername.get(post.ownerUsername);
        if (!busca && !perfil) continue;

        const salvo = await registrarPostInstagram({
          perfilId: perfil?.id ?? null,
          buscaId: busca?.id ?? null,
          ownerUsername: post.ownerUsername,
          postId: post.postId,
          shortCode: post.shortCode,
          url: post.url,
          tipo: post.tipo,
          legenda: post.legenda,
          publicadoEm: post.publicadoEm,
          videoUrl: post.videoUrl,
          imagemUrl: post.imagemUrl,
          curtidas: post.curtidas,
          comentarios: post.comentarios,
        });

        if (!salvo) continue;
        if (salvo.novo) this.postsColetados += 1;
        if (salvo.novo || salvo.legendaMudou) {
          await escanearDeteccoesPostInstagram(salvo.id, palavras);
          // Hashtag monitorada: a própria publicação conta como detecção do termo.
          if (busca) {
            await registrarDeteccaoDeBusca(salvo.id, busca.termo);
          }
        }
      }

      for (const perfil of perfisAtuais) {
        await marcarPerfilVerificado(perfil.id, null);
      }
      for (const busca of buscasAtuais) {
        await marcarBuscaVerificada(busca.id, null);
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Erro ao sincronizar fontes do Instagram";
      console.error("[instagram]", this.lastError);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Coleta comentários de um lote pequeno de publicações recentes ainda não
   * processadas (ou processadas há mais de 72h). Uma execução por ciclo.
   */
  private async coletarComentarios(): Promise<void> {
    if (
      this.coletandoComentarios ||
      !isDatabaseConfigured() ||
      !isInstagramFetchConfigured() ||
      !comentariosHabilitados()
    ) {
      return;
    }

    this.coletandoComentarios = true;
    try {
      const posts = await listarPostsParaColetarComentarios(COMENTARIOS_LOTE_POSTS);
      if (posts.length === 0) return;

      const comentarios = await coletarComentariosInstagram(
        posts.map((p) => p.url),
        { limitePorPost: getComentariosPorPost() },
      );

      const postPorShortCode = new Map(
        posts
          .map((p) => [p.short_code || extrairShortCodeInstagram(p.url), p] as const)
          .filter((par): par is [string, (typeof posts)[number]] => Boolean(par[0])),
      );
      const palavras = await listarPalavrasChaveAtivas();

      for (const comentario of comentarios) {
        const post = comentario.shortCode ? postPorShortCode.get(comentario.shortCode) : null;
        if (!post) continue;

        const salvo = await registrarComentarioInstagram({
          postDbId: post.id,
          comentarioId: comentario.comentarioId,
          autorUsername: comentario.autorUsername,
          texto: comentario.texto,
          publicadoEm: comentario.publicadoEm,
          curtidas: comentario.curtidas,
        });

        if (!salvo) continue;
        if (salvo.novo) {
          this.comentariosColetados += 1;
          if (palavras.length > 0) {
            await escanearDeteccoesComentarioInstagram(salvo.id, palavras);
          }
        }
      }

      for (const post of posts) {
        await marcarComentariosColetados(post.id);
      }

      this.lastComentariosAt = new Date().toISOString();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao coletar comentários do Instagram";
      this.lastError = message;
      console.error("[instagram]", message);
    } finally {
      this.coletandoComentarios = false;
    }
  }

  private async reescanearDeteccoes(): Promise<void> {
    if (this.rescanning || !isDatabaseConfigured()) return;

    this.rescanning = true;
    try {
      const [postIds, comentarioIds] = await Promise.all([
        listarPostsInstagramParaReescanear(RESCAN_LOTE, this.rescanOffset),
        listarComentariosParaReescanear(RESCAN_LOTE_COMENTARIOS, this.rescanComentariosOffset),
      ]);

      if (postIds.length === 0) this.rescanOffset = 0;
      if (comentarioIds.length === 0) this.rescanComentariosOffset = 0;
      if (postIds.length === 0 && comentarioIds.length === 0) return;

      const palavras = await listarPalavrasChaveAtivas();
      if (palavras.length > 0) {
        for (const postDbId of postIds) {
          await escanearDeteccoesPostInstagram(postDbId, palavras);
        }
        for (const comentarioDbId of comentarioIds) {
          await escanearDeteccoesComentarioInstagram(comentarioDbId, palavras);
        }
      }

      this.rescanOffset += postIds.length;
      this.rescanComentariosOffset += comentarioIds.length;
    } catch (error) {
      console.error(
        "[instagram] reescaneamento de detecções:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.rescanning = false;
    }
  }
}

export async function reescanearDeteccoesInstagramAgora(limite = 50): Promise<number> {
  const [postIds, comentarioIds] = await Promise.all([
    listarPostsInstagramParaReescanear(limite, 0),
    listarComentariosParaReescanear(limite, 0),
  ]);
  let total = 0;

  for (const postDbId of postIds) {
    total += await escanearDeteccoesPostInstagram(postDbId);
  }
  for (const comentarioDbId of comentarioIds) {
    total += await escanearDeteccoesComentarioInstagram(comentarioDbId);
  }

  return total;
}

export function getInstagramMonitorStatus() {
  const globalRef = globalThis as MonitorGlobal;
  return (
    globalRef.__radio55InstagramMonitor?.getStatus() ?? {
      ativo: false,
      coleta_configurada: isInstagramFetchConfigured(),
      sincronizando: false,
      erro: null,
      ultima_sincronizacao: null,
      posts_coletados: 0,
      intervalo_minutos: Math.round(getSyncMs() / 60000),
      comentarios_habilitados: comentariosHabilitados(),
      comentarios_coletados: 0,
      ultima_coleta_comentarios: null,
      comentarios_intervalo_minutos: Math.round(getComentariosMs() / 60000),
    }
  );
}

export async function startInstagramMonitorService(): Promise<void> {
  const globalRef = globalThis as MonitorGlobal;
  if (!globalRef.__radio55InstagramMonitor) {
    globalRef.__radio55InstagramMonitor = new InstagramMonitorService();
  }
  await globalRef.__radio55InstagramMonitor.start();
}

export async function syncInstagramPerfisAgora(): Promise<void> {
  const globalRef = globalThis as MonitorGlobal;
  if (!globalRef.__radio55InstagramMonitor) {
    globalRef.__radio55InstagramMonitor = new InstagramMonitorService();
    await globalRef.__radio55InstagramMonitor.start();
  }
  await globalRef.__radio55InstagramMonitor.forceSync();
}

/** Sync com debounce/cooldown — use em CRUD para não disparar Apify a cada cadastro. */
export function agendarSyncInstagramPerfis(): void {
  const globalRef = globalThis as MonitorGlobal;
  const status = getInstagramMonitorStatus();
  if (status.sincronizando) return;
  if (status.ultima_sincronizacao) {
    const idade = Date.now() - new Date(status.ultima_sincronizacao).getTime();
    if (Number.isFinite(idade) && idade < AGENDAR_SYNC_COOLDOWN_MS) return;
  }
  if (globalRef.__radio55InstagramSyncTimer) {
    clearTimeout(globalRef.__radio55InstagramSyncTimer);
  }
  globalRef.__radio55InstagramSyncTimer = setTimeout(() => {
    globalRef.__radio55InstagramSyncTimer = undefined;
    void syncInstagramPerfisAgora();
  }, AGENDAR_SYNC_DEBOUNCE_MS);
}
