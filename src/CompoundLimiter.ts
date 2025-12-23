import type { LimiterInterface } from './LimiterInterface';
import type { RateLimit } from './RateLimit';
import { Reservation } from './Reservation';
import { ReserveNotSupportedError } from './errors/ReserveNotSupportedError';

/**
 * Compound rate limiter that combines multiple limiters.
 *
 * Uses AND logic: all limiters must accept for the request to be accepted.
 * Returns the most restrictive result (lowest available tokens, longest retry time).
 *
 * Note: Does NOT support the reserve() pattern due to complexity of coordinating
 * multiple reservations.
 */
export class CompoundLimiter implements LimiterInterface {
  private readonly limiters: LimiterInterface[];

  constructor(limiters: LimiterInterface[]) {
    if (limiters.length === 0) {
      throw new Error('CompoundLimiter requires at least one limiter');
    }
    this.limiters = limiters;
  }

  /**
   * Reserve is not supported by compound limiters.
   *
   * @throws {ReserveNotSupportedError} Always throws
   */
  async reserve(_tokens: number = 1, _maxTime: number | null = null): Promise<Reservation> {
    throw new ReserveNotSupportedError(
      'CompoundLimiter does not support the reserve() method. Use consume() instead.'
    );
  }

  /**
   * Try to consume tokens from all limiters.
   *
   * Returns the most restrictive result if any limiter rejects.
   */
  async consume(tokens: number = 1): Promise<RateLimit> {
    const results = await Promise.all(
      this.limiters.map(limiter => limiter.consume(tokens))
    );

    // Find the most restrictive result
    let mostRestrictive = results[0];

    for (const result of results.slice(1)) {
      // If current result is rejected and previous was accepted, or
      // if both rejected but current has longer wait time, or
      // if both accepted but current has fewer tokens
      if (
        (!result.isAccepted() && mostRestrictive.isAccepted()) ||
        (!result.isAccepted() &&
          !mostRestrictive.isAccepted() &&
          result.getRetryAfter() > mostRestrictive.getRetryAfter()) ||
        (result.isAccepted() &&
          mostRestrictive.isAccepted() &&
          result.getRemainingTokens() < mostRestrictive.getRemainingTokens())
      ) {
        mostRestrictive = result;
      }
    }

    return mostRestrictive;
  }

  /**
   * Reset all limiters.
   */
  async reset(): Promise<void> {
    await Promise.all(this.limiters.map(limiter => limiter.reset()));
  }
}
