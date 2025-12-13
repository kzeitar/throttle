import type { LimiterInterface } from '../LimiterInterface';
import type { StorageInterface } from '../storage/StorageInterface';
import type { LockInterface } from '../storage/LockInterface';
import { RateLimit } from '../RateLimit';
import { Reservation } from '../Reservation';
import { MaxWaitDurationExceededException } from '../exceptions/MaxWaitDurationExceededException';
import { TokenBucket } from './TokenBucket';
import { Rate } from './Rate';
import { TimeUtil } from '../util/TimeUtil';
import { NoLock } from '../storage/LockInterface';

/**
 * Token bucket rate limiter implementation.
 *
 * The token bucket algorithm allows bursts up to the bucket size while
 * maintaining a steady refill rate. This is the most flexible algorithm
 * and supports both reserve() and consume() patterns.
 */
export class TokenBucketLimiter implements LimiterInterface {
  private readonly id: string;
  private readonly burstSize: number;
  private readonly rate: Rate;
  private readonly storage: StorageInterface;
  private readonly lock: LockInterface;

  constructor(
    id: string,
    burstSize: number,
    rate: Rate,
    storage: StorageInterface,
    lock?: LockInterface
  ) {
    this.id = id;
    this.burstSize = burstSize;
    this.rate = rate;
    this.storage = storage;
    this.lock = lock ?? new NoLock();
  }

  /**
   * Reserve tokens with optional maximum wait time.
   */
  async reserve(tokens: number = 1, maxTime: number | null = null): Promise<Reservation> {
    return this.lock.withLock(this.id, async () => {
      const now = TimeUtil.now();
      const bucket = await this.getOrCreateBucket();

      const availableTokens = bucket.getAvailableTokens(now);

      // Update bucket state to account for elapsed time
      bucket.setTokens(availableTokens);
      bucket.setTimer(now);

      if (tokens > this.burstSize) {
        throw new Error(
          `Cannot reserve ${tokens} tokens, burst size is ${this.burstSize}`
        );
      }

      let timeToAct: number;
      let waitTime: number;

      if (availableTokens >= tokens) {
        // Tokens available now
        timeToAct = now;
        waitTime = 0;
        bucket.setTokens(availableTokens - tokens);
      } else {
        // Need to wait for tokens
        const tokensNeeded = tokens - availableTokens;
        waitTime = this.rate.calculateTimeForTokens(tokensNeeded);
        timeToAct = now + waitTime;
        bucket.setTokens(0); // All current tokens consumed
        bucket.setTimer(timeToAct); // Next refill starts after timeToAct
      }

      // Check max wait time
      if (maxTime !== null && waitTime > maxTime) {
        const retryAfter = new Date((now + waitTime) * 1000);
        const rateLimit = new RateLimit(availableTokens, retryAfter, false, this.burstSize);
        throw new MaxWaitDurationExceededException(
          `Cannot reserve ${tokens} tokens within ${maxTime} seconds`,
          rateLimit
        );
      }

      await this.storage.save(bucket);

      const retryAfter = new Date(timeToAct * 1000);
      const rateLimit = new RateLimit(
        Math.max(0, availableTokens - tokens),
        retryAfter,
        true,
        this.burstSize
      );

      return new Reservation(timeToAct * 1000, rateLimit); // Convert to ms
    });
  }

  /**
   * Try to consume tokens immediately.
   */
  async consume(tokens: number = 1): Promise<RateLimit> {
    return this.lock.withLock(this.id, async () => {
      const now = TimeUtil.now();
      const bucket = await this.getOrCreateBucket();

      const availableTokens = bucket.getAvailableTokens(now);

      // Update bucket state
      bucket.setTokens(availableTokens);
      bucket.setTimer(now);

      if (availableTokens >= tokens) {
        // Success
        bucket.setTokens(availableTokens - tokens);
        await this.storage.save(bucket);

        return new RateLimit(
          availableTokens - tokens,
          new Date(now * 1000),
          true,
          this.burstSize
        );
      } else {
        // Rate limit exceeded
        const tokensNeeded = tokens - availableTokens;
        const waitTime = this.rate.calculateTimeForTokens(tokensNeeded);
        const retryAfter = new Date((now + waitTime) * 1000);

        return new RateLimit(availableTokens, retryAfter, false, this.burstSize);
      }
    });
  }

  /**
   * Reset the rate limiter state.
   */
  async reset(): Promise<void> {
    await this.lock.withLock(this.id, async () => {
      await this.storage.delete(this.id);
    });
  }

  /**
   * Get existing bucket or create a new one.
   */
  private async getOrCreateBucket(): Promise<TokenBucket> {
    const state = await this.storage.fetch(this.id);

    if (state instanceof TokenBucket) {
      return state;
    }

    // Create new bucket
    return new TokenBucket(this.id, this.burstSize, this.rate);
  }
}
