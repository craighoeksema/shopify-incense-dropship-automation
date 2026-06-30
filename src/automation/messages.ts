import type { AutomationRunResult, ShopifyOrder } from "../types.js";

export function formatVendorEmail(order: ShopifyOrder, result: AutomationRunResult): { subject: string; text: string } {
  const labels = result.labels ?? [];
  const labelLines = labels.flatMap((label, index) => {
    const documentUrls = label.shippingDocuments?.map((document) => document.url).filter(Boolean) ?? [];
    return [
      `Label ${index + 1}:`,
      `  Label ID: ${label.id}`,
      `  Tracking: ${label.trackingNumber ?? "not returned"}${label.trackingCompany ? ` (${label.trackingCompany})` : ""}`,
      `  Tracking URL: ${label.trackingUrl ?? "not returned"}`,
      ...documentUrls.map((url) => `  Shipping label: ${url}`)
    ];
  });

  return {
    subject: `Dropship fulfillment request for ${order.name ?? order.id}`,
    text: [
      `A Shopify Shipping label has been purchased for ${order.name ?? order.id}.`,
      "",
      "Ship-to:",
      formatAddress(order),
      "",
      "Labels:",
      ...labelLines,
      "",
      "Order details:",
      `  Shopify order ID: ${order.id}`,
      `  Customer email: ${order.email ?? "not provided"}`,
      `  Customer phone: ${order.phone ?? "not provided"}`
    ].join("\n")
  };
}

export function formatInternalSummary(result: AutomationRunResult): string {
  if (result.status === "completed") {
    const labelCount = result.labels?.length ?? 0;
    return `Shopify dropship automation completed for ${result.orderName ?? result.orderGid}. Purchased ${labelCount} label(s).`;
  }

  if (result.status === "skipped") {
    return `Shopify dropship automation skipped ${result.orderName ?? result.orderGid}: ${result.reason ?? "no reason provided"}.`;
  }

  return `Shopify dropship automation failed for ${result.orderName ?? result.orderGid}: ${result.reason ?? "unknown error"}.`;
}

function formatAddress(order: ShopifyOrder): string {
  const address = order.shippingAddress;
  if (!address) return "  No shipping address on order";

  return [
    address.name,
    address.company,
    address.address1,
    address.address2,
    [address.city, address.provinceCode, address.zip].filter(Boolean).join(", "),
    address.countryCodeV2,
    address.phone ? `Phone: ${address.phone}` : undefined
  ]
    .filter(Boolean)
    .map((line) => `  ${line}`)
    .join("\n");
}
