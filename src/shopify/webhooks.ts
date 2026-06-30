import crypto from "node:crypto";

export function isValidShopifyWebhookHmac(rawBody: Buffer, hmacHeader: string | undefined, secret: string): boolean {
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest();

  let received: Buffer;
  try {
    received = Buffer.from(hmacHeader, "base64");
  } catch {
    return false;
  }

  if (received.length !== digest.length) return false;
  return crypto.timingSafeEqual(received, digest);
}

export function makeShopifyWebhookHmac(rawBody: Buffer, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
}

export function getOrderGidFromWebhookPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Webhook payload must be an object");
  }

  const objectPayload = payload as Record<string, unknown>;
  const adminGraphqlApiId = objectPayload.admin_graphql_api_id;
  if (typeof adminGraphqlApiId === "string" && adminGraphqlApiId.startsWith("gid://shopify/Order/")) {
    return adminGraphqlApiId;
  }

  const numericId = objectPayload.id;
  if (typeof numericId === "number" || typeof numericId === "string") {
    return `gid://shopify/Order/${numericId}`;
  }

  throw new Error("Order webhook payload did not include admin_graphql_api_id or id");
}
