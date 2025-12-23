import type { RateLimit } from './RateLimit';
import type { Reservation } from './Reservation';

/**
 * Main contract for all rate limiters.
 *
 * Provides two patterns for rate limiting:
 * - reserve(): Reserve tokens and wait if necessary
 * - consume(): Immediately try to consume tokens
 */
export interface LimiterInterface {
  /**
   * Reserve tokens with optional maximum wait time.
   *
   * @param tokens - Number of tokens to reserve
   * @param maxTime - Maximum time to wait (in seconds), or null for no limit
   * @returns A Reservation object
   * @throws {MaxWaitDurationExceededError} If wait time exceeds maxTime
   */
  reserve(tokens: number, maxTime?: number | null): Promise<Reservation>;

  /**
   * Try to consume tokens immediately.
   *
   * @param tokens - Number of tokens to consume
   * @returns A RateLimit object indicating success or failure
   */
  consume(tokens: number): Promise<RateLimit>;

  /**
   * Reset the rate limiter state.
   */
  reset(): Promise<void>;
}
