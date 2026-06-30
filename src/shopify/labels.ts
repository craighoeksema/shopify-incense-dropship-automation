import type {
  AutomationConfig,
  PurchasedShippingLabel,
  ShippingLabelPurchaseResult,
  ShopifyFulfillmentOrder,
  ShopifyGraphqlClient,
  ShopifyOrder,
  WeightInput
} from "../types.js";
import {
  ORDER_FOR_AUTOMATION_QUERY,
  PURCHASE_SHIPPING_LABEL_MUTATION,
  SHIPPING_LABEL_PURCHASE_RESULT_QUERY
} from "./queries.js";

export interface OrderForAutomationResponse {
  order: ShopifyOrder | null;
}

interface PurchaseShippingLabelResponse {
  shippingLabelPurchase: {
    shippingLabelPurchaseResult: RawShippingLabelPurchaseResult | null;
    userErrors: Array<{ field?: string[] | null; message: string }>;
  };
}

interface ShippingLabelPurchaseResultResponse {
  node: RawShippingLabelPurchaseResult | null;
}

interface RawShippingLabelPurchaseResult {
  id: string;
  done: boolean;
  status: ShippingLabelPurchaseResult["status"];
  errors: Array<{ message?: string | null }>;
  shippingLabels: RawShippingLabel[];
}

interface RawShippingLabel {
  id: string;
  trackingInfo?: {
    number?: string | null;
    company?: string | null;
    url?: string | null;
  } | null;
  shippingDocuments?: Array<{
    documentType?: string | null;
    format?: string | null;
    url?: string | null;
  }> | null;
}

export class ShopifyLabelsService {
  constructor(private readonly client: ShopifyGraphqlClient) {}

  async getOrder(orderGid: string): Promise<ShopifyOrder | null> {
    const data = await this.client.query<OrderForAutomationResponse>(ORDER_FOR_AUTOMATION_QUERY, { id: orderGid });
    return data.order;
  }

  async purchaseShippingLabel(input: Record<string, unknown>): Promise<ShippingLabelPurchaseResult> {
    const data = await this.client.query<PurchaseShippingLabelResponse>(PURCHASE_SHIPPING_LABEL_MUTATION, {
      shippingLabelPurchase: input
    });

    const userErrors = data.shippingLabelPurchase.userErrors;
    if (userErrors.length > 0) {
      throw new Error(`Shopify rejected shippingLabelPurchase: ${userErrors.map((error) => error.message).join("; ")}`);
    }

    const result = data.shippingLabelPurchase.shippingLabelPurchaseResult;
    if (!result) {
      throw new Error("Shopify did not return shippingLabelPurchaseResult");
    }

    return normalizePurchaseResult(result);
  }

  async getPurchaseResult(resultId: string): Promise<ShippingLabelPurchaseResult> {
    const data = await this.client.query<ShippingLabelPurchaseResultResponse>(SHIPPING_LABEL_PURCHASE_RESULT_QUERY, {
      id: resultId
    });

    if (!data.node) {
      throw new Error(`Shipping label purchase result not found: ${resultId}`);
    }

    return normalizePurchaseResult(data.node);
  }
}

export function buildShippingLabelPurchaseInput(
  fulfillmentOrder: ShopifyFulfillmentOrder,
  config: AutomationConfig,
  now = new Date()
): Record<string, unknown> {
  const shippingDatetime = new Date(now);
  shippingDatetime.setUTCDate(shippingDatetime.getUTCDate() + config.shipping.shippingDateOffsetDays);

  const input: Record<string, unknown> = {
    fulfillmentOrderId: fulfillmentOrder.id,
    notifyCustomer: config.shipping.notifyCustomer,
    shippingDatetime: shippingDatetime.toISOString(),
    packageInfo: config.shipping.packageInfo
  };

  if (config.shipping.originAddress) {
    input.originAddress = config.shipping.originAddress;
  }

  if (config.shipping.preferredRateSelection) {
    input.preferredRateSelection = config.shipping.preferredRateSelection;
  }

  const totalWeight = config.shipping.defaultTotalWeight ?? fulfillmentOrder.remainingLineItemsWeight ?? sumLineItemWeights(fulfillmentOrder);
  if (totalWeight) {
    input.totalWeight = totalWeight;
  }

  return input;
}

function sumLineItemWeights(fulfillmentOrder: ShopifyFulfillmentOrder): WeightInput | undefined {
  const weightedLineItems = fulfillmentOrder.lineItems.nodes.filter((lineItem) => lineItem.weight);
  if (weightedLineItems.length === 0) return undefined;

  const firstUnit = weightedLineItems[0]?.weight?.unit;
  if (!firstUnit || weightedLineItems.some((lineItem) => lineItem.weight?.unit !== firstUnit)) {
    return undefined;
  }

  const value = weightedLineItems.reduce((total, lineItem) => {
    const remainingQuantity = lineItem.remainingQuantity ?? 0;
    return total + ((lineItem.weight?.value ?? 0) * remainingQuantity);
  }, 0);

  return value > 0 ? { value, unit: firstUnit } : undefined;
}

function normalizePurchaseResult(result: RawShippingLabelPurchaseResult): ShippingLabelPurchaseResult {
  return {
    id: result.id,
    status: result.status,
    errors: result.errors,
    shippingLabels: result.shippingLabels.map(normalizeShippingLabel)
  };
}

function normalizeShippingLabel(label: RawShippingLabel): PurchasedShippingLabel {
  return {
    id: label.id,
    trackingNumber: label.trackingInfo?.number ?? null,
    trackingCompany: label.trackingInfo?.company ?? null,
    trackingUrl: label.trackingInfo?.url ?? null,
    shippingDocuments: label.shippingDocuments?.map((document) => ({
      url: document.url,
      format: document.format ?? document.documentType ?? null
    })) ?? []
  };
}
