import type { RateLimiterFactoryInterface } from './RateLimiterFactoryInterface';
import type { LimiterInterface } from './LimiterInterface';
import type { StorageInterface } from './storage/StorageInterface';
import type { LockInterface } from './storage/LockInterface';
import { TokenBucketLimiter } from './policy/TokenBucketLimiter';
import { FixedWindowLimiter } from './policy/FixedWindowLimiter';
import { SlidingWindowLimiter } from './policy/SlidingWindowLimiter';
import { NoLimiter } from './policy/NoLimiter';
import { Rate } from './policy/Rate';
import { TimeUtil } from './util/TimeUtil';
import { InvalidIntervalError } from './errors/InvalidIntervalError';

/**
 * Configuration for token bucket policy.
 */
export interface TokenBucketConfig {
  policy: 'token_bucket';
  id: string;
  limit: number;
  rate: {
    interval: string;
    amount: number;
  };
}

/**
 * Configuration for fixed window policy.
 */
export interface FixedWindowConfig {
  policy: 'fixed_window';
  id: string;
  limit: number;
  interval: string;
}

/**
 * Configuration for sliding window policy.
 */
export interface SlidingWindowConfig {
  policy: 'sliding_window';
  id: string;
  limit: number;
  interval: string;
}

/**
 * Configuration for no-limit policy.
 */
export interface NoLimitConfig {
  policy: 'no_limit';
  id: string;
}

/**
 * Union type of all possible rate limiter configurations.
 */
export type RateLimiterConfig =
  | TokenBucketConfig
  | FixedWindowConfig
  | SlidingWindowConfig
  | NoLimitConfig;

/**
 * Factory for creating rate limiter instances based on configuration.
 *
 * Supports multiple rate limiting algorithms:
 * - token_bucket: Token bucket with configurable burst and refill rate
 * - fixed_window: Fixed time windows with hit counting
 * - sliding_window: Sliding window with weighted previous window
 * - no_limit: No rate limiting (always accepts)
 */
export class RateLimiterFactory implements RateLimiterFactoryInterface {
  private readonly config: RateLimiterConfig;
  private readonly storage: StorageInterface;
  private readonly lock?: LockInterface;

  constructor(
    config: RateLimiterConfig,
    storage: StorageInterface,
    lock?: LockInterface
  ) {
    this.config = this.validateConfig(config);
    this.storage = storage;
    this.lock = lock;
  }

  /**
   * Create a rate limiter instance.
   *
   * @param key - Optional key to distinguish between different limiters (e.g., user ID)
   */
  create(key?: string | null): LimiterInterface {
    const id = key ? `${this.config.id}:${key}` : this.config.id;

    switch (this.config.policy) {
      case 'token_bucket':
        return this.createTokenBucketLimiter(id, this.config);

      case 'fixed_window':
        return this.createFixedWindowLimiter(id, this.config);

      case 'sliding_window':
        return this.createSlidingWindowLimiter(id, this.config);

      case 'no_limit':
        return new NoLimiter();

      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = this.config;
        throw new Error(`Unknown policy: ${(_exhaustive as RateLimiterConfig).policy}`);
    }
  }

  /**
   * Validate and normalize configuration.
   */
  private validateConfig(config: RateLimiterConfig): RateLimiterConfig {
    if (!config.id) {
      throw new Error('Configuration must include an "id" field');
    }

    if (!config.policy) {
      throw new Error('Configuration must include a "policy" field');
    }

    // Validate policy-specific requirements
    switch (config.policy) {
      case 'token_bucket':
        if (!config.limit || config.limit < 1) {
          throw new Error('Token bucket requires a positive "limit" (burst size)');
        }
        if (!config.rate || !config.rate.interval || !config.rate.amount) {
          throw new Error(
            'Token bucket requires a "rate" object with "interval" and "amount"'
          );
        }
        break;

      case 'fixed_window':
      case 'sliding_window':
        if (!config.limit || config.limit < 1) {
          throw new Error(`${config.policy} requires a positive "limit"`);
        }
        if (!config.interval) {
          throw new Error(`${config.policy} requires an "interval"`);
        }
        break;

      case 'no_limit':
        // No additional validation needed
        break;

      default:
        throw new Error(`Unknown policy: ${(config as any).policy}`);
    }

    return config;
  }

  /**
   * Create a token bucket limiter.
   */
  private createTokenBucketLimiter(
    id: string,
    config: TokenBucketConfig
  ): TokenBucketLimiter {
    const intervalInSeconds = TimeUtil.durationToSeconds(config.rate.interval);
    const rate = new Rate(intervalInSeconds, config.rate.amount);

    return new TokenBucketLimiter(id, config.limit, rate, this.storage, this.lock);
  }

  /**
   * Create a fixed window limiter.
   */
  private createFixedWindowLimiter(
    id: string,
    config: FixedWindowConfig
  ): FixedWindowLimiter {
    const intervalInSeconds = TimeUtil.durationToSeconds(config.interval);

    if (intervalInSeconds < 1) {
      throw new InvalidIntervalError(
        `Interval must be at least 1 second, got ${intervalInSeconds}`
      );
    }

    return new FixedWindowLimiter(
      id,
      config.limit,
      intervalInSeconds,
      this.storage,
      this.lock
    );
  }

  /**
   * Create a sliding window limiter.
   */
  private createSlidingWindowLimiter(
    id: string,
    config: SlidingWindowConfig
  ): SlidingWindowLimiter {
    const intervalInSeconds = TimeUtil.durationToSeconds(config.interval);

    if (intervalInSeconds < 1) {
      throw new InvalidIntervalError(
        `Interval must be at least 1 second, got ${intervalInSeconds}`
      );
    }

    return new SlidingWindowLimiter(
      id,
      config.limit,
      intervalInSeconds,
      this.storage,
      this.lock
    );
  }
}
