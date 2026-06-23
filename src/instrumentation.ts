export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDatabase } = await import("@/lib/db");
    const { startGravacoesIndexer } = await import("@/lib/gravacoes-indexer");
    const { startRecorderService } = await import("@/lib/recorder");
    const { startTranscriptionService } = await import("@/lib/transcription");
    const { startYoutubeMonitorService } = await import("@/lib/youtube-monitor");
    const { startBunnyStorageUploader } = await import("@/lib/bunny-storage-uploader");

    const { readEmissoras } = await import("@/lib/emissoras");

    await initDatabase();
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
