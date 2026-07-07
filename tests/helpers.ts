import type {
  AutomationConfig,
  RuntimeConfig,
  ShopifyFulfillmentOrder,
  ShopifyOrder
} from "../src/types.js";

export function testAutomationConfig(overrides: Partial<AutomationConfig> = {}): AutomationConfig {
  const base: AutomationConfig = {
    target: {
      mode: "all_shippable_line_items_target",
      eligibleFulfillmentOrderStatuses: ["OPEN"],
      matchers: [
        {
          skuIncludes: ["INC"],
          titleIncludes: ["incense"],
          productTags: ["incense"],
          productTypes: ["Incense"]
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
      pollIntervalMs: 1,
      maxPollAttempts: 3
    },
    notifications: {}
  };

  return {
    ...base,
    ...overrides,
    target: {
      ...base.target,
      ...overrides.target
    },
    shipping: {
      ...base.shipping,
      ...overrides.shipping
    },
    notifications: {
      ...base.notifications,
      ...overrides.notifications
    }
  };
}

export function testRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  const base: RuntimeConfig = {
    nodeEnv: "test",
    port: 3000,
    shopifyShopDomain: "test-shop.myshopify.com",
    shopifyAdminAccessToken: "shpat_test",
    shopifyApiSecret: "webhook-secret",
    dryRun: false,
    shopifyApiVersion: "2026-07",
    internalApiToken: "internal-token",
    store: {
      driver: "memory",
      filePath: "./data/test.json",
      postgresAutoMigrate: false
    },
    worker: {
      pollIntervalMs: 1,
      maxAttempts: 3
    },
    automation: testAutomationConfig()
  };

  return {
    ...base,
    ...overrides,
    store: {
      ...base.store,
      ...overrides.store
    },
    worker: {
      ...base.worker,
      ...overrides.worker
    },
    automation: overrides.automation ?? base.automation
  };
}

export function testFulfillmentOrder(overrides: Partial<ShopifyFulfillmentOrder> = {}): ShopifyFulfillmentOrder {
  return {
    id: "gid://shopify/FulfillmentOrder/1",
    status: "OPEN",
    requestStatus: "UNSUBMITTED",
    remainingLineItemsWeight: {
      value: 12,
      unit: "OUNCES"
    },
    lineItems: {
      nodes: [
        {
          id: "gid://shopify/FulfillmentOrderLineItem/1",
          sku: "INC-001",
          vendor: "Cinnamon Projects",
          productTitle: "Cedar Incense",
          variantTitle: "Default",
          totalQuantity: 1,
          remainingQuantity: 1,
          requiresShipping: true,
          weight: {
            value: 10,
            unit: "OUNCES"
          },
          lineItem: {
            id: "gid://shopify/LineItem/1",
            name: "Cedar Incense",
            title: "Cedar Incense",
            sku: "INC-001",
            quantity: 1,
            currentQuantity: 1,
            requiresShipping: true,
            customAttributes: [],
            product: {
              id: "gid://shopify/Product/1",
              title: "Cedar Incense",
              handle: "cedar-incense",
              productType: "Incense",
              tags: ["incense", "dropship"],
              vendor: "Cinnamon Projects"
            },
            variant: {
              id: "gid://shopify/ProductVariant/1",
              title: "Default",
              sku: "INC-001"
            }
          }
        }
      ]
    },
    ...overrides
  };
}

export function testOrder(overrides: Partial<ShopifyOrder> = {}): ShopifyOrder {
  return {
    id: "gid://shopify/Order/1",
    name: "#1001",
    email: "customer@example.com",
    phone: "+15555550100",
    tags: [],
    createdAt: "2026-06-30T12:00:00Z",
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "UNFULFILLED",
    shippingAddress: {
      name: "Test Customer",
      address1: "123 Main St",
      city: "New York",
      provinceCode: "NY",
      zip: "10001",
      countryCodeV2: "US",
      phone: "+15555550100"
    },
    fulfillmentOrders: {
      nodes: [testFulfillmentOrder()]
    },
    ...overrides
  };
}
