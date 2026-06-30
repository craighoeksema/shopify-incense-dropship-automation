# Shopify Incense Dropship Automation

Webhook-driven automation for this workflow:

1. Receive a new Shopify order.
2. Detect whether the fulfillment order is an incense-only dropship order.
3. Purchase a Shopify Shipping label through Admin GraphQL.
4. Send the vendor the order details and shipping label URL.
5. Notify the internal team by Slack and/or email.

This repo is built as a small Node/TypeScript service, not a Shopify embedded app UI. A brand engineer can connect it to a Shopify custom app, deploy the web process and worker, then validate with real orders.

## Shopify API Status

This implementation is based on Shopify Admin GraphQL `2026-07`.

Important dependency: `shippingLabelPurchase` is in `2026-07` and requires `write_orders` plus a Shopify user with `buy_shipping_labels` permission. As of June 30, 2026, `2026-07` is the release-candidate Admin API version; keep `SHOPIFY_API_VERSION=2026-07` unless Shopify promotes a later stable version with the same mutation.

Official docs used:

- `shippingLabelPurchase`: https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/shippingLabelPurchase
- `ShippingLabelPurchaseInput`: https://shopify.dev/docs/api/admin-graphql/2026-07/input-objects/ShippingLabelPurchaseInput
- `PackageInfoInput`: https://shopify.dev/docs/api/admin-graphql/2026-07/input-objects/PackageInfoInput
- `PreferredRateSelectionInput`: https://shopify.dev/docs/api/admin-graphql/2026-07/input-objects/PreferredRateSelectionInput
- `ShippingLabelPurchaseResult`: https://shopify.dev/docs/api/admin-graphql/2026-07/objects/ShippingLabelPurchaseResult
- `ShippingLabel`: https://shopify.dev/docs/api/admin-graphql/2026-07/objects/ShippingLabel
- HTTPS webhooks: https://shopify.dev/docs/apps/build/webhooks/subscribe/https
- `webhookSubscriptionCreate`: https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/webhookSubscriptionCreate

## How It Works

The web server only receives and validates Shopify webhooks. It records the Shopify webhook ID so duplicate deliveries do not enqueue duplicate jobs.

The worker claims queued order jobs, fetches the order and fulfillment orders from Shopify, applies configurable matching rules, then purchases one label per matching fulfillment order. The store adds another idempotency layer at the order level before any paid label purchase happens.

If `preferredRateSelection` is not configured, Shopify selects the cheapest rate, which mirrors the usual “take the default cheapest USPS/UPS option” workflow. Shopify does not expose the Shopify Admin UI’s full recommendation algorithm as a public API.

## Local Setup

```bash
git clone <repo-url>
cd shopify-incense-dropship-automation
npm install
cp .env.example .env
```

Edit `.env`:

```bash
SHOPIFY_SHOP_DOMAIN=brand-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
SHOPIFY_API_SECRET=...
SHOPIFY_API_VERSION=2026-07
AUTOMATION_CONFIG_PATH=./config/automation.example.json
STORE_DRIVER=file
INTERNAL_API_TOKEN=use-a-long-random-token
```

Run the web process:

```bash
npm run dev
```

Run the worker in another terminal:

```bash
npm run worker
```

## Shopify Setup

Create a custom app in the Shopify admin and grant the smallest scopes that work for the store’s fulfillment setup:

- `read_orders`
- `write_orders`
- `read_products`
- `read_shipping`
- `read_merchant_managed_fulfillment_orders`
- `write_merchant_managed_fulfillment_orders`

If the incense fulfillment orders are assigned to a fulfillment-service or third-party location, the app may also need the corresponding assigned/third-party fulfillment order scopes. Shopify fulfillment-order access is location-type dependent.

Before testing paid labels, confirm:

- Shopify Shipping terms are accepted in the store.
- The app user has `buy_shipping_labels`.
- The store’s origin location/package setup can buy labels in Shopify Admin manually.
- The test order is eligible for Shopify Shipping label purchase.

## Register The Webhook

Deploy the web process somewhere public, or use ngrok for local validation:

```bash
ngrok http 3000
```

Register the `orders/create` webhook:

```bash
npm run register:webhook -- https://your-public-url.com/webhooks/shopify/orders-create
```

The webhook route also validates Shopify’s `x-shopify-hmac-sha256` signature using `SHOPIFY_API_SECRET`.

## Configure Incense Detection

Edit `config/automation.example.json` or point `AUTOMATION_CONFIG_PATH` to another JSON file.

Default mode:

```json
"mode": "all_shippable_line_items_target"
```

That means the automation only buys a label when every remaining shippable line item in the fulfillment order matches the target rules. This avoids accidentally buying a label for mixed orders.

Supported matcher fields:

- `skuIncludes`
- `skuPrefixes`
- `titleIncludes`
- `titleRegexes`
- `productTags`
- `productTypes`
- `vendors`
- `productHandles`
- `productIds`
- `variantIds`

If the brand wants mixed orders to trigger when any line item is incense, set:

```json
"mode": "any_target_line_item"
```

Only use that mode if it is acceptable to purchase a label for the whole matching fulfillment order.

## Configure Label Purchase

The default package is a small custom box. Update it before buying real labels:

```json
"packageInfo": {
  "customPackage": {
    "type": "BOX",
    "dimensions": { "length": 8, "width": 6, "height": 2, "unit": "INCHES" },
    "weight": { "value": 2, "unit": "OUNCES" }
  }
}
```

To let Shopify choose the cheapest rate, leave `preferredRateSelection` out.

To force a carrier/service:

```json
"preferredRateSelection": {
  "carrierCode": "usps",
  "serviceCode": "priority_mail"
}
```

Both fields are required if `preferredRateSelection` is present.

## Notifications

Vendor email:

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=...
EMAIL_FROM="Shopify Automation <automation@brand.com>"
VENDOR_EMAIL_TO=sales@cinnamonprojects.com
```

Internal Slack:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Internal email:

```bash
INTERNAL_EMAIL_TO=ops@brand.com
```

The vendor email includes order details, tracking info, and each returned label document URL. During validation, confirm that the vendor can open the Shopify document URL. If not, update the email adapter to download and attach the returned PDF.

## Manual Validation

Enqueue a known order by REST numeric ID:

```bash
curl -X POST http://localhost:3000/internal/orders/process \
  -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"1234567890"}'
```

Or by GraphQL GID:

```bash
curl -X POST http://localhost:3000/internal/orders/process \
  -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderGid":"gid://shopify/Order/1234567890"}'
```

Then run the worker and watch logs:

```bash
npm run worker
```

## Production Deployment

Use Postgres in production:

```bash
docker compose up -d postgres
STORE_DRIVER=postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/shopify_incense_automation
POSTGRES_AUTO_MIGRATE=true
```

Run at least one web process:

```bash
npm run build
npm start
```

Run at least one worker process:

```bash
npm run start:worker
```

Operational notes:

- Keep web and worker logs.
- Use a durable Postgres database, not `STORE_DRIVER=file`, for production.
- Treat failed automations as manual-review items; the service intentionally avoids retrying paid-label purchases after an order has been claimed.
- Add provider-level email/webhook alerting if vendor delivery must be guaranteed.

## Tests

```bash
npm run lint
npm test
npm run build
```

The test suite covers:

- Shopify webhook HMAC validation.
- Webhook duplicate delivery handling.
- Internal enqueue auth.
- Flexible incense detection.
- Cheapest-rate behavior by omitting `preferredRateSelection`.
- Explicit carrier/service configuration.
- Label purchase polling.
- Order-level idempotency.
- Failed purchase handling.
- Local file-store persistence.
