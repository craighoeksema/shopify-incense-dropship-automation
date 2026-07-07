import type { RuntimeConfig } from "../types.js";
import { EmailNotifier } from "./email.js";
import { CompositeNotifier, NoopNotifier, type Notifier } from "./notifier.js";
import { SlackNotifier } from "./slack.js";

export function createNotifier(config: RuntimeConfig): Notifier {
  const notifiers: Notifier[] = [];

  if (config.automation.notifications.slackWebhookUrl) {
    notifiers.push(new SlackNotifier(config.automation.notifications.slackWebhookUrl));
  }

  if (config.smtp && (config.automation.notifications.vendorEmailTo || config.automation.notifications.internalEmailTo || config.automation.notifications.dryRunEmailTo)) {
    notifiers.push(new EmailNotifier(
      config.smtp,
      config.automation.notifications.vendorEmailTo,
      config.automation.notifications.internalEmailTo,
      config.automation.notifications.dryRunEmailTo
    ));
  }

  return notifiers.length > 0 ? new CompositeNotifier(notifiers) : new NoopNotifier();
}

export type { Notifier } from "./notifier.js";
