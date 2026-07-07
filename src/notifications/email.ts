import nodemailer from "nodemailer";
import { formatDryRunEmail, formatInternalSummary, formatVendorEmail } from "../automation/messages.js";
import type { AutomationRunResult, RuntimeConfig, ShopifyOrder } from "../types.js";
import type { Notifier } from "./notifier.js";

export class EmailNotifier implements Notifier {
  private readonly transport: nodemailer.Transporter;

  constructor(
    smtpConfig: NonNullable<RuntimeConfig["smtp"]>,
    private readonly vendorEmailTo?: string,
    private readonly internalEmailTo?: string,
    private readonly dryRunEmailTo?: string
  ) {
    this.transport = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.user ? {
        user: smtpConfig.user,
        pass: smtpConfig.pass
      } : undefined
    });
    this.from = smtpConfig.from;
  }

  private readonly from: string;

  async notifyVendor(order: ShopifyOrder, result: AutomationRunResult): Promise<void> {
    if (!this.vendorEmailTo || result.status !== "completed") return;

    const message = formatVendorEmail(order, result);
    await this.transport.sendMail({
      from: this.from,
      to: this.vendorEmailTo,
      subject: message.subject,
      text: message.text
    });
  }

  async notifyInternal(result: AutomationRunResult): Promise<void> {
    if (!this.internalEmailTo) return;
    await this.transport.sendMail({
      from: this.from,
      to: this.internalEmailTo,
      subject: `Shopify dropship automation: ${result.status}`,
      text: formatInternalSummary(result)
    });
  }

  async notifyDryRun(order: ShopifyOrder, result: AutomationRunResult): Promise<void> {
    if (!this.dryRunEmailTo) return;

    const message = formatDryRunEmail(order, result);
    await this.transport.sendMail({
      from: this.from,
      to: this.dryRunEmailTo,
      subject: message.subject,
      text: message.text
    });
  }
}
