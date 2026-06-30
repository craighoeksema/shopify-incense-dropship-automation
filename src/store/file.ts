import fs from "node:fs/promises";
import path from "node:path";
import { MemoryAutomationStore, type MemoryStoreSnapshot } from "./memory.js";
import type { AutomationStore } from "./store.js";

export class FileAutomationStore extends MemoryAutomationStore implements AutomationStore {
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {
    super();
  }

  override async recordWebhookDelivery(input: Parameters<AutomationStore["recordWebhookDelivery"]>[0]): Promise<boolean> {
    await this.ensureLoaded();
    const result = await super.recordWebhookDelivery(input);
    await this.persist();
    return result;
  }

  override async enqueueOrderJob(input: Parameters<AutomationStore["enqueueOrderJob"]>[0]): Promise<Awaited<ReturnType<AutomationStore["enqueueOrderJob"]>>> {
    await this.ensureLoaded();
    const result = await super.enqueueOrderJob(input);
    await this.persist();
    return result;
  }

  override async claimNextOrderJob(workerId: string, maxAttempts: number): Promise<Awaited<ReturnType<AutomationStore["claimNextOrderJob"]>>> {
    await this.ensureLoaded();
    const result = await super.claimNextOrderJob(workerId, maxAttempts);
    await this.persist();
    return result;
  }

  override async markOrderJobCompleted(jobId: string): Promise<void> {
    await this.ensureLoaded();
    await super.markOrderJobCompleted(jobId);
    await this.persist();
  }

  override async markOrderJobFailed(jobId: string, error: string, retryAfterMs: number): Promise<void> {
    await this.ensureLoaded();
    await super.markOrderJobFailed(jobId, error, retryAfterMs);
    await this.persist();
  }

  override async claimOrderAutomation(orderGid: string): Promise<boolean> {
    await this.ensureLoaded();
    const result = await super.claimOrderAutomation(orderGid);
    await this.persist();
    return result;
  }

  override async markOrderAutomationCompleted(orderGid: string, result: Parameters<AutomationStore["markOrderAutomationCompleted"]>[1]): Promise<void> {
    await this.ensureLoaded();
    await super.markOrderAutomationCompleted(orderGid, result);
    await this.persist();
  }

  override async markOrderAutomationSkipped(orderGid: string, result: Parameters<AutomationStore["markOrderAutomationSkipped"]>[1]): Promise<void> {
    await this.ensureLoaded();
    await super.markOrderAutomationSkipped(orderGid, result);
    await this.persist();
  }

  override async markOrderAutomationFailed(orderGid: string, error: string): Promise<void> {
    await this.ensureLoaded();
    await super.markOrderAutomationFailed(orderGid, error);
    await this.persist();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    try {
      const contents = await fs.readFile(this.filePath, "utf8");
      this.restore(JSON.parse(contents) as MemoryStoreSnapshot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    this.loaded = true;
  }

  private async persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.snapshot(), null, 2));
    });
    return this.writeChain;
  }
}
