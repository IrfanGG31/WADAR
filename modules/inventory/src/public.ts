/**
 * Public API of the `inventory` module — the ONLY thing other modules may
 * import (CLAUDE.md aturan #1).
 */
export { InventoryModule } from "./inventory.module.js";
export { INVENTORY_CONSUMER, registerInventoryConsumers } from "./application/consumers.js";
export { getStockSnapshot, type StockSnapshot } from "./application/queries.js";
export {
  FORECAST_CONSUMER,
  listStockAlerts,
  refreshAllForecasts,
  registerForecastConsumer,
  registerInventoryJobs,
  type StockAlertItem,
} from "./application/forecast.js";
