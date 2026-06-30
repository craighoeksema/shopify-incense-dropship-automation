import type { ShopifyGraphqlClient } from "../types.js";

export class ShopifyGraphqlError extends Error {
  constructor(
    message: string,
    public readonly details: unknown
  ) {
    super(message);
    this.name = "ShopifyGraphqlError";
  }
}

interface ShopifyAdminClientOptions {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
}

export class ShopifyAdminClient implements ShopifyGraphqlClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly accessToken: string;

  constructor(options: ShopifyAdminClientOptions) {
    const normalizedShopDomain = options.shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.endpoint = `https://${normalizedShopDomain}/admin/api/${options.apiVersion}/graphql.json`;
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async query<TData>(query: string, variables: Record<string, unknown> = {}): Promise<TData> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken
      },
      body: JSON.stringify({ query, variables })
    });

    const body = await response.json().catch(() => undefined) as unknown;
    if (!response.ok) {
      throw new ShopifyGraphqlError(`Shopify GraphQL request failed with HTTP ${response.status}`, body);
    }

    if (typeof body !== "object" || body === null) {
      throw new ShopifyGraphqlError("Shopify GraphQL response was not JSON", body);
    }

    const graphBody = body as { data?: TData; errors?: unknown };
    if (graphBody.errors) {
      throw new ShopifyGraphqlError("Shopify GraphQL returned errors", graphBody.errors);
    }

    if (!graphBody.data) {
      throw new ShopifyGraphqlError("Shopify GraphQL response did not include data", body);
    }

    return graphBody.data;
  }
}
