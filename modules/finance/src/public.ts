/**
 * Public API of the `finance` module — the ONLY thing other modules may
 * import (CLAUDE.md aturan #1).
 */
export { FinanceModule } from "./finance.module.js";
export { FINANCE_CONSUMER, registerFinanceConsumers } from "./application/consumers.js";
export { profitAndLossTx, totalWalletBalanceTx } from "./application/queries.js";
