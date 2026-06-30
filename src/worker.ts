import "dotenv/config";
import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { createNotifier } from "./notifications/index.js";
import { ShopifyAdminClient } from "./shopify/client.js";
import { ShopifyLabelsService } from "./shopify/labels.js";
import { createStore, type AutomationStore } from "./store/index.js";
import { OrderAutomationService } from "./automation/service.js";

export class AutomationWorker {
  private readonly workerId = crypto.randomUUID();
  private stopped = false;

  constructor(
    private readonly store: AutomationStore,
    private readonly service: OrderAutomationService,
    private readonly options: { pollIntervalMs: number; maxAttempts: number }
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async runForever(): Promise<void> {
    while (!this.stopped) {
      const processed = await this.processNextJob();
      if (!processed) {
        await sleep(this.options.pollIntervalMs);
      }
    }
  }

  async processNextJob(): Promise<boolean> {
    const job = await this.store.claimNextOrderJob(this.workerId, this.options.maxAttempts);
    if (!job) return false;

    try {
      const result = await this.service.processOrder(job.orderGid);
      if (result.status === "failed") {
        await this.store.markOrderJobFailed(job.id, result.reason ?? "Automation failed", retryDelay(job.attempts));
      } else {
        await this.store.markOrderJobCompleted(job.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.markOrderJobFailed(job.id, message, retryDelay(job.attempts));
    }

    return true;
  }
}

function retryDelay(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildWorker(): Promise<{ worker: AutomationWorker; store: AutomationStore }> {
  const config = loadConfig();
  const store = await createStore(config);
  const shopifyClient = new ShopifyAdminClient({
    shopDomain: config.shopifyShopDomain,
    accessToken: config.shopifyAdminAccessToken,
    apiVersion: config.shopifyApiVersion
  });
  const shopifyLabels = new ShopifyLabelsService(shopifyClient);
  const notifier = createNotifier(config);
  const service = new OrderAutomationService({
    config: config.automation,
    shopifyLabels,
    store,
    notifier
  });

  return {
    worker: new AutomationWorker(store, service, config.worker),
    store
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace("file://", ""))) {
  const { worker, store } = await buildWorker();
  process.on("SIGTERM", () => worker.stop());
  process.on("SIGINT", () => worker.stop());
  await worker.runForever();
  await store.close();
}
