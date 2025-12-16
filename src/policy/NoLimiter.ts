import type { LimiterInterface } from '../LimiterInterface';
import { RateLimit } from '../RateLimit';
import { Reservation } from '../Reservation';

/**
 * No-op rate limiter that always accepts requests.
 *
 * Useful for testing, feature flags, or conditional rate limiting scenarios.
 */
export class NoLimiter implements LimiterInterface {
  /**
   * Always returns an immediate reservation with maximum tokens.
   */
  async reserve(_tokens: number = 1, _maxTime: number | null = null): Promise<Reservation> {
    const now = Date.now();
    const rateLimit = new RateLimit(
      Number.MAX_SAFE_INTEGER,
      new Date(now),
      true,
      Number.MAX_SAFE_INTEGER
    );
    return new Reservation(now, rateLimit);
  }

  /**
   * Always returns an accepted rate limit with maximum tokens.
   */
  async consume(_tokens: number = 1): Promise<RateLimit> {
    return new RateLimit(
      Number.MAX_SAFE_INTEGER,
      new Date(),
      true,
      Number.MAX_SAFE_INTEGER
    );
  }

  /**
   * No-op reset (nothing to reset).
   */
  async reset(): Promise<void> {
    // No-op
  }
}
