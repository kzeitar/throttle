import { RateLimitExceededError } from './errors/RateLimitExceededError';

/**
 * Result object from a rate limiting operation.
 *
 * Contains information about whether the request was accepted, how many tokens
 * are remaining, and when the client should retry if rejected.
 */
export class RateLimit {
  private readonly availableTokens: number;
  private readonly retryAfter: Date;
  private readonly accepted: boolean;
  private readonly limit: number;

  constructor(
    availableTokens: number,
    retryAfter: Date,
    accepted: boolean,
    limit: number
  ) {
    this.availableTokens = availableTokens;
    this.retryAfter = retryAfter;
    this.accepted = accepted;
    this.limit = limit;
  }

  /**
   * Check if the request was accepted.
   */
  isAccepted(): boolean {
    return this.accepted;
  }

  /**
   * Ensure the request was accepted, throw an exception otherwise.
   *
   * @throws {RateLimitExceededError} If the request was not accepted
   */
  ensureAccepted(): this {
    if (!this.accepted) {
      throw new RateLimitExceededError('Rate limit exceeded', this);
    }
    return this;
  }

  /**
   * Get the date/time when the client should retry.
   */
  getRetryAfter(): Date {
    return this.retryAfter;
  }

  /**
   * Get the number of remaining tokens.
   */
  getRemainingTokens(): number {
    return this.availableTokens;
  }

  /**
   * Get the rate limit maximum.
   */
  getLimit(): number {
    return this.limit;
  }

  /**
   * Wait until the retry time (blocking operation).
   *
   * Note: This uses a blocking setTimeout. Consider using async/await patterns
   * in production code instead.
   */
  async wait(): Promise<void> {
    const now = Date.now();
    const waitMs = this.retryAfter.getTime() - now;

    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}
