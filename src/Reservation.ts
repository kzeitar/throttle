import type { RateLimit } from './RateLimit';

/**
 * Represents a token reservation from a rate limiter.
 *
 * A reservation indicates when tokens will be available and allows waiting
 * until that time.
 */
export class Reservation {
  private readonly timeToAct: number;
  private readonly rateLimit: RateLimit;

  constructor(timeToAct: number, rateLimit: RateLimit) {
    this.timeToAct = timeToAct;
    this.rateLimit = rateLimit;
  }

  /**
   * Get the timestamp (in milliseconds) when the action can be performed.
   */
  getTimeToAct(): number {
    return this.timeToAct;
  }

  /**
   * Get the duration to wait (in milliseconds) before the action can be performed.
   */
  getWaitDuration(): number {
    return Math.max(0, this.timeToAct - Date.now());
  }

  /**
   * Get the associated RateLimit object.
   */
  getRateLimit(): RateLimit {
    return this.rateLimit;
  }

  /**
   * Wait until the reservation time (async operation).
   */
  async wait(): Promise<void> {
    const waitMs = this.getWaitDuration();
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}
