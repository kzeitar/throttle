import type { RateLimit } from '../RateLimit';

/**
 * Thrown when a rate limit is exceeded and the request cannot be fulfilled.
 *
 * Contains the RateLimit object with details about when to retry and remaining tokens.
 */
export class RateLimitExceededException extends Error {
  private readonly rateLimit: RateLimit;

  constructor(message: string, rateLimit: RateLimit) {
    super(message);
    this.name = 'RateLimitExceededException';
    this.rateLimit = rateLimit;
    Object.setPrototypeOf(this, RateLimitExceededException.prototype);
  }

  /**
   * Get the associated RateLimit object.
   */
  getRateLimit(): RateLimit {
    return this.rateLimit;
  }

  /**
   * Convenience method to get the retry time.
   */
  getRetryAfter(): Date {
    return this.rateLimit.getRetryAfter();
  }

  /**
   * Convenience method to get remaining tokens.
   */
  getRemainingTokens(): number {
    return this.rateLimit.getRemainingTokens();
  }

  /**
   * Convenience method to get the rate limit.
   */
  getLimit(): number {
    return this.rateLimit.getLimit();
  }
}
