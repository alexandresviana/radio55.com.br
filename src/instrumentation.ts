export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRecorderService } = await import("@/lib/recorder");
    void startRecorderService();
  }
}
