const BACKGROUND_LOCK = "background.services";
const BACKGROUND_RETRY_MS = 30_000;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDatabase, isDatabaseConfigured, limparBaseDados } = await import("@/lib/db");
    const { startGravacoesIndexer } = await import("@/lib/gravacoes-indexer");
    const { startRecorderService } = await import("@/lib/recorder");
    const { startTranscriptionService } = await import("@/lib/transcription");
    const { startYoutubeMonitorService } = await import("@/lib/youtube-monitor");
    const { startInstagramMonitorService } = await import("@/lib/instagram-monitor");
    const { startXMonitorService } = await import("@/lib/x-monitor");
    const { startMetaAdsMonitorService } = await import("@/lib/meta-ads-monitor");
    const { startBunnyStorageUploader } = await import("@/lib/bunny-storage-uploader");
    const { readEmissoras } = await import("@/lib/emissoras");
    const { releaseProcessLock, tryAcquireProcessLock } = await import("@/lib/process-lock");

    await initDatabase();
    await readEmissoras();

    let backgroundStarted = false;
    let followerLogged = false;

    const iniciarServicosDeFundo = async () => {
      if (backgroundStarted) return;
      if (!tryAcquireProcessLock(BACKGROUND_LOCK)) {
        if (!followerLogged) {
          followerLogged = true;
          console.warn("[boot] processo follower — só HTTP; serviços de fundo já têm dono");
        }
        setTimeout(() => {
          void iniciarServicosDeFundo();
        }, BACKGROUND_RETRY_MS).unref();
        return;
      }

      backgroundStarted = true;

      process.once("SIGTERM", () => releaseProcessLock(BACKGROUND_LOCK));
      process.once("SIGINT", () => releaseProcessLock(BACKGROUND_LOCK));

      if (process.env.RESET_DATABASE === "true" && isDatabaseConfigured()) {
        console.warn("[boot] RESET_DATABASE=true — limpando arquivos gravados, transcrições e YouTube...");
        await limparBaseDados();
        console.warn("[boot] Monitoramento limpo. Remova RESET_DATABASE do ambiente após o deploy.");
      }

      void startRecorderService().catch((error) => {
        console.error("[boot] falha ao iniciar recorder:", error instanceof Error ? error.message : error);
      });
      const { limparTrechosInexistentes } = await import("@/lib/trecho-deteccao");
      void limparTrechosInexistentes().catch((error) => {
        console.error("[boot] limpeza de trechos:", error instanceof Error ? error.message : error);
      });

      // Boot escalonado: subir os 8 serviços de uma vez saturava a CPU do
      // container e os handshakes com o Postgres estouravam o timeout.
      const iniciarComAtraso = (nome: string, atrasoMs: number, start: () => Promise<void>) => {
        setTimeout(() => {
          start().catch((error) => {
            console.error(`[boot] falha ao iniciar ${nome}:`, error instanceof Error ? error.message : error);
          });
        }, atrasoMs);
      };

      iniciarComAtraso("indexer", 5_000, startGravacoesIndexer);
      iniciarComAtraso("youtube", 15_000, startYoutubeMonitorService);
      iniciarComAtraso("instagram", 25_000, startInstagramMonitorService);
      iniciarComAtraso("x", 35_000, startXMonitorService);
      iniciarComAtraso("meta-ads", 45_000, startMetaAdsMonitorService);
      iniciarComAtraso("bunny", 55_000, startBunnyStorageUploader);
      iniciarComAtraso("transcription", 90_000, startTranscriptionService);
    };

    void iniciarServicosDeFundo();
  }
}
