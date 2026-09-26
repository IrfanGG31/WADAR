import type { Logger } from "pino";
import type { Db } from "../infra/db.js";

export interface ScheduledJob {
  /** Unique, BullMQ-queue-safe name (no ":"). */
  name: string;
  /** Repeat interval. Handlers must be safe to run late, twice, or overlapping a previous run. */
  everyMs: number;
  run: (db: Db, logger: Logger) => Promise<void>;
}

/**
 * Modules register periodic work here (nightly forecast, reconciliation,
 * pending-payment sweeps); apps/worker turns each into a BullMQ job
 * scheduler so only one worker instance runs a given tick.
 */
export class ScheduledJobRegistry {
  private readonly jobs = new Map<string, ScheduledJob>();

  register(job: ScheduledJob): void {
    this.jobs.set(job.name, job);
  }

  all(): ScheduledJob[] {
    return [...this.jobs.values()];
  }
}
