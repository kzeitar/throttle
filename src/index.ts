/**
 * @throttle - TypeScript Rate Limiter Library
 *
 * A production-ready rate limiting library supporting multiple algorithms:
 * - Token Bucket: Allows bursts with steady refill rate
 * - Fixed Window: Simple window-based limiting
 * - Sliding Window: Smoothed rate limiting across window boundaries
 * - No Limit: Pass-through for testing/conditional scenarios
 */

// Core interfaces
export type { LimiterInterface } from './LimiterInterface';
export type { LimiterStateInterface } from './LimiterStateInterface';
export type { RateLimiterFactoryInterface } from './RateLimiterFactoryInterface';

// Core classes
export { RateLimit } from './RateLimit';
export { Reservation } from './Reservation';

// Factories
export {
  RateLimiterFactory,
  type RateLimiterConfig,
  type TokenBucketConfig,
  type FixedWindowConfig,
  type SlidingWindowConfig,
  type NoLimitConfig,
} from './RateLimiterFactory';
export { CompoundRateLimiterFactory } from './CompoundRateLimiterFactory';
export { CompoundLimiter } from './CompoundLimiter';

// Storage
export type { StorageInterface } from './storage/StorageInterface';
export { InMemoryStorage } from './storage/InMemoryStorage';
export type { LockInterface } from './storage/LockInterface';
export { NoLock } from './storage/LockInterface';

// Policy implementations
export { Rate } from './policy/Rate';
export { TokenBucket } from './policy/TokenBucket';
export { TokenBucketLimiter } from './policy/TokenBucketLimiter';
export { Window } from './policy/Window';
export { FixedWindowLimiter } from './policy/FixedWindowLimiter';
export { SlidingWindow } from './policy/SlidingWindow';
export { SlidingWindowLimiter } from './policy/SlidingWindowLimiter';
export { NoLimiter } from './policy/NoLimiter';

// Exceptions
export { InvalidIntervalError } from './errors/InvalidIntervalError';
export { MaxWaitDurationExceededError } from './errors/MaxWaitDurationExceededError';
export { RateLimitExceededError } from './errors/RateLimitExceededError';
export { ReserveNotSupportedError } from './errors/ReserveNotSupportedError';

// Utilities
export { TimeUtil } from './util/TimeUtil';
