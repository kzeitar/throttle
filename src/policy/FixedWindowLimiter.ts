import type { LimiterInterface } from '../LimiterInterface';
import type { StorageInterface } from '../storage/StorageInterface';
import type { LockInterface } from '../storage/LockInterface';
import { RateLimit } from '../RateLimit';
import { Reservation } from '../Reservation';
import { MaxWaitDurationExceededError } from '../errors/MaxWaitDurationExceededError';
import { Window } from './Window';
import { TimeUtil } from '../util/TimeUtil';
import { NoLock } from '../storage/LockInterface';

/**
 * Fixed window rate limiter implementation.
 *
 * Divides time into fixed windows and counts hits within each window.
 * Simple and efficient, but can allow bursts at window boundaries.
 */
export class FixedWindowLimiter implements LimiterInterface {
  private readonly id: string;
  private readonly limit: number;
  private readonly intervalInSeconds: number;
  private readonly storage: StorageInterface;
  private readonly lock: LockInterface;

  constructor(
    id: string,
    limit: number,
    intervalInSeconds: number,
    storage: StorageInterface,
    lock?: LockInterface
  ) {
    this.id = id;
    this.limit = limit;
    this.intervalInSeconds = intervalInSeconds;
    this.storage = storage;
    this.lock = lock ?? new NoLock();
  }

  /**
   * Reserve tokens with optional maximum wait time.
   */
  async reserve(tokens: number = 1, maxTime: number | null = null): Promise<Reservation> {
    return this.lock.withLock(this.id, async () => {
      const now = TimeUtil.now();
      const window = await this.getOrCreateWindow(now);

      const availableTokens = window.getAvailableTokens(now);

      if (tokens > this.limit) {
        throw new Error(
          `Cannot reserve ${tokens} tokens, limit is ${this.limit}`
        );
      }

      let timeToAct: number;
      let waitTime: number;

      if (availableTokens >= tokens) {
        // Tokens available now
        timeToAct = now;
        waitTime = 0;
        window.add(tokens, now);
      } else {
        // Need to wait for next window
        const windowEnd = window.getTimer() + this.intervalInSeconds;
        waitTime = windowEnd - now;
        timeToAct = windowEnd;
      }

      // Check max wait time
      if (maxTime !== null && waitTime > maxTime) {
        const retryAfter = new Date((now + waitTime) * 1000);
        const rateLimit = new RateLimit(availableTokens, retryAfter, false, this.limit);
        throw new MaxWaitDurationExceededError(
          `Cannot reserve ${tokens} tokens within ${maxTime} seconds`,
          rateLimit
        );
      }

      await this.storage.save(window);

      const retryAfter = new Date(timeToAct * 1000);
      const rateLimit = new RateLimit(
        Math.max(0, availableTokens - tokens),
        retryAfter,
        true,
        this.limit
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
      const window = await this.getOrCreateWindow(now);

      const availableTokens = window.getAvailableTokens(now);

      if (availableTokens >= tokens) {
        // Success
        window.add(tokens, now);
        await this.storage.save(window);

        return new RateLimit(
          availableTokens - tokens,
          new Date(now * 1000),
          true,
          this.limit
        );
      } else {
        // Rate limit exceeded - need to wait for next window
        const waitTime = window.calculateTimeForTokens(tokens, now);
        const retryAfter = new Date((now + waitTime) * 1000);

        return new RateLimit(availableTokens, retryAfter, false, this.limit);
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
   * Get existing window or create a new one.
   */
  private async getOrCreateWindow(now: number): Promise<Window> {
    const state = await this.storage.fetch(this.id);

    if (state instanceof Window) {
      return state;
    }

    // Create new window aligned to interval boundary
    const windowStart = Math.floor(now / this.intervalInSeconds) * this.intervalInSeconds;
    return new Window(this.id, this.intervalInSeconds, this.limit, 0, windowStart);
  }
}
