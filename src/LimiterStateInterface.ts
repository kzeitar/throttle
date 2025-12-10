/**
 * Interface for serializable rate limiter state objects.
 *
 * State objects must be JSON-serializable and provide their own expiration time.
 */
export interface LimiterStateInterface {
  /**
   * Get the unique identifier for this state object.
   */
  getId(): string;

  /**
   * Get the expiration time (in seconds since epoch) or null if no expiration.
   */
  getExpirationTime(): number | null;
}
