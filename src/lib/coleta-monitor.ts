import {
  coletarSeHouverPedidoForcado,
  executarColetaApifyUnificada,
  podeColetarApify,
} from "@/lib/coleta-coletor";
import { initColetaDatabase, isColetaCompartilhada } from "@/lib/coleta-db";

const TICK_PADRAO_MIN = 15;
const FORCE_POLL_MS = 15_000;

type ColetaGlobal = typeof globalThis & {
  __radio55ColetaMonitor?: ColetaMonitorService;
};

function getTickMs(): number {
  const raw = Number(process.env.COLETA_TICK_MINUTOS ?? TICK_PADRAO_MIN);
  const minutos = Number.isFinite(raw) && raw >= 1 ? raw : TICK_PADRAO_MIN;
  return minutos * 60 * 1000;
}

class ColetaMonitorService {
  private started = false;
  private timer?: NodeJS.Timeout;
  private forceTimer?: NodeJS.Timeout;

  async start(): Promise<void> {
    if (this.started || !isColetaCompartilhada()) return;

    await initColetaDatabase();
    this.started = true;

    if (!podeColetarApify()) {
      console.info("[coleta] modo consumidor — este tenant não chama a Apify");
      return;
    }

    console.info(
      `[coleta] coletor unificado ativo — tick ${Math.round(getTickMs() / 60000)} min; força só com pedido`,
    );
    this.forceTimer = setInterval(() => {
      void coletarSeHouverPedidoForcado().catch((error) => {
        console.error("[coleta]", error instanceof Error ? error.message : error);
      });
    }, FORCE_POLL_MS);
    this.forceTimer.unref();
    // Espera os tenants publicarem as fontes no primeiro boot.
    setTimeout(() => {
      console.info("[coleta] primeiro tick após boot");
      void executarColetaApifyUnificada();
    }, 70_000).unref();
    this.timer = setInterval(() => {
      void executarColetaApifyUnificada().catch((error) => {
        console.error("[coleta]", error instanceof Error ? error.message : error);
      });
    }, getTickMs());
  }
}

export async function startColetaCompartilhadaService(): Promise<void> {
  const globalRef = globalThis as ColetaGlobal;
  if (!globalRef.__radio55ColetaMonitor) {
    globalRef.__radio55ColetaMonitor = new ColetaMonitorService();
  }
  await globalRef.__radio55ColetaMonitor.start();
}
