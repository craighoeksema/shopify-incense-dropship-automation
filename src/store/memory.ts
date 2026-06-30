import crypto from "node:crypto";
import type { AutomationRunResult, OrderJob } from "../types.js";
import type { AutomationStore, EnqueueOrderJobInput } from "./store.js";

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

export interface StoredJob extends OrderJob {
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  availableAt: number;
  lastError?: string;
}

export interface MemoryStoreSnapshot {
  webhookDeliveries: string[];
  jobs: StoredJob[];
  automationStatuses: Array<[
    string,
    { status: string; result?: AutomationRunResult; error?: string }
  ]>;
}

export class MemoryAutomationStore implements AutomationStore {
  protected readonly webhookDeliveries = new Set<string>();
  protected readonly jobs = new Map<string, StoredJob>();
  protected readonly automationStatuses = new Map<string, { status: string; result?: AutomationRunResult; error?: string }>();

  async recordWebhookDelivery(input: { id: string }): Promise<boolean> {
    if (this.webhookDeliveries.has(input.id)) return false;
    this.webhookDeliveries.add(input.id);
    return true;
  }

  async enqueueOrderJob(input: EnqueueOrderJobInput): Promise<{ enqueued: boolean; jobId?: string }> {
    for (const job of this.jobs.values()) {
      if (job.orderGid === input.orderGid) {
        return { enqueued: false, jobId: job.id };
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    this.jobs.set(id, {
      id,
      orderGid: input.orderGid,
      webhookId: input.webhookId,
      shopDomain: input.shopDomain,
      attempts: 0,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      availableAt: now
    });
    return { enqueued: true, jobId: id };
  }

  async claimNextOrderJob(_workerId: string, maxAttempts: number): Promise<OrderJob | null> {
    const now = Date.now();
    const job = [...this.jobs.values()]
      .filter((candidate) => ["pending", "failed"].includes(candidate.status) || (candidate.status === "processing" && candidate.availableAt <= now))
      .filter((candidate) => candidate.attempts < maxAttempts)
      .filter((candidate) => candidate.availableAt <= now)
      .sort((left, right) => left.createdAt - right.createdAt)[0];

    if (!job) return null;
    job.status = "processing";
    job.attempts += 1;
    job.updatedAt = now;
    job.availableAt = now + PROCESSING_LEASE_MS;
    return { id: job.id, orderGid: job.orderGid, webhookId: job.webhookId, shopDomain: job.shopDomain, attempts: job.attempts };
  }

  async markOrderJobCompleted(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = "completed";
      job.updatedAt = Date.now();
    }
  }

  async markOrderJobFailed(jobId: string, error: string, retryAfterMs: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = "failed";
      job.lastError = error;
      job.availableAt = Date.now() + retryAfterMs;
      job.updatedAt = Date.now();
    }
  }

  async claimOrderAutomation(orderGid: string): Promise<boolean> {
    if (this.automationStatuses.has(orderGid)) return false;
    this.automationStatuses.set(orderGid, { status: "processing" });
    return true;
  }

  async markOrderAutomationCompleted(orderGid: string, result: AutomationRunResult): Promise<void> {
    this.automationStatuses.set(orderGid, { status: "completed", result });
  }

  async markOrderAutomationSkipped(orderGid: string, result: AutomationRunResult): Promise<void> {
    this.automationStatuses.set(orderGid, { status: "skipped", result });
  }

  async markOrderAutomationFailed(orderGid: string, error: string): Promise<void> {
    this.automationStatuses.set(orderGid, { status: "failed", error });
  }

  async close(): Promise<void> {
    return undefined;
  }

  snapshot(): MemoryStoreSnapshot {
    return {
      webhookDeliveries: [...this.webhookDeliveries],
      jobs: [...this.jobs.values()],
      automationStatuses: [...this.automationStatuses.entries()]
    };
  }

  restore(snapshot: MemoryStoreSnapshot): void {
    this.webhookDeliveries.clear();
    for (const deliveryId of snapshot.webhookDeliveries) {
      this.webhookDeliveries.add(deliveryId);
    }

    this.jobs.clear();
    for (const job of snapshot.jobs) {
      this.jobs.set(job.id, job);
    }

    this.automationStatuses.clear();
    for (const [orderGid, status] of snapshot.automationStatuses) {
      this.automationStatuses.set(orderGid, status);
    }
  }
}
