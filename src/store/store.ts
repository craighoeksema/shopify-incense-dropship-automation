import type { AutomationRunResult, OrderJob } from "../types.js";

export type OrderAutomationStatus = "processing" | "completed" | "skipped" | "failed";
export type OrderJobStatus = "pending" | "processing" | "completed" | "failed";

export interface EnqueueOrderJobInput {
  orderGid: string;
  webhookId?: string;
  shopDomain?: string;
}

export interface AutomationStore {
  recordWebhookDelivery(input: { id: string; topic: string; shopDomain: string }): Promise<boolean>;
  enqueueOrderJob(input: EnqueueOrderJobInput): Promise<{ enqueued: boolean; jobId?: string }>;
  claimNextOrderJob(workerId: string, maxAttempts: number): Promise<OrderJob | null>;
  markOrderJobCompleted(jobId: string): Promise<void>;
  markOrderJobFailed(jobId: string, error: string, retryAfterMs: number): Promise<void>;
  claimOrderAutomation(orderGid: string): Promise<boolean>;
  markOrderAutomationCompleted(orderGid: string, result: AutomationRunResult): Promise<void>;
  markOrderAutomationSkipped(orderGid: string, result: AutomationRunResult): Promise<void>;
  markOrderAutomationFailed(orderGid: string, error: string): Promise<void>;
  close(): Promise<void>;
}
