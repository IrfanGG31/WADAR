/**
 * Public API of the `insights` module — the ONLY thing other modules may
 * import (CLAUDE.md aturan #1).
 */
export { InsightsModule } from "./insights.module.js";
export { INSIGHTS_CONSUMER, registerInsightsConsumers } from "./application/consumers.js";
export { reconcileTenant, registerInsightsJobs, type ReconciliationResult } from "./application/reconcile.js";
