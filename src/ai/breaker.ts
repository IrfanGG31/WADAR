/**
 * Circuit breaker per provider (TECH-SPEC §6.1): 5 failures within 60 s open
 * the circuit for 30 s, during which calls go straight to the fallback. After
 * the cool-down one trial call is let through (half-open): success closes the
 * circuit, failure opens it again. The clock is injected so tests are exact.
 */
export interface BreakerOptions {
  failureThreshold?: number;
  windowMs?: number;
  openMs?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly openMs: number;
  private readonly now: () => number;
  private failures: number[] = [];
  private openedAt: number | null = null;
  private trialInFlight = false;

  constructor({ failureThreshold = 5, windowMs = 60_000, openMs = 30_000, now = Date.now }: BreakerOptions = {}) {
    this.failureThreshold = failureThreshold;
    this.windowMs = windowMs;
    this.openMs = openMs;
    this.now = now;
  }

  get state(): "closed" | "open" | "half_open" {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt >= this.openMs ? "half_open" : "open";
  }

  /** May a call go to this provider now? */
  allow(): boolean {
    const state = this.state;
    if (state === "closed") return true;
    if (state === "open") return false;
    if (this.trialInFlight) return false;
    this.trialInFlight = true;
    return true;
  }

  success(): void {
    this.failures = [];
    this.openedAt = null;
    this.trialInFlight = false;
  }

  failure(): void {
    const t = this.now();
    if (this.state === "half_open") {
      this.openedAt = t;
      this.trialInFlight = false;
      return;
    }
    this.failures = [...this.failures.filter((f) => t - f < this.windowMs), t];
    if (this.failures.length >= this.failureThreshold) {
      this.openedAt = t;
      this.failures = [];
    }
  }
}
