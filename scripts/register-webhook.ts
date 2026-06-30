import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { ShopifyAdminClient } from "../src/shopify/client.js";
import { WEBHOOK_SUBSCRIPTION_CREATE_MUTATION } from "../src/shopify/queries.js";

const config = loadConfig();
const callbackUrl = process.argv[2];

if (!callbackUrl) {
  throw new Error("Usage: npm run register:webhook -- https://your-domain.com/webhooks/shopify/orders-create");
}

const client = new ShopifyAdminClient({
  shopDomain: config.shopifyShopDomain,
  accessToken: config.shopifyAdminAccessToken,
  apiVersion: config.shopifyApiVersion
});

const data = await client.query<{
  webhookSubscriptionCreate: {
    webhookSubscription: { id: string; topic: string } | null;
    userErrors: Array<{ field?: string[] | null; message: string }>;
  };
}>(WEBHOOK_SUBSCRIPTION_CREATE_MUTATION, {
  topic: "ORDERS_CREATE",
  webhookSubscription: {
    uri: callbackUrl,
    format: "JSON"
  }
});

const errors = data.webhookSubscriptionCreate.userErrors;
if (errors.length > 0) {
  throw new Error(`Shopify rejected webhook subscription: ${errors.map((error) => error.message).join("; ")}`);
}

console.log(JSON.stringify(data.webhookSubscriptionCreate.webhookSubscription, null, 2));
