import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AutomationConfig, RuntimeConfig } from "./types.js";

const WeightInputSchema = z.object({
  value: z.number().positive(),
  unit: z.enum(["GRAMS", "KILOGRAMS", "OUNCES", "POUNDS"])
});

const DimensionsInputSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(["INCHES", "CENTIMETERS", "MILLIMETERS", "FEET", "METERS", "YARDS"])
});

const AutomationConfigSchema = z.object({
  target: z.object({
    mode: z.enum(["all_shippable_line_items_target", "any_target_line_item"]).default("all_shippable_line_items_target"),
    matchers: z.array(z.object({
      skuIncludes: z.array(z.string()).optional(),
      skuPrefixes: z.array(z.string()).optional(),
      titleIncludes: z.array(z.string()).optional(),
      titleRegexes: z.array(z.string()).optional(),
      productTags: z.array(z.string()).optional(),
      productTypes: z.array(z.string()).optional(),
      vendors: z.array(z.string()).optional(),
      productHandles: z.array(z.string()).optional(),
      productIds: z.array(z.string()).optional(),
      variantIds: z.array(z.string()).optional()
    })).min(1),
    eligibleFulfillmentOrderStatuses: z.array(z.string()).default(["OPEN"])
  }),
  shipping: z.object({
    packageInfo: z.object({
      customPackage: z.object({
        type: z.string().min(1),
        dimensions: DimensionsInputSchema,
        weight: WeightInputSchema
      }).optional(),
      carrierPackage: z.object({
        carrierCode: z.string().min(1),
        carrierPackageCode: z.string().min(1),
        name: z.string().optional()
      }).optional()
    }).refine((value) => Boolean(value.customPackage) !== Boolean(value.carrierPackage), {
      message: "Set exactly one of shipping.packageInfo.customPackage or shipping.packageInfo.carrierPackage"
    }),
    notifyCustomer: z.boolean().default(false),
    shippingDateOffsetDays: z.number().int().min(0).default(0),
    originAddress: z.object({
      address1: z.string().min(1),
      address2: z.string().optional(),
      city: z.string().min(1),
      company: z.string().optional(),
      countryCode: z.string().min(2),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      provinceCode: z.string().optional(),
      zip: z.string().min(1)
    }).optional(),
    preferredRateSelection: z.object({
      carrierCode: z.string().min(1),
      serviceCode: z.string().min(1)
    }).optional(),
    defaultTotalWeight: WeightInputSchema.optional(),
    pollIntervalMs: z.number().int().min(100).default(2000),
    maxPollAttempts: z.number().int().min(1).default(30)
  }),
  notifications: z.object({
    vendorEmailTo: z.string().email().optional(),
    internalEmailTo: z.string().email().optional(),
    dryRunEmailTo: z.string().optional(),
    slackWebhookUrl: z.string().url().optional()
  }).default({})
});

export const defaultAutomationConfig: AutomationConfig = {
  target: {
    mode: "all_shippable_line_items_target",
    eligibleFulfillmentOrderStatuses: ["OPEN"],
    matchers: [
      {
        skuIncludes: ["incense"],
        titleIncludes: ["incense"],
        productTags: ["incense"],
        productTypes: ["incense"]
      }
    ]
  },
  shipping: {
    packageInfo: {
      customPackage: {
        type: "BOX",
        dimensions: {
          length: 8,
          width: 6,
          height: 2,
          unit: "INCHES"
        },
        weight: {
          value: 2,
          unit: "OUNCES"
        }
      }
    },
    notifyCustomer: false,
    shippingDateOffsetDays: 0,
    pollIntervalMs: 2000,
    maxPollAttempts: 30
  },
  notifications: {}
};

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return ["true", "1", "yes", "y"].includes(value.toLowerCase());
}

function optionalString(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function loadAutomationConfig(env: NodeJS.ProcessEnv = process.env): AutomationConfig {
  let rawConfig: unknown = defaultAutomationConfig;
  const json = optionalString(env.AUTOMATION_CONFIG_JSON);
  const configPath = optionalString(env.AUTOMATION_CONFIG_PATH);

  if (json) {
    rawConfig = JSON.parse(json);
  } else if (configPath) {
    const resolved = path.resolve(process.cwd(), configPath);
    rawConfig = JSON.parse(fs.readFileSync(resolved, "utf8"));
  }

  const parsed = AutomationConfigSchema.parse(rawConfig);
  return {
    ...parsed,
    notifications: {
      ...parsed.notifications,
      vendorEmailTo: optionalString(env.VENDOR_EMAIL_TO) ?? parsed.notifications.vendorEmailTo,
      internalEmailTo: optionalString(env.INTERNAL_EMAIL_TO) ?? parsed.notifications.internalEmailTo,
      dryRunEmailTo: optionalString(env.DRY_RUN_EMAIL_TO) ?? parsed.notifications.dryRunEmailTo,
      slackWebhookUrl: optionalString(env.SLACK_WEBHOOK_URL) ?? parsed.notifications.slackWebhookUrl
    }
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const shopifyShopDomain = optionalString(env.SHOPIFY_SHOP_DOMAIN);
  const shopifyAdminAccessToken = optionalString(env.SHOPIFY_ADMIN_ACCESS_TOKEN);
  const shopifyApiSecret = optionalString(env.SHOPIFY_API_SECRET);

  if (!shopifyShopDomain) throw new Error("SHOPIFY_SHOP_DOMAIN is required");
  if (!shopifyAdminAccessToken) throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is required");
  if (!shopifyApiSecret) throw new Error("SHOPIFY_API_SECRET is required");

  const storeDriver = (env.STORE_DRIVER ?? "file") as RuntimeConfig["store"]["driver"];
  if (!["file", "postgres", "memory"].includes(storeDriver)) {
    throw new Error("STORE_DRIVER must be file, postgres, or memory");
  }

  const smtpHost = optionalString(env.SMTP_HOST);
  const smtp = smtpHost ? {
    host: smtpHost,
    port: Number(env.SMTP_PORT ?? 587),
    secure: parseBool(env.SMTP_SECURE, false),
    user: optionalString(env.SMTP_USER),
    pass: optionalString(env.SMTP_PASS),
    from: optionalString(env.EMAIL_FROM) ?? "Shopify Automation <automation@example.com>"
  } : undefined;

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: Number(env.PORT ?? 3000),
    shopifyShopDomain,
    shopifyAdminAccessToken,
    shopifyApiSecret,
    shopifyApiVersion: env.SHOPIFY_API_VERSION ?? "2026-07",
    internalApiToken: optionalString(env.INTERNAL_API_TOKEN),
    dryRun: parseBool(env.DRY_RUN, false),
    store: {
      driver: storeDriver,
      filePath: env.FILE_STORE_PATH ?? "./data/automation-store.json",
      databaseUrl: optionalString(env.DATABASE_URL),
      postgresAutoMigrate: parseBool(env.POSTGRES_AUTO_MIGRATE, false)
    },
    smtp,
    worker: {
      pollIntervalMs: Number(env.WORKER_POLL_INTERVAL_MS ?? 2000),
      maxAttempts: Number(env.WORKER_MAX_ATTEMPTS ?? 5)
    },
    automation: loadAutomationConfig(env)
  };
}
