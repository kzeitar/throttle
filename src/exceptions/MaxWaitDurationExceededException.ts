import type { RateLimit } from '../RateLimit';

/**
 * Thrown when a reservation would require waiting longer than the maximum allowed time.
 *
 * This exception is thrown by reserve() when the wait duration exceeds the maxTime parameter.
 */
export class MaxWaitDurationExceededException extends Error {
  private readonly rateLimit: RateLimit;

  constructor(message: string, rateLimit: RateLimit) {
    super(message);
    this.name = 'MaxWaitDurationExceededException';
    this.rateLimit = rateLimit;
    Object.setPrototypeOf(this, MaxWaitDurationExceededException.prototype);
  }

  /**
   * Get the associated RateLimit object.
   */
  getRateLimit(): RateLimit {
    return this.rateLimit;
  }
}
