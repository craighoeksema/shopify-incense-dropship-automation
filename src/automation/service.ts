import type {
  AutomationConfig,
  AutomationRunResult,
  PurchasedShippingLabel,
  ShopifyFulfillmentOrder,
  ShopifyOrder
} from "../types.js";
import type { Notifier } from "../notifications/index.js";
import type { AutomationStore } from "../store/index.js";
import { buildShippingLabelPurchaseInput, ShopifyLabelsService } from "../shopify/labels.js";
import { selectMatchingFulfillmentOrders } from "./matcher.js";

export class RetryableAutomationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableAutomationError";
  }
}

interface OrderAutomationServiceOptions {
  config: AutomationConfig;
  shopifyLabels: ShopifyLabelsService;
  store: AutomationStore;
  notifier: Notifier;
  sleep?: (ms: number) => Promise<void>;
}

export class OrderAutomationService {
  private readonly config: AutomationConfig;
  private readonly shopifyLabels: ShopifyLabelsService;
  private readonly store: AutomationStore;
  private readonly notifier: Notifier;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: OrderAutomationServiceOptions) {
    this.config = options.config;
    this.shopifyLabels = options.shopifyLabels;
    this.store = options.store;
    this.notifier = options.notifier;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async processOrder(orderGid: string): Promise<AutomationRunResult> {
    const order = await this.shopifyLabels.getOrder(orderGid);
    if (!order) {
      throw new RetryableAutomationError(`Shopify order was not found: ${orderGid}`);
    }

    if (order.fulfillmentOrders.nodes.length === 0) {
      throw new RetryableAutomationError(`Shopify order has no fulfillment orders yet: ${order.name ?? orderGid}`);
    }

    const matchingFulfillmentOrders = selectMatchingFulfillmentOrders(order, this.config);
    const claimed = await this.store.claimOrderAutomation(orderGid);
    if (!claimed) {
      return {
        orderGid,
        orderName: order.name,
        status: "skipped",
        reason: "Order was already claimed by this automation"
      };
    }

    if (matchingFulfillmentOrders.length === 0) {
      const result: AutomationRunResult = {
        orderGid,
        orderName: order.name,
        status: "skipped",
        reason: "No fulfillment orders matched the target product rules"
      };
      await this.store.markOrderAutomationSkipped(orderGid, result);
      return result;
    }

    try {
      const labels: PurchasedShippingLabel[] = [];
      for (const fulfillmentOrder of matchingFulfillmentOrders) {
        labels.push(...await this.purchaseLabelsForFulfillmentOrder(fulfillmentOrder));
      }

      const result: AutomationRunResult = {
        orderGid,
        orderName: order.name,
        status: "completed",
        labels
      };
      await this.store.markOrderAutomationCompleted(orderGid, result);
      await this.notifyCompleted(order, result);
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const result: AutomationRunResult = {
        orderGid,
        orderName: order.name,
        status: "failed",
        reason
      };
      await this.store.markOrderAutomationFailed(orderGid, reason);
      await this.safeNotifyInternal(result);
      return result;
    }
  }

  private async purchaseLabelsForFulfillmentOrder(fulfillmentOrder: ShopifyFulfillmentOrder): Promise<PurchasedShippingLabel[]> {
    const input = buildShippingLabelPurchaseInput(fulfillmentOrder, this.config);
    let result = await this.shopifyLabels.purchaseShippingLabel(input);

    for (let attempt = 0; result.status === "PENDING_PURCHASE" && attempt < this.config.shipping.maxPollAttempts; attempt += 1) {
      await this.sleep(this.config.shipping.pollIntervalMs);
      result = await this.shopifyLabels.getPurchaseResult(result.id);
    }

    if (result.status !== "PURCHASED") {
      const errors = result.errors?.map((error) => error.message).filter(Boolean).join("; ");
      throw new Error(`Shipping label purchase did not complete successfully: ${result.status}${errors ? ` (${errors})` : ""}`);
    }

    return result.shippingLabels ?? [];
  }

  private async notifyCompleted(order: ShopifyOrder, result: AutomationRunResult): Promise<void> {
    await Promise.all([
      this.notifier.notifyVendor(order, result).catch((error: unknown) => {
        console.error("Vendor notification failed", error);
      }),
      this.notifier.notifyInternal(result).catch((error: unknown) => {
        console.error("Internal notification failed", error);
      })
    ]);
  }

  private async safeNotifyInternal(result: AutomationRunResult): Promise<void> {
    try {
      await this.notifier.notifyInternal(result);
    } catch (error) {
      console.error("Internal failure notification failed", error);
    }
  }
}
