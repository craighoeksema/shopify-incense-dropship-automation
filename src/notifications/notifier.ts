import type { AutomationRunResult, ShopifyOrder } from "../types.js";

export interface Notifier {
  notifyVendor(order: ShopifyOrder, result: AutomationRunResult): Promise<void>;
  notifyInternal(result: AutomationRunResult): Promise<void>;
}

export class CompositeNotifier implements Notifier {
  constructor(private readonly notifiers: Notifier[]) {}

  async notifyVendor(order: ShopifyOrder, result: AutomationRunResult): Promise<void> {
    await Promise.all(this.notifiers.map((notifier) => notifier.notifyVendor(order, result)));
  }

  async notifyInternal(result: AutomationRunResult): Promise<void> {
    await Promise.all(this.notifiers.map((notifier) => notifier.notifyInternal(result)));
  }
}

export class NoopNotifier implements Notifier {
  async notifyVendor(): Promise<void> {
    return undefined;
  }

  async notifyInternal(): Promise<void> {
    return undefined;
  }
}
