import type {
  AutomationConfig,
  LineItemMatcherConfig,
  ShopifyFulfillmentOrder,
  ShopifyFulfillmentOrderLineItem,
  ShopifyOrder
} from "../types.js";

export interface FulfillmentOrderMatch {
  matches: boolean;
  reason: string;
  targetLineItems: ShopifyFulfillmentOrderLineItem[];
  shippableLineItems: ShopifyFulfillmentOrderLineItem[];
}

export function selectMatchingFulfillmentOrders(order: ShopifyOrder, config: AutomationConfig): ShopifyFulfillmentOrder[] {
  return order.fulfillmentOrders.nodes.filter((fulfillmentOrder) => {
    if (!config.target.eligibleFulfillmentOrderStatuses.includes(fulfillmentOrder.status)) {
      return false;
    }
    return matchFulfillmentOrder(fulfillmentOrder, config).matches;
  });
}

export function matchFulfillmentOrder(fulfillmentOrder: ShopifyFulfillmentOrder, config: AutomationConfig): FulfillmentOrderMatch {
  const shippableLineItems = fulfillmentOrder.lineItems.nodes.filter((lineItem) => {
    const remainingQuantity = lineItem.remainingQuantity ?? 0;
    return remainingQuantity > 0 && lineItem.requiresShipping !== false && lineItem.lineItem?.requiresShipping !== false;
  });

  const targetLineItems = shippableLineItems.filter((lineItem) => matchesAnyConfiguredMatcher(lineItem, config.target.matchers));

  if (shippableLineItems.length === 0) {
    return {
      matches: false,
      reason: "No shippable remaining fulfillment order line items",
      targetLineItems,
      shippableLineItems
    };
  }

  if (config.target.mode === "any_target_line_item") {
    return {
      matches: targetLineItems.length > 0,
      reason: targetLineItems.length > 0 ? "At least one target line item matched" : "No target line items matched",
      targetLineItems,
      shippableLineItems
    };
  }

  const allShippableItemsAreTarget = targetLineItems.length === shippableLineItems.length;
  return {
    matches: allShippableItemsAreTarget,
    reason: allShippableItemsAreTarget
      ? "All shippable line items matched target rules"
      : "Fulfillment order contains non-target shippable line items",
    targetLineItems,
    shippableLineItems
  };
}

export function matchesAnyConfiguredMatcher(lineItem: ShopifyFulfillmentOrderLineItem, matchers: LineItemMatcherConfig[]): boolean {
  return matchers.some((matcher) => matchesLineItem(lineItem, matcher));
}

export function matchesLineItem(lineItem: ShopifyFulfillmentOrderLineItem, matcher: LineItemMatcherConfig): boolean {
  const candidates = collectLineItemCandidates(lineItem);

  return (
    matchesIncludes(candidates.skus, matcher.skuIncludes) ||
    matchesPrefixes(candidates.skus, matcher.skuPrefixes) ||
    matchesIncludes(candidates.titles, matcher.titleIncludes) ||
    matchesRegex(candidates.titles, matcher.titleRegexes) ||
    matchesExact(candidates.productTags, matcher.productTags) ||
    matchesExact(candidates.productTypes, matcher.productTypes) ||
    matchesExact(candidates.vendors, matcher.vendors) ||
    matchesExact(candidates.productHandles, matcher.productHandles) ||
    matchesExact(candidates.productIds, matcher.productIds) ||
    matchesExact(candidates.variantIds, matcher.variantIds)
  );
}

function collectLineItemCandidates(lineItem: ShopifyFulfillmentOrderLineItem): {
  skus: string[];
  titles: string[];
  productTags: string[];
  productTypes: string[];
  vendors: string[];
  productHandles: string[];
  productIds: string[];
  variantIds: string[];
} {
  const orderLineItem = lineItem.lineItem;
  return {
    skus: compact([lineItem.sku, orderLineItem?.sku, orderLineItem?.variant?.sku]),
    titles: compact([
      lineItem.productTitle,
      lineItem.variantTitle,
      orderLineItem?.name,
      orderLineItem?.title,
      orderLineItem?.product?.title,
      orderLineItem?.variant?.title
    ]),
    productTags: compact(orderLineItem?.product?.tags ?? []),
    productTypes: compact([orderLineItem?.product?.productType]),
    vendors: compact([lineItem.vendor, orderLineItem?.product?.vendor]),
    productHandles: compact([orderLineItem?.product?.handle]),
    productIds: compact([orderLineItem?.product?.id]),
    variantIds: compact([lineItem.variant?.id, orderLineItem?.variant?.id])
  };
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesIncludes(candidates: string[], needles: string[] | undefined): boolean {
  if (!needles?.length) return false;
  return candidates.some((candidate) => needles.some((needle) => normalize(candidate).includes(normalize(needle))));
}

function matchesPrefixes(candidates: string[], prefixes: string[] | undefined): boolean {
  if (!prefixes?.length) return false;
  return candidates.some((candidate) => prefixes.some((prefix) => normalize(candidate).startsWith(normalize(prefix))));
}

function matchesExact(candidates: string[], expectedValues: string[] | undefined): boolean {
  if (!expectedValues?.length) return false;
  const expected = new Set(expectedValues.map(normalize));
  return candidates.some((candidate) => expected.has(normalize(candidate)));
}

function matchesRegex(candidates: string[], patterns: string[] | undefined): boolean {
  if (!patterns?.length) return false;
  return candidates.some((candidate) => {
    return patterns.some((pattern) => new RegExp(pattern, "i").test(candidate));
  });
}
