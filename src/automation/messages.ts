import type { AutomationRunResult, PackageInfoConfig, ShopifyOrder } from "../types.js";

export function formatDryRunEmail(order: ShopifyOrder, result: AutomationRunResult): { subject: string; text: string } {
  const plans = result.plans ?? [];
  const planLines = plans.flatMap((plan, index) => [
    `Planned label ${index + 1}:`,
    `  Fulfillment order: ${plan.fulfillmentOrderId}`,
    `  Package: ${describePackage(plan.packageInfo)}`,
    `  Rate: ${plan.preferredRateSelection ? `${plan.preferredRateSelection.carrierCode} / ${plan.preferredRateSelection.serviceCode}` : "cheapest available rate"}`,
    `  Total weight: ${plan.totalWeight ? `${plan.totalWeight.value} ${plan.totalWeight.unit}` : "determined by Shopify at purchase"}`
  ]);

  return {
    subject: `[DRY RUN] Would have purchased a shipping label for ${order.name ?? order.id}`,
    text: [
      "DRY RUN — no shipping label was purchased and no email was sent to the vendor.",
      "In a live run, the automation would have bought the label(s) below and emailed the vendor.",
      "",
      "Ship-to:",
      formatAddress(order),
      "",
      "Would have purchased:",
      ...planLines,
      "",
      "Order details:",
      `  Shopify order ID: ${order.id}`,
      `  Customer email: ${order.email ?? "not provided"}`,
      `  Customer phone: ${order.phone ?? "not provided"}`
    ].join("\n")
  };
}

export function formatDryRunSummary(result: AutomationRunResult): string {
  const planCount = result.plans?.length ?? 0;
  return `[DRY RUN] Would have purchased ${planCount} label(s) for ${result.orderName ?? result.orderGid}. No label bought, no vendor email sent.`;
}

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

function describePackage(packageInfo: PackageInfoConfig): string {
  if (packageInfo.customPackage) {
    const { type, dimensions, weight } = packageInfo.customPackage;
    return `${type} ${dimensions.length}x${dimensions.width}x${dimensions.height} ${dimensions.unit}, ${weight.value} ${weight.unit}`;
  }
  if (packageInfo.carrierPackage) {
    const carrier = packageInfo.carrierPackage;
    return `carrier package ${carrier.carrierCode} / ${carrier.carrierPackageCode}${carrier.name ? ` (${carrier.name})` : ""}`;
  }
  return "unspecified package";
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
