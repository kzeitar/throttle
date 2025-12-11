/**
 * Thrown when an invalid interval is provided to a rate limiter.
 *
 * An interval is considered invalid if it's less than 1 second or otherwise
 * doesn't meet the requirements of the rate limiting policy.
 */
export class InvalidIntervalException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIntervalException';
    Object.setPrototypeOf(this, InvalidIntervalException.prototype);
  }
}
