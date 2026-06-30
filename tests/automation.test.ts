import { describe, expect, it, vi } from "vitest";
import { OrderAutomationService, RetryableAutomationError } from "../src/automation/service.js";
import { MemoryAutomationStore } from "../src/store/memory.js";
import type { Notifier } from "../src/notifications/index.js";
import { testAutomationConfig, testOrder } from "./helpers.js";

function fakeNotifier(): Notifier & { vendorCalls: number; internalCalls: number } {
  return {
    vendorCalls: 0,
    internalCalls: 0,
    async notifyVendor() {
      this.vendorCalls += 1;
    },
    async notifyInternal() {
      this.internalCalls += 1;
    }
  };
}

describe("OrderAutomationService", () => {
  it("purchases labels, polls pending results, records completion, and notifies", async () => {
    const store = new MemoryAutomationStore();
    const notifier = fakeNotifier();
    const shopifyLabels = {
      getOrder: vi.fn(async () => testOrder()),
      purchaseShippingLabel: vi.fn(async () => ({
        id: "gid://shopify/ShippingLabelPurchaseResult/1",
        status: "PENDING_PURCHASE",
        errors: [],
        shippingLabels: []
      })),
      getPurchaseResult: vi.fn(async () => ({
        id: "gid://shopify/ShippingLabelPurchaseResult/1",
        status: "PURCHASED",
        errors: [],
        shippingLabels: [
          {
            id: "gid://shopify/ShippingLabel/1",
            trackingNumber: "9400",
            trackingCompany: "USPS",
            trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=9400",
            shippingDocuments: [
              {
                url: "https://cdn.shopify.com/label.pdf",
                format: "PDF"
              }
            ]
          }
        ]
      }))
    };

    const service = new OrderAutomationService({
      config: testAutomationConfig(),
      shopifyLabels: shopifyLabels as any,
      store,
      notifier,
      sleep: async () => undefined
    });

    const result = await service.processOrder("gid://shopify/Order/1");

    expect(result.status).toBe("completed");
    expect(result.labels).toHaveLength(1);
    expect(shopifyLabels.purchaseShippingLabel).toHaveBeenCalledWith(expect.objectContaining({
      fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1"
    }));
    expect(shopifyLabels.getPurchaseResult).toHaveBeenCalledTimes(1);
    expect(notifier.vendorCalls).toBe(1);
    expect(notifier.internalCalls).toBe(1);
    expect(store.snapshot().automationStatuses[0]?.[1].status).toBe("completed");
  });

  it("skips non-target orders without purchasing a label", async () => {
    const store = new MemoryAutomationStore();
    const notifier = fakeNotifier();
    const shopifyLabels = {
      getOrder: vi.fn(async () => testOrder({
        fulfillmentOrders: {
          nodes: [
            {
              ...testOrder().fulfillmentOrders.nodes[0]!,
              lineItems: {
                nodes: [
                  {
                    ...testOrder().fulfillmentOrders.nodes[0]!.lineItems.nodes[0]!,
                    sku: "SOAP-001",
                    productTitle: "Soap",
                    lineItem: {
                      id: "gid://shopify/LineItem/2",
                      name: "Soap",
                      title: "Soap",
                      sku: "SOAP-001",
                      quantity: 1,
                      currentQuantity: 1,
                      requiresShipping: true
                    }
                  }
                ]
              }
            }
          ]
        }
      })),
      purchaseShippingLabel: vi.fn(),
      getPurchaseResult: vi.fn()
    };

    const service = new OrderAutomationService({
      config: testAutomationConfig(),
      shopifyLabels: shopifyLabels as any,
      store,
      notifier,
      sleep: async () => undefined
    });

    const result = await service.processOrder("gid://shopify/Order/1");

    expect(result.status).toBe("skipped");
    expect(shopifyLabels.purchaseShippingLabel).not.toHaveBeenCalled();
    expect(notifier.vendorCalls).toBe(0);
  });

  it("does not buy twice for an already claimed order", async () => {
    const store = new MemoryAutomationStore();
    await store.claimOrderAutomation("gid://shopify/Order/1");
    const shopifyLabels = {
      getOrder: vi.fn(async () => testOrder()),
      purchaseShippingLabel: vi.fn(),
      getPurchaseResult: vi.fn()
    };

    const service = new OrderAutomationService({
      config: testAutomationConfig(),
      shopifyLabels: shopifyLabels as any,
      store,
      notifier: fakeNotifier(),
      sleep: async () => undefined
    });

    const result = await service.processOrder("gid://shopify/Order/1");

    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("already claimed");
    expect(shopifyLabels.purchaseShippingLabel).not.toHaveBeenCalled();
  });

  it("marks failed purchases and sends an internal notification", async () => {
    const store = new MemoryAutomationStore();
    const notifier = fakeNotifier();
    const shopifyLabels = {
      getOrder: vi.fn(async () => testOrder()),
      purchaseShippingLabel: vi.fn(async () => ({
        id: "gid://shopify/ShippingLabelPurchaseResult/1",
        status: "PURCHASE_FAILED",
        errors: [{ message: "No rates returned" }],
        shippingLabels: []
      })),
      getPurchaseResult: vi.fn()
    };

    const service = new OrderAutomationService({
      config: testAutomationConfig(),
      shopifyLabels: shopifyLabels as any,
      store,
      notifier,
      sleep: async () => undefined
    });

    const result = await service.processOrder("gid://shopify/Order/1");

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("No rates returned");
    expect(notifier.internalCalls).toBe(1);
    expect(store.snapshot().automationStatuses[0]?.[1].status).toBe("failed");
  });

  it("retries when fulfillment orders are not available yet", async () => {
    const service = new OrderAutomationService({
      config: testAutomationConfig(),
      shopifyLabels: {
        getOrder: vi.fn(async () => testOrder({ fulfillmentOrders: { nodes: [] } })),
        purchaseShippingLabel: vi.fn(),
        getPurchaseResult: vi.fn()
      } as any,
      store: new MemoryAutomationStore(),
      notifier: fakeNotifier(),
      sleep: async () => undefined
    });

    await expect(service.processOrder("gid://shopify/Order/1")).rejects.toBeInstanceOf(RetryableAutomationError);
  });
});
