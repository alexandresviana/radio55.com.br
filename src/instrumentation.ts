export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDatabase, isDatabaseConfigured, limparBaseDados } = await import("@/lib/db");
    const { startGravacoesIndexer } = await import("@/lib/gravacoes-indexer");
    const { startRecorderService } = await import("@/lib/recorder");
    const { startTranscriptionService } = await import("@/lib/transcription");
    const { startYoutubeMonitorService } = await import("@/lib/youtube-monitor");
    const { startBunnyStorageUploader } = await import("@/lib/bunny-storage-uploader");
    const { readEmissoras } = await import("@/lib/emissoras");

    await initDatabase();

    if (process.env.RESET_DATABASE === "true" && isDatabaseConfigured()) {
      console.warn("[boot] RESET_DATABASE=true — limpando arquivos gravados, transcrições e YouTube...");
      await limparBaseDados();
      console.warn("[boot] Monitoramento limpo. Remova RESET_DATABASE do ambiente após o deploy.");
    }

    await readEmissoras();

    const { limparTrechosInexistentes } = await import("@/lib/trecho-deteccao");
    void limparTrechosInexistentes();

    void startGravacoesIndexer();
    void startRecorderService();
    void startTranscriptionService();
    void startYoutubeMonitorService();
    void startBunnyStorageUploader();
  }
}
