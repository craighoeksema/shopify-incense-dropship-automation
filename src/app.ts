import express from "express";
import type { Request, Response } from "express";
import type { RuntimeConfig } from "./types.js";
import { getOrderGidFromWebhookPayload, isValidShopifyWebhookHmac } from "./shopify/webhooks.js";
import type { AutomationStore } from "./store/index.js";

interface CreateAppOptions {
  config: RuntimeConfig;
  store: AutomationStore;
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();

  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json({
      ok: true,
      shopDomain: options.config.shopifyShopDomain,
      apiVersion: options.config.shopifyApiVersion,
      storeDriver: options.config.store.driver
    });
  });

  app.post(
    "/webhooks/shopify/orders-create",
    express.raw({ type: "application/json" }),
    async (request: Request, response: Response) => {
      const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");
      const hmacHeader = firstHeader(request.headers["x-shopify-hmac-sha256"]);

      if (!isValidShopifyWebhookHmac(rawBody, hmacHeader, options.config.shopifyApiSecret)) {
        response.status(401).json({ ok: false, error: "Invalid Shopify webhook HMAC" });
        return;
      }

      const topic = firstHeader(request.headers["x-shopify-topic"]);
      if (topic !== "orders/create") {
        response.status(400).json({ ok: false, error: `Unsupported Shopify webhook topic: ${topic ?? "missing"}` });
        return;
      }

      const webhookId = firstHeader(request.headers["x-shopify-webhook-id"]);
      const shopDomain = firstHeader(request.headers["x-shopify-shop-domain"]) ?? options.config.shopifyShopDomain;
      if (!webhookId) {
        response.status(400).json({ ok: false, error: "Missing x-shopify-webhook-id header" });
        return;
      }

      const isNewDelivery = await options.store.recordWebhookDelivery({
        id: webhookId,
        topic,
        shopDomain
      });
      if (!isNewDelivery) {
        response.status(200).json({ ok: true, duplicate: true });
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        response.status(400).json({ ok: false, error: "Webhook body was not valid JSON" });
        return;
      }

      let orderGid: string;
      try {
        orderGid = getOrderGidFromWebhookPayload(payload);
      } catch (error) {
        response.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
        return;
      }

      const job = await options.store.enqueueOrderJob({
        orderGid,
        webhookId,
        shopDomain
      });

      response.status(202).json({
        ok: true,
        enqueued: job.enqueued,
        jobId: job.jobId,
        orderGid
      });
    }
  );

  app.use(express.json());

  app.post("/internal/orders/process", async (request: Request, response: Response) => {
    if (!isAuthorizedInternalRequest(request, options.config.internalApiToken)) {
      response.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const body = request.body as { orderGid?: string; orderId?: string };
    const orderGid = body.orderGid ?? (body.orderId ? `gid://shopify/Order/${body.orderId}` : undefined);
    if (!orderGid) {
      response.status(400).json({ ok: false, error: "Provide orderGid or orderId" });
      return;
    }

    const job = await options.store.enqueueOrderJob({ orderGid, shopDomain: options.config.shopifyShopDomain });
    response.status(202).json({
      ok: true,
      enqueued: job.enqueued,
      jobId: job.jobId,
      orderGid
    });
  });

  return app;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isAuthorizedInternalRequest(request: Request, token: string | undefined): boolean {
  if (!token) return false;
  return request.headers.authorization === `Bearer ${token}`;
}
