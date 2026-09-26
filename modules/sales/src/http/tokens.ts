export const SALES_OPTIONS = Symbol("SALES_OPTIONS");

export interface SalesModuleOptions {
  /** HMAC secret for public receipt links. */
  receiptSecret: string;
}
