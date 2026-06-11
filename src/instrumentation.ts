export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDatabase } = await import("@/lib/db");
    const { startGravacoesIndexer } = await import("@/lib/gravacoes-indexer");
    const { startRecorderService } = await import("@/lib/recorder");
    const { startTranscriptionService } = await import("@/lib/transcription");
    const { startYoutubeMonitorService } = await import("@/lib/youtube-monitor");

    await initDatabase();
    void startGravacoesIndexer();
    void startRecorderService();
    void startTranscriptionService();
    void startYoutubeMonitorService();
  }
}
