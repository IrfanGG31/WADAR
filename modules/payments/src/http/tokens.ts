export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
export const PAYMENTS_OPTIONS = Symbol("PAYMENTS_OPTIONS");

export type PaymentsModuleOptions =
  | { provider: "simulator" }
  | { provider: "xendit"; secretKey: string; callbackToken: string };
