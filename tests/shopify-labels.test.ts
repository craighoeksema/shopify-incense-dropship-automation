import { describe, expect, it, vi } from "vitest";
import { buildShippingLabelPurchaseInput, ShopifyLabelsService } from "../src/shopify/labels.js";
import { ShopifyAdminClient } from "../src/shopify/client.js";
import { testAutomationConfig, testFulfillmentOrder } from "./helpers.js";

describe("Shopify Admin client", () => {
  it("posts GraphQL requests to the configured Admin API version", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: { shop: { name: "Test" } } }), { status: 200 }));
    const client = new ShopifyAdminClient({
      shopDomain: "test-shop.myshopify.com",
      accessToken: "token",
      apiVersion: "2026-07",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await client.query("query { shop { name } }");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://test-shop.myshopify.com/admin/api/2026-07/graphql.json",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Shopify-Access-Token": "token"
        })
      })
    );
  });
});

describe("shipping label purchase input", () => {
  it("omits preferredRateSelection so Shopify picks the cheapest rate", () => {
    const input = buildShippingLabelPurchaseInput(
      testFulfillmentOrder(),
      testAutomationConfig(),
      new Date("2026-06-30T12:00:00Z")
    );

    expect(input).toMatchObject({
      fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
      notifyCustomer: false,
      shippingDatetime: "2026-06-30T12:00:00.000Z",
      packageInfo: {
        customPackage: {
          type: "BOX"
        }
      },
      totalWeight: {
        value: 12,
        unit: "OUNCES"
      }
    });
    expect(input).not.toHaveProperty("preferredRateSelection");
  });

  it("passes explicit carrier and service when configured", () => {
    const config = testAutomationConfig({
      shipping: {
        ...testAutomationConfig().shipping,
        preferredRateSelection: {
          carrierCode: "usps",
          serviceCode: "priority_mail"
        }
      }
    });

    expect(buildShippingLabelPurchaseInput(testFulfillmentOrder(), config)).toMatchObject({
      preferredRateSelection: {
        carrierCode: "usps",
        serviceCode: "priority_mail"
      }
    });
  });
});

describe("ShopifyLabelsService", () => {
  it("raises Shopify user errors from shippingLabelPurchase", async () => {
    const client = {
      query: vi.fn(async () => ({
        shippingLabelPurchase: {
          shippingLabelPurchaseResult: null,
          userErrors: [{ message: "Not eligible" }]
        }
      }))
    };

    const service = new ShopifyLabelsService(client as any);
    await expect(service.purchaseShippingLabel({ fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1" }))
      .rejects
      .toThrow("Not eligible");
  });
});
