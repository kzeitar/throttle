import type { LimiterInterface } from '../LimiterInterface';
import type { StorageInterface } from '../storage/StorageInterface';
import type { LockInterface } from '../storage/LockInterface';
import { RateLimit } from '../RateLimit';
import { Reservation } from '../Reservation';
import { MaxWaitDurationExceededException } from '../exceptions/MaxWaitDurationExceededException';
import { SlidingWindow } from './SlidingWindow';
import { TimeUtil } from '../util/TimeUtil';
import { NoLock } from '../storage/LockInterface';

/**
 * Sliding window rate limiter implementation.
 *
 * Uses a weighted combination of the previous and current windows to smooth
 * out burst behavior at window boundaries. More sophisticated than fixed window
 * but slightly more expensive computationally.
 */
export class SlidingWindowLimiter implements LimiterInterface {
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

      // Transition to new window if needed
      const updatedWindow = this.maybeTransitionWindow(window, now);

      const currentHitCount = updatedWindow.getHitCount(now);
      const availableTokens = Math.max(0, this.limit - currentHitCount);

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
        updatedWindow.add(tokens);
      } else {
        // Need to wait for window to slide
        waitTime = updatedWindow.calculateTimeForTokens(this.limit, tokens, now);
        timeToAct = now + waitTime;
      }

      // Check max wait time
      if (maxTime !== null && waitTime > maxTime) {
        const retryAfter = new Date((now + waitTime) * 1000);
        const rateLimit = new RateLimit(availableTokens, retryAfter, false, this.limit);
        throw new MaxWaitDurationExceededException(
          `Cannot reserve ${tokens} tokens within ${maxTime} seconds`,
          rateLimit
        );
      }

      await this.storage.save(updatedWindow);

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

      // Transition to new window if needed
      const updatedWindow = this.maybeTransitionWindow(window, now);

      const currentHitCount = updatedWindow.getHitCount(now);
      const availableTokens = Math.max(0, this.limit - currentHitCount);

      if (availableTokens >= tokens) {
        // Success
        updatedWindow.add(tokens);
        await this.storage.save(updatedWindow);

        return new RateLimit(
          availableTokens - tokens,
          new Date(now * 1000),
          true,
          this.limit
        );
      } else {
        // Rate limit exceeded
        const waitTime = updatedWindow.calculateTimeForTokens(this.limit, tokens, now);
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
  private async getOrCreateWindow(now: number): Promise<SlidingWindow> {
    const state = await this.storage.fetch(this.id);

    if (state instanceof SlidingWindow) {
      return state;
    }

    // Create new window
    return new SlidingWindow(this.id, this.intervalInSeconds);
  }

  /**
   * Transition to a new window if the current one has ended.
   */
  private maybeTransitionWindow(window: SlidingWindow, now: number): SlidingWindow {
    const windowEndAt = window.getWindowEndAt();

    if (now < windowEndAt) {
      // Still in current window
      return window;
    }

    // Check if we're completely past the window (expired)
    if (window.isExpired(now)) {
      // Create fresh window
      return new SlidingWindow(this.id, this.intervalInSeconds);
    }

    // Transition to new window, carrying over current hits as "last window"
    return SlidingWindow.createFromPreviousWindow(
      this.id,
      this.intervalInSeconds,
      window,
      now
    );
  }
}
