import type { LimiterInterface } from './LimiterInterface';

/**
 * Factory interface for creating rate limiter instances.
 *
 * Factories are responsible for creating configured limiters with optional keys
 * for multi-tenant or per-resource rate limiting.
 */
export interface RateLimiterFactoryInterface {
  /**
   * Create a rate limiter instance.
   *
   * @param key - Optional key to distinguish between different limiters (e.g., user ID, API key)
   * @returns A configured LimiterInterface instance
   */
  create(key?: string | null): LimiterInterface;
}
