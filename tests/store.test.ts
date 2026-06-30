import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileAutomationStore } from "../src/store/file.js";

describe("FileAutomationStore", () => {
  it("persists webhook deliveries and jobs for local development", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shopify-store-"));
    const filePath = path.join(tempDir, "store.json");

    const firstStore = new FileAutomationStore(filePath);
    await firstStore.recordWebhookDelivery({
      id: "webhook-1",
      topic: "orders/create",
      shopDomain: "test-shop.myshopify.com"
    });
    await firstStore.enqueueOrderJob({
      orderGid: "gid://shopify/Order/1"
    });

    const secondStore = new FileAutomationStore(filePath);
    const isNewDelivery = await secondStore.recordWebhookDelivery({
      id: "webhook-1",
      topic: "orders/create",
      shopDomain: "test-shop.myshopify.com"
    });

    expect(isNewDelivery).toBe(false);
    expect(secondStore.snapshot().jobs).toHaveLength(1);
  });
});
