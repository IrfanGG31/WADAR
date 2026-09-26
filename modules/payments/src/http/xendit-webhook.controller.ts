import { Body, Controller, Headers, HttpCode, Inject, Post } from "@nestjs/common";
import { PLATFORM_DB, problem, type Db } from "@wadar/platform";
import { timingSafeEqual } from "node:crypto";
import pino from "pino";
import { recordProviderPayment } from "../application/commands.js";
import { toProviderPayment, type XenditQrPayment } from "../infra/provider.js";
import { PAYMENTS_OPTIONS, type PaymentsModuleOptions } from "./tokens.js";

const logger = pino({ name: "xendit-webhook" });

function tokenMatches(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Xendit QR payment callback (ARCHITECTURE §6.1, §9): verify the callback
 * token (constant-time), dedupe on the provider event id, answer 200 fast.
 * Non-payment events are acknowledged and ignored so Xendit stops retrying.
 */
@Controller("v1/webhooks")
export class XenditWebhookController {
  constructor(
    @Inject(PLATFORM_DB) private readonly db: Db,
    @Inject(PAYMENTS_OPTIONS) private readonly options: PaymentsModuleOptions,
  ) {}

  @Post("xendit")
  @HttpCode(200)
  async handle(@Headers("x-callback-token") token: string | undefined, @Body() body: unknown) {
    if (this.options.provider !== "xendit" || !tokenMatches(this.options.callbackToken, token)) {
      logger.warn("rejected xendit callback: bad or missing token");
      throw problem(403, "INVALID_CALLBACK_TOKEN", "Invalid callback token.");
    }
    const event = body as { event?: string; data?: XenditQrPayment } | null;
    if (event?.event !== "qr.payment" || !event.data || event.data.status !== "SUCCEEDED") {
      return { status: "ignored" };
    }
    const result = await recordProviderPayment(this.db, "xendit", toProviderPayment(event.data), body);
    if (result === "unknown_intent") logger.warn({ reference: event.data.reference_id }, "xendit payment for unknown intent");
    return { status: result };
  }
}
