import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import pg from "pg";
import type { AutomationRunResult, OrderJob } from "../types.js";
import type { AutomationStore, EnqueueOrderJobInput } from "./store.js";

const { Pool } = pg;
const PROCESSING_LEASE_MS = 5 * 60 * 1000;

export class PostgresAutomationStore implements AutomationStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async migrate(): Promise<void> {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const migrationPath = path.resolve(dirname, "../../migrations/postgres.sql");
    await this.pool.query(fs.readFileSync(migrationPath, "utf8"));
  }

  async recordWebhookDelivery(input: { id: string; topic: string; shopDomain: string }): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO webhook_deliveries (id, topic, shop_domain)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [input.id, input.topic, input.shopDomain]
    );
    return result.rowCount === 1;
  }

  async enqueueOrderJob(input: EnqueueOrderJobInput): Promise<{ enqueued: boolean; jobId?: string }> {
    const id = crypto.randomUUID();
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO order_jobs (id, order_gid, webhook_id, shop_domain, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (order_gid) DO NOTHING
       RETURNING id`,
      [id, input.orderGid, input.webhookId ?? null, input.shopDomain ?? null]
    );
    return result.rowCount === 1 ? { enqueued: true, jobId: result.rows[0]?.id } : { enqueued: false };
  }

  async claimNextOrderJob(_workerId: string, maxAttempts: number): Promise<OrderJob | null> {
    const result = await this.pool.query<{
      id: string;
      order_gid: string;
      webhook_id: string | null;
      shop_domain: string | null;
      attempts: number;
    }>(
      `UPDATE order_jobs
       SET status = 'processing',
           attempts = attempts + 1,
           updated_at = NOW(),
           available_at = NOW() + ($2::TEXT || ' milliseconds')::INTERVAL
       WHERE id = (
         SELECT id
         FROM order_jobs
         WHERE (status IN ('pending', 'failed') OR (status = 'processing' AND available_at <= NOW()))
           AND attempts < $1
           AND available_at <= NOW()
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, order_gid, webhook_id, shop_domain, attempts`,
      [maxAttempts, PROCESSING_LEASE_MS]
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      orderGid: row.order_gid,
      webhookId: row.webhook_id ?? undefined,
      shopDomain: row.shop_domain ?? undefined,
      attempts: row.attempts
    };
  }

  async markOrderJobCompleted(jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE order_jobs SET status = 'completed', updated_at = NOW(), last_error = NULL WHERE id = $1`,
      [jobId]
    );
  }

  async markOrderJobFailed(jobId: string, error: string, retryAfterMs: number): Promise<void> {
    await this.pool.query(
      `UPDATE order_jobs
       SET status = 'failed',
           last_error = $2,
           available_at = NOW() + ($3::TEXT || ' milliseconds')::INTERVAL,
           updated_at = NOW()
       WHERE id = $1`,
      [jobId, error, retryAfterMs]
    );
  }

  async claimOrderAutomation(orderGid: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO order_automations (order_gid, status)
       VALUES ($1, 'processing')
       ON CONFLICT (order_gid) DO NOTHING`,
      [orderGid]
    );
    return result.rowCount === 1;
  }

  async markOrderAutomationCompleted(orderGid: string, result: AutomationRunResult): Promise<void> {
    await this.markAutomation(orderGid, "completed", result, null);
  }

  async markOrderAutomationSkipped(orderGid: string, result: AutomationRunResult): Promise<void> {
    await this.markAutomation(orderGid, "skipped", result, null);
  }

  async markOrderAutomationFailed(orderGid: string, error: string): Promise<void> {
    await this.markAutomation(orderGid, "failed", null, error);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async markAutomation(orderGid: string, status: string, result: AutomationRunResult | null, error: string | null): Promise<void> {
    await this.pool.query(
      `INSERT INTO order_automations (order_gid, status, result_json, error, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (order_gid)
       DO UPDATE SET status = $2, result_json = $3, error = $4, updated_at = NOW()`,
      [orderGid, status, result ? JSON.stringify(result) : null, error]
    );
  }
}
