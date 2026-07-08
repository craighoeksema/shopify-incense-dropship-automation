# Deployment Runbook — Incense Dropship Automation (Dry-Run First)

This is a step-by-step guide for the **operator** (Craig) to stand up the automation
in **dry-run mode**, validate it against real orders with zero financial risk, and
then flip it to live. No prior DevOps experience assumed.

> **Dry run means:** the app matches real orders and emails you + Tracey a
> `[DRY RUN] Would have purchased...` summary. It never buys a label and never
> emails the vendor (Cinnamon Projects) until you explicitly turn dry run off.

---

## 0. Can Shopify host this? No.

Shopify hosts storefronts (themes) and small checkout Functions — not a general
Node.js backend with a database and a background worker. This app runs as its own
service. **Recommended host: [Render](https://render.com)** (used below). Railway is
nearly identical; a DigitalOcean VPS is cheaper but much more manual.

Approximate Render cost: ~**$20/month** (web service + worker + Postgres, smallest paid tiers).
Free tiers "spin down" when idle, which delays webhook processing and isn't offered for
workers — so paid tiers are the realistic choice for a always-on webhook receiver.

> **Cheaper option for the trial only:** you can run both processes on your own
> computer with [ngrok](https://ngrok.com) giving Shopify a public URL (see
> Appendix B). It costs nothing but requires your machine to stay awake and online
> for the whole 1–2 week dry-run window. Render is more reliable; pick based on your
> tolerance for babysitting a laptop.

---

## 1. What you're deploying

```
                 orders/create webhook
Shopify  ───────────────────────────────►  WEB process  ──►  Postgres (job queue)
                                                                   │
                                            WORKER process  ◄──────┘
                                                   │
                                                   ▼
                                     matches order → (dry run) email you + Tracey
```

Three pieces:
1. **Web process** — receives Shopify webhooks, verifies them, queues a job. Needs a public HTTPS URL.
2. **Worker process** — pulls jobs, applies matching rules, sends the dry-run email.
3. **Postgres database** — the durable job queue + idempotency record.

---

## 2. Prerequisites checklist

- [ ] Admin access to the Shopify store (to create a custom app).
- [ ] A [Render](https://render.com) account (sign up with GitHub — free to create).
- [ ] An email-sending (SMTP) account — see **Step 2**.
- [ ] The email addresses that should receive dry-run alerts (you + Tracey).
- [ ] This repo on your GitHub: `craighoeksema/shopify-incense-dropship-automation`
      (already done — Render deploys straight from it).

> **Good news for the dry run:** you do **not** need Shopify Shipping enabled, the
> `buy_shipping_labels` permission, or accepted shipping terms yet. Those are only
> required to buy real labels (go-live, Step 9). The dry run only *reads* orders.

---

## 3. Step 1 — Create the Shopify custom app

1. In Shopify admin: **Settings → Apps and sales channels → Develop apps**.
   (If "Develop apps" is greyed out, click **Allow custom app development** first.)
2. **Create an app** → name it e.g. `Incense Dropship Automation`.
3. Open **Configuration → Admin API integration → Configure** and grant these scopes:
   - `read_orders`
   - `write_orders`  *(needed for go-live; safe to grant now)*
   - `read_products`
   - `read_shipping`
   - `read_merchant_managed_fulfillment_orders`
   - `write_merchant_managed_fulfillment_orders`
4. **Save**, then **Install app**.
5. Go to **API credentials** and copy two secrets — you'll paste them into Render:
   - **Admin API access token** (`shpat_...`) → this is `SHOPIFY_ADMIN_ACCESS_TOKEN`.
     ⚠️ Shown only once. Copy it now.
   - **API secret key** → this is `SHOPIFY_API_SECRET` (used to verify webhook signatures).
6. Note your store domain, e.g. `your-store.myshopify.com` → `SHOPIFY_SHOP_DOMAIN`.

---

## 4. Step 2 — Set up email sending (SMTP)

The dry-run alerts are emails, so the app needs an SMTP account. Two easy paths:

**Option A — Google Workspace (you're on `@apparatusstudio.com`):**
- Create an [App Password](https://myaccount.google.com/apppasswords) for a sending account.
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`
- `SMTP_USER=the-account@apparatusstudio.com`, `SMTP_PASS=<the app password>`
- Good enough for low-volume internal dry-run alerts.

**Option B — Transactional provider (SendGrid, Postmark, Mailgun):**
- Create an account + API key. Example (SendGrid): `SMTP_HOST=smtp.sendgrid.net`,
  `SMTP_PORT=587`, `SMTP_USER=apikey`, `SMTP_PASS=<api key>`.
- More robust; better if you later want vendor emails to deliver reliably at go-live.

Either way also set `EMAIL_FROM`, e.g. `EMAIL_FROM="Incense Automation <automation@apparatusstudio.com>"`.

---

## 5. Step 3 — Review the matching rules (important)

Open `config/automation.example.json` and confirm the `matchers` actually match your
incense products. The defaults match on: SKU containing `incense`, SKU prefix `INC-`,
title containing `incense`, product tag `incense`, product type `Incense`, and vendor
`Cinnamon Projects`. If your incense catalog uses different SKUs/tags, edit this file
and commit the change. **The dry run is exactly how you verify these are right** — but
starting close saves iterations.

`mode` is `all_shippable_line_items_target`, meaning a label is only planned when
*every* shippable item in the order is incense (mixed orders are skipped). Leave this
as-is unless you want mixed orders to trigger.

---

## 6. Step 4 — Deploy to Render

You'll create three linked resources. Do them in this order.

### 6a. Create the Postgres database
1. Render dashboard → **New → Postgres**.
2. Name it `incense-automation-db`, pick the smallest paid plan, **Create**.
3. When it's ready, copy the **Internal Database URL** — you'll use it as `DATABASE_URL`.

### 6b. Create the Web Service
1. **New → Web Service** → connect your GitHub repo
   `craighoeksema/shopify-incense-dropship-automation`.
2. Settings:
   - **Branch:** `main` (merge PR #1 first, or deploy the `add-dry-run-mode` branch).
   - **Runtime:** Node
   - **Build command:** `npm ci && npm run build`
   - **Start command:** `npm start`
   - **Health check path:** `/health`
3. Add the environment variables from the **Appendix A** table.
   Set `DRY_RUN=true`.
4. **Create Web Service.** When it deploys, note its URL, e.g.
   `https://incense-automation-web.onrender.com`.

### 6c. Create the Worker
1. **New → Background Worker** → same repo.
2. Settings:
   - **Build command:** `npm ci && npm run build`
   - **Start command:** `npm run start:worker`
3. Add the **same** environment variables as the web service (Appendix A).
   (Tip: Render **Environment Groups** let you define them once and attach to both.)
4. **Create.**

> Both processes run the DB migration on boot (`POSTGRES_AUTO_MIGRATE=true`); the
> migration is safe to run from both (it uses `CREATE TABLE IF NOT EXISTS`).

### 6d. Confirm it's up
Visit `https://<your-web-url>/health` — you should see `{"ok":true}`.
Visit `/ready` to confirm it sees your shop domain, API version, and `storeDriver: "postgres"`.

---

## 7. Step 5 — Register the Shopify webhook

This tells Shopify to POST new orders to your web service. Run it **once** from your
own machine (it only needs the Shopify credentials, not the database):

```bash
cd ~/Documents/shopify-incense-dropship-automation
cp .env.example .env       # then edit .env with your real Shopify values
npm install
npm run register:webhook -- https://<your-web-url>.onrender.com/webhooks/shopify/orders-create
```

It prints the created subscription. (Alternatively, use Render's **Shell** tab on the
web service and run the same `npm run register:webhook -- <url>` there.)

---

## 8. Step 6 — Validate immediately with a known order

You don't have to wait for a new order to know it works. Pick a **recent real incense
order**, grab its numeric ID from the Shopify admin URL
(`.../orders/1234567890` → `1234567890`), and enqueue it manually:

```bash
curl -X POST https://<your-web-url>.onrender.com/internal/orders/process \
  -H "Authorization: Bearer <your INTERNAL_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"1234567890"}'
```

Within a few seconds the worker processes it and — if it matches — you and Tracey get
the `[DRY RUN] Would have purchased...` email. This is the fastest way to sanity-check
your matching rules against real data.

> Note: each order is processed once (idempotency). Re-sending the same order returns
> "already claimed" and won't re-email. Use a different order to test again.

---

## 9. Step 7 — Run the dry-run period

Let it run for **1–2 weeks** alongside Tracey's normal manual process. For every new
order, if it matches, you both get the "would have purchased" email. Keep a simple tally:

- ✅ **True positives:** it emailed for orders Tracey did ship manually. (Good.)
- ❌ **Misses:** an incense order Tracey shipped that it did *not* email about → your
  matching rules are too narrow. Adjust `config/automation.example.json`, redeploy.
- ⚠️ **False positives:** it emailed for an order that should *not* be auto-shipped
  (e.g. a mixed order, or wrong product) → rules too broad. Tighten them.

Also confirm the **package size** in the email (`8x6x2 in, 2 oz` default) is realistic
for incense, and the **ship-to** looks right. When a full week passes with the emails
matching Tracey's manual work exactly, matching is proven.

---

## 10. Going live (when the dry run checks out)

1. In Shopify, confirm the go-live prerequisites: **Shopify Shipping terms accepted**,
   the app user has **`buy_shipping_labels`**, and your **origin location / package
   setup** can buy a label manually in the admin.
2. Set `VENDOR_EMAIL_TO=sales@cinnamonprojects.com` (so the vendor gets the real email).
3. Flip `DRY_RUN=false` on **both** the web service and worker, and redeploy.
4. **Do one controlled real order first:** place/pick one eligible order, confirm the
   label buys, the postage/tracking is right, and the vendor can open the label. Void
   or refund that label in Shopify if it was a test.
5. Then let it run. Tracey's role shifts from *making* labels to *monitoring* the
   alerts and handling anything it flags as failed.

> **Do not wipe the database to go live.** The webhook fires once per order at
> creation, so only genuinely new orders get processed after the switch. Orders seen
> during the dry run are recorded and will be skipped on any stray retry — which
> protects you from buying a duplicate label for something already shipped by hand.

---

## 11. Troubleshooting — where to look

- **Render → your service → Logs**: startup errors, each processed order, notification failures.
- No emails? Check the worker logs for `notification failed`, verify SMTP creds, and
  that `DRY_RUN_EMAIL_TO` is set on the **worker** (it's the worker that sends them).
- Webhook 401s in web logs → `SHOPIFY_API_SECRET` doesn't match the app's API secret key.
- `/ready` shows `storeDriver: "file"` → `STORE_DRIVER=postgres` isn't set.
- Order never processed → confirm the webhook is registered (Step 5) and the worker is running.
- **Failed automations are intentionally not retried after a paid purchase starts** —
  treat any `failed` alert as a manual-review item.

---

## Appendix A — Environment variables

Set these on **both** the web service and the worker (identical values).

| Variable | Dry-run value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `SHOPIFY_SHOP_DOMAIN` | `your-store.myshopify.com` | Step 1 |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | `shpat_...` | Step 1 — secret |
| `SHOPIFY_API_SECRET` | *(app API secret key)* | Step 1 — secret, verifies webhooks |
| `SHOPIFY_API_VERSION` | `2026-07` | |
| `STORE_DRIVER` | `postgres` | |
| `DATABASE_URL` | *(Render Internal DB URL)* | Step 6a |
| `POSTGRES_AUTO_MIGRATE` | `true` | creates tables on boot |
| `AUTOMATION_CONFIG_PATH` | `./config/automation.example.json` | your matching rules |
| `INTERNAL_API_TOKEN` | *(long random string)* | protects the manual-enqueue endpoint |
| `DRY_RUN` | `true` | **the whole point** — no labels bought |
| `DRY_RUN_EMAIL_TO` | `you@apparatusstudio.com, tracey@apparatusstudio.com` | comma-separated |
| `SMTP_HOST` | e.g. `smtp.gmail.com` | Step 2 |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | |
| `SMTP_USER` | *(smtp user)* | Step 2 |
| `SMTP_PASS` | *(smtp password / api key)* | secret |
| `EMAIL_FROM` | `"Incense Automation <automation@apparatusstudio.com>"` | |
| `VENDOR_EMAIL_TO` | *(leave blank in dry run)* | set at go-live |

---

## Appendix B — Cheaper trial: run locally with ngrok

For the dry-run window only, instead of Render you can run both processes on your Mac:

```bash
# terminal 1 — public tunnel
ngrok http 3000            # copy the https URL it prints

# terminal 2 — the app (uses STORE_DRIVER=file, no Postgres needed)
cd ~/Documents/shopify-incense-dropship-automation
cp .env.example .env       # set DRY_RUN=true, DRY_RUN_EMAIL_TO=..., Shopify + SMTP creds, STORE_DRIVER=file
npm install && npm run dev

# terminal 3 — the worker
npm run worker

# once, to point Shopify at the tunnel:
npm run register:webhook -- https://<ngrok-id>.ngrok-free.app/webhooks/shopify/orders-create
```

Trade-off: your machine (and ngrok, and the free ngrok URL) must stay running the whole
time, and the ngrok URL changes each restart (re-register the webhook if it does). Fine
for a short supervised trial; use Render for anything you want to "set and forget."
