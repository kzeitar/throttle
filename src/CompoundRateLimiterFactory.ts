import type { RateLimiterFactoryInterface } from './RateLimiterFactoryInterface';
import type { LimiterInterface } from './LimiterInterface';
import { CompoundLimiter } from './CompoundLimiter';

/**
 * Factory for creating compound rate limiters.
 *
 * Combines multiple factories to create a single limiter that enforces
 * all policies simultaneously.
 */
export class CompoundRateLimiterFactory implements RateLimiterFactoryInterface {
  private readonly factories: RateLimiterFactoryInterface[];

  constructor(factories: RateLimiterFactoryInterface[]) {
    if (factories.length === 0) {
      throw new Error('CompoundRateLimiterFactory requires at least one factory');
    }
    this.factories = factories;
  }

  /**
   * Create a compound rate limiter.
   *
   * @param key - Optional key passed to all underlying factories
   */
  create(key?: string | null): LimiterInterface {
    const limiters = this.factories.map(factory => factory.create(key));
    return new CompoundLimiter(limiters);
  }
}
