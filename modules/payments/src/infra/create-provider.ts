import type { PaymentsModuleOptions } from "../http/tokens.js";
import { SimulatorProvider, XenditProvider, type PaymentProvider } from "./provider.js";

/** Fails loudly at boot if Xendit is selected without its keys (never silently falls back to fake payments). */
export function paymentsOptionsFromEnv(env: {
  PAYMENTS_PROVIDER: "simulator" | "xendit";
  XENDIT_SECRET_KEY?: string;
  XENDIT_CALLBACK_TOKEN?: string;
}): PaymentsModuleOptions {
  if (env.PAYMENTS_PROVIDER === "simulator") return { provider: "simulator" };
  if (!env.XENDIT_SECRET_KEY || !env.XENDIT_CALLBACK_TOKEN) {
    throw new Error("PAYMENTS_PROVIDER=xendit requires XENDIT_SECRET_KEY and XENDIT_CALLBACK_TOKEN");
  }
  return { provider: "xendit", secretKey: env.XENDIT_SECRET_KEY, callbackToken: env.XENDIT_CALLBACK_TOKEN };
}

export function createPaymentProvider(options: PaymentsModuleOptions): PaymentProvider {
  return options.provider === "xendit" ? new XenditProvider(options.secretKey) : new SimulatorProvider();
}
