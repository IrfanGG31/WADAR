/**
 * Public API of the `sales` module — the ONLY thing other modules may
 * import (CLAUDE.md aturan #1).
 */
export { SalesModule } from "./sales.module.js";
export type { SalesModuleOptions } from "./http/tokens.js";
export { SALES_CONSUMER, registerSalesConsumers } from "./application/consumers.js";
export { getOrderPaymentState, type OrderPaymentState } from "./application/queries.js";
