import { describe, expect, it } from "vitest";
import { matchFulfillmentOrder, matchesLineItem, selectMatchingFulfillmentOrders } from "../src/automation/matcher.js";
import { testAutomationConfig, testFulfillmentOrder, testOrder } from "./helpers.js";

describe("target product matching", () => {
  it("matches flexible product signals", () => {
    const lineItem = testFulfillmentOrder().lineItems.nodes[0]!;

    expect(matchesLineItem(lineItem, { skuPrefixes: ["INC-"] })).toBe(true);
    expect(matchesLineItem(lineItem, { titleRegexes: ["cedar\\s+incense"] })).toBe(true);
    expect(matchesLineItem(lineItem, { productTags: ["dropship"] })).toBe(true);
    expect(matchesLineItem(lineItem, { productIds: ["gid://shopify/Product/1"] })).toBe(true);
    expect(matchesLineItem(lineItem, { variantIds: ["gid://shopify/ProductVariant/1"] })).toBe(true);
  });

  it("requires all shippable line items to match by default", () => {
    const mixedFulfillmentOrder = testFulfillmentOrder({
      lineItems: {
        nodes: [
          ...testFulfillmentOrder().lineItems.nodes,
          {
            id: "gid://shopify/FulfillmentOrderLineItem/2",
            sku: "SOAP-001",
            productTitle: "Soap",
            variantTitle: "Default",
            totalQuantity: 1,
            remainingQuantity: 1,
            requiresShipping: true,
            lineItem: {
              id: "gid://shopify/LineItem/2",
              name: "Soap",
              title: "Soap",
              sku: "SOAP-001",
              quantity: 1,
              currentQuantity: 1,
              requiresShipping: true,
              product: {
                id: "gid://shopify/Product/2",
                title: "Soap",
                handle: "soap",
                productType: "Body",
                tags: ["soap"],
                vendor: "Cinnamon Projects"
              },
              variant: {
                id: "gid://shopify/ProductVariant/2",
                title: "Default",
                sku: "SOAP-001"
              }
            }
          }
        ]
      }
    });

    const match = matchFulfillmentOrder(mixedFulfillmentOrder, testAutomationConfig());
    expect(match.matches).toBe(false);
    expect(match.reason).toContain("non-target");
  });

  it("can allow any target line item when configured", () => {
    const fulfillmentOrder = testFulfillmentOrder({
      lineItems: {
        nodes: [
          ...testFulfillmentOrder().lineItems.nodes,
          {
            id: "gid://shopify/FulfillmentOrderLineItem/2",
            sku: "SOAP-001",
            productTitle: "Soap",
            variantTitle: "Default",
            totalQuantity: 1,
            remainingQuantity: 1,
            requiresShipping: true,
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
    });

    const config = testAutomationConfig({
      target: {
        ...testAutomationConfig().target,
        mode: "any_target_line_item"
      }
    });

    expect(matchFulfillmentOrder(fulfillmentOrder, config).matches).toBe(true);
  });

  it("only selects eligible fulfillment order statuses", () => {
    const order = testOrder({
      fulfillmentOrders: {
        nodes: [
          testFulfillmentOrder({ id: "gid://shopify/FulfillmentOrder/1", status: "OPEN" }),
          testFulfillmentOrder({ id: "gid://shopify/FulfillmentOrder/2", status: "CLOSED" })
        ]
      }
    });

    expect(selectMatchingFulfillmentOrders(order, testAutomationConfig()).map((fo) => fo.id)).toEqual([
      "gid://shopify/FulfillmentOrder/1"
    ]);
  });
});
