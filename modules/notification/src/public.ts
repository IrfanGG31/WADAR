/**
 * Public API of the `notification` module — the ONLY thing other modules may
 * import (CLAUDE.md aturan #1).
 */
export { NotificationModule } from "./notification.module.js";
export { NOTIFICATION_CONSUMER, registerNotificationConsumers } from "./application/consumers.js";
