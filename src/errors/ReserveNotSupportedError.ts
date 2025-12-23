/**
 * Thrown when reserve() is called on a limiter that doesn't support reservations.
 *
 * Some limiters (like CompoundLimiter) don't support the reserve pattern and will
 * throw this exception if reserve() is called.
 */
export class ReserveNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReserveNotSupportedError';
    Object.setPrototypeOf(this, ReserveNotSupportedError.prototype);
  }
}
