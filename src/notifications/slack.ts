import { formatDryRunSummary, formatInternalSummary } from "../automation/messages.js";
import type { AutomationRunResult, ShopifyOrder } from "../types.js";
import type { Notifier } from "./notifier.js";

export class SlackNotifier implements Notifier {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async notifyVendor(_order: ShopifyOrder, _result: AutomationRunResult): Promise<void> {
    return undefined;
  }

  async notifyInternal(result: AutomationRunResult): Promise<void> {
    await this.post(formatInternalSummary(result));
  }

  async notifyDryRun(_order: ShopifyOrder, result: AutomationRunResult): Promise<void> {
    await this.post(formatDryRunSummary(result));
  }

  private async post(text: string): Promise<void> {
    const response = await this.fetchImpl(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed with HTTP ${response.status}`);
    }
  }
}
