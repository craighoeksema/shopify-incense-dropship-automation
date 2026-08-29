export type WeightUnit = "GRAMS" | "KILOGRAMS" | "OUNCES" | "POUNDS";
export type LengthUnit = "INCHES" | "CENTIMETERS" | "MILLIMETERS" | "FEET" | "METERS" | "YARDS";

export interface WeightInput {
  value: number;
  unit: WeightUnit;
}

export interface DimensionsInput {
  length: number;
  width: number;
  height: number;
  unit: LengthUnit;
}

export interface CustomPackageConfig {
  type: string;
  dimensions: DimensionsInput;
  weight: WeightInput;
}

export interface PackageInfoConfig {
  customPackage?: CustomPackageConfig;
  carrierPackage?: {
    carrierCode: string;
    carrierPackageCode: string;
    name?: string;
  };
}

export interface PreferredRateSelectionConfig {
  carrierCode: string;
  serviceCode: string;
}

export interface AddressInput {
  address1: string;
  address2?: string;
  city: string;
  company?: string;
  countryCode: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  provinceCode?: string;
  zip: string;
}

export interface LineItemMatcherConfig {
  skuIncludes?: string[];
  skuPrefixes?: string[];
  titleIncludes?: string[];
  titleRegexes?: string[];
  productTags?: string[];
  productTypes?: string[];
  vendors?: string[];
  productHandles?: string[];
  productIds?: string[];
  variantIds?: string[];
}

export interface TargetConfig {
  mode: "all_shippable_line_items_target" | "any_target_line_item";
  matchers: LineItemMatcherConfig[];
  eligibleFulfillmentOrderStatuses: string[];
}

export interface ShippingConfig {
  packageInfo: PackageInfoConfig;
  notifyCustomer: boolean;
  shippingDateOffsetDays: number;
  originAddress?: AddressInput;
  preferredRateSelection?: PreferredRateSelectionConfig;
  defaultTotalWeight?: WeightInput;
  pollIntervalMs: number;
  maxPollAttempts: number;
}

export interface NotificationConfig {
  vendorEmailTo?: string;
  internalEmailTo?: string;
  dryRunEmailTo?: string;
  slackWebhookUrl?: string;
}

export interface AutomationConfig {
  target: TargetConfig;
  shipping: ShippingConfig;
  notifications: NotificationConfig;
}

export interface RuntimeConfig {
  nodeEnv: string;
  port: number;
  shopifyShopDomain: string;
  shopifyAdminAccessToken: string;
  shopifyApiSecret: string;
  shopifyApiVersion: string;
  internalApiToken?: string;
  dryRun: boolean;
  store: {
    driver: "file" | "postgres" | "memory";
    filePath: string;
    databaseUrl?: string;
    postgresAutoMigrate: boolean;
  };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    from: string;
  };
  worker: {
    pollIntervalMs: number;
    maxAttempts: number;
  };
  automation: AutomationConfig;
}

export interface ShopifyGraphqlClient {
  query<TData>(query: string, variables?: Record<string, unknown>): Promise<TData>;
}

export interface ShopifyMoneySet {
  shopMoney?: {
    amount: string;
    currencyCode: string;
  };
}

export interface ShopifyWeight {
  value: number;
  unit: WeightUnit;
}

export interface ShopifyProduct {
  id: string;
  title?: string | null;
  handle?: string | null;
  productType?: string | null;
  tags?: string[] | null;
  vendor?: string | null;
}

export interface ShopifyVariant {
  id: string;
  title?: string | null;
  sku?: string | null;
}

export interface ShopifyLineItem {
  id: string;
  name?: string | null;
  title?: string | null;
  sku?: string | null;
  quantity?: number | null;
  currentQuantity?: number | null;
  requiresShipping?: boolean | null;
  customAttributes?: Array<{ key: string; value?: string | null }> | null;
  product?: ShopifyProduct | null;
  variant?: ShopifyVariant | null;
}

export interface ShopifyFulfillmentOrderLineItem {
  id: string;
  sku?: string | null;
  vendor?: string | null;
  productTitle?: string | null;
  variantTitle?: string | null;
  totalQuantity?: number | null;
  remainingQuantity?: number | null;
  requiresShipping?: boolean | null;
  weight?: ShopifyWeight | null;
  variant?: ShopifyVariant | null;
  lineItem?: ShopifyLineItem | null;
}

export interface ShopifyFulfillmentOrder {
  id: string;
  status: string;
  requestStatus?: string | null;
  remainingLineItemsWeight?: ShopifyWeight | null;
  lineItems: {
    nodes: ShopifyFulfillmentOrderLineItem[];
  };
}

export interface ShopifyAddress {
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  countryCodeV2?: string | null;
  phone?: string | null;
}

export interface ShopifyOrder {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  createdAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  shippingAddress?: ShopifyAddress | null;
  fulfillmentOrders: {
    nodes: ShopifyFulfillmentOrder[];
  };
}

export interface ShippingDocument {
  url?: string | null;
  format?: string | null;
}

export interface PurchasedShippingLabel {
  id: string;
  trackingNumber?: string | null;
  trackingCompany?: string | null;
  trackingUrl?: string | null;
  shippingDocuments?: ShippingDocument[] | null;
}

export interface ShippingLabelPurchaseResult {
  id: string;
  status: "PENDING_PURCHASE" | "PURCHASED" | "PURCHASE_FAILED" | string;
  errors?: Array<{ message?: string | null }> | null;
  shippingLabels?: PurchasedShippingLabel[] | null;
}

export interface DryRunPlan {
  fulfillmentOrderId: string;
  packageInfo: PackageInfoConfig;
  preferredRateSelection?: PreferredRateSelectionConfig;
  totalWeight?: WeightInput;
}

export interface AutomationRunResult {
  orderGid: string;
  orderName?: string | null;
  status: "completed" | "skipped" | "failed";
  reason?: string;
  labels?: PurchasedShippingLabel[];
  dryRun?: boolean;
  plans?: DryRunPlan[];
}

export interface OrderJob {
  id: string;
  orderGid: string;
  webhookId?: string;
  shopDomain?: string;
  attempts: number;
}
