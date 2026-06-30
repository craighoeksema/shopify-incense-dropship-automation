import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryAutomationStore } from "../src/store/memory.js";
import { makeShopifyWebhookHmac } from "../src/shopify/webhooks.js";
import { testRuntimeConfig } from "./helpers.js";

describe("Shopify webhook route", () => {
  it("verifies HMAC and enqueues an order job", async () => {
    const config = testRuntimeConfig();
    const store = new MemoryAutomationStore();
    const app = createApp({ config, store });
    const rawJson = JSON.stringify({
      id: 123,
      admin_graphql_api_id: "gid://shopify/Order/123"
    });
    const rawBody = Buffer.from(rawJson);

    const response = await request(app)
      .post("/webhooks/shopify/orders-create")
      .set("content-type", "application/json")
      .set("x-shopify-topic", "orders/create")
      .set("x-shopify-shop-domain", "test-shop.myshopify.com")
      .set("x-shopify-webhook-id", "webhook-1")
      .set("x-shopify-hmac-sha256", makeShopifyWebhookHmac(rawBody, config.shopifyApiSecret))
      .send(rawJson);

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      ok: true,
      enqueued: true,
      orderGid: "gid://shopify/Order/123"
    });
    expect(store.snapshot().jobs).toHaveLength(1);
  });

  it("rejects an invalid HMAC", async () => {
    const config = testRuntimeConfig();
    const app = createApp({ config, store: new MemoryAutomationStore() });

    const response = await request(app)
      .post("/webhooks/shopify/orders-create")
      .set("content-type", "application/json")
      .set("x-shopify-topic", "orders/create")
      .set("x-shopify-webhook-id", "webhook-1")
      .set("x-shopify-hmac-sha256", "not-valid")
      .send(Buffer.from(JSON.stringify({ id: 123 })));

    expect(response.status).toBe(401);
  });

  it("deduplicates Shopify webhook deliveries", async () => {
    const config = testRuntimeConfig();
    const store = new MemoryAutomationStore();
    const app = createApp({ config, store });
    const rawJson = JSON.stringify({ id: 123 });
    const rawBody = Buffer.from(rawJson);
    const hmac = makeShopifyWebhookHmac(rawBody, config.shopifyApiSecret);

    await request(app)
      .post("/webhooks/shopify/orders-create")
      .set("content-type", "application/json")
      .set("x-shopify-topic", "orders/create")
      .set("x-shopify-webhook-id", "webhook-1")
      .set("x-shopify-hmac-sha256", hmac)
      .send(rawJson)
      .expect(202);

    const duplicate = await request(app)
      .post("/webhooks/shopify/orders-create")
      .set("content-type", "application/json")
      .set("x-shopify-topic", "orders/create")
      .set("x-shopify-webhook-id", "webhook-1")
      .set("x-shopify-hmac-sha256", hmac)
      .send(rawJson);

    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toMatchObject({ ok: true, duplicate: true });
    expect(store.snapshot().jobs).toHaveLength(1);
  });

  it("protects the internal enqueue route", async () => {
    const config = testRuntimeConfig();
    const app = createApp({ config, store: new MemoryAutomationStore() });

    await request(app)
      .post("/internal/orders/process")
      .send({ orderId: "123" })
      .expect(401);

    const response = await request(app)
      .post("/internal/orders/process")
      .set("authorization", "Bearer internal-token")
      .send({ orderId: "123" });

    expect(response.status).toBe(202);
    expect(response.body.orderGid).toBe("gid://shopify/Order/123");
  });
});
