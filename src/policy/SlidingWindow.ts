import type { LimiterStateInterface } from '../LimiterStateInterface';
import { TimeUtil } from '../util/TimeUtil';

/**
 * Serializable state for SlidingWindowLimiter.
 *
 * Tracks hit counts across current and previous windows to implement
 * a sliding window algorithm.
 */
export class SlidingWindow implements LimiterStateInterface {
  private readonly id: string;
  private hitCount: number;
  private hitCountForLastWindow: number;
  private windowEndAt: number;
  private readonly intervalInSeconds: number;

  constructor(
    id: string,
    intervalInSeconds: number,
    hitCount?: number,
    hitCountForLastWindow?: number,
    windowEndAt?: number
  ) {
    this.id = id;
    this.intervalInSeconds = intervalInSeconds;
    this.hitCount = hitCount ?? 0;
    this.hitCountForLastWindow = hitCountForLastWindow ?? 0;
    this.windowEndAt = windowEndAt ?? TimeUtil.now() + intervalInSeconds;
  }

  getId(): string {
    return this.id;
  }

  /**
   * Get the expiration time in seconds since epoch.
   */
  getExpirationTime(): number {
    // Expires after current window ends plus one more interval
    return Math.ceil(this.windowEndAt + this.intervalInSeconds);
  }

  /**
   * Create a new window from a previous window (window transition).
   */
  static createFromPreviousWindow(
    id: string,
    intervalInSeconds: number,
    previousWindow: SlidingWindow,
    now: number
  ): SlidingWindow {
    // The previous window's current hits become the "last window" hits
    const newWindowEndAt = now + intervalInSeconds;
    return new SlidingWindow(
      id,
      intervalInSeconds,
      0, // New window starts with 0 hits
      previousWindow.hitCount, // Previous current becomes last
      newWindowEndAt
    );
  }

  /**
   * Check if the window has expired.
   */
  isExpired(now: number = TimeUtil.now()): boolean {
    return now >= this.windowEndAt + this.intervalInSeconds;
  }

  /**
   * Add hits to the current window.
   */
  add(hits: number): void {
    this.hitCount += hits;
  }

  /**
   * Get the sliding window hit count at a given time.
   *
   * Uses the formula:
   * (previousWindowHits * (1 - percentIntoCurrentWindow)) + currentWindowHits
   */
  getHitCount(now: number = TimeUtil.now()): number {
    // If we're past the current window end, we need a transition
    if (now >= this.windowEndAt) {
      return this.hitCount;
    }

    // Calculate how far we are into the current window
    const windowStartAt = this.windowEndAt - this.intervalInSeconds;
    const timeIntoWindow = now - windowStartAt;
    const percentIntoWindow = timeIntoWindow / this.intervalInSeconds;

    // Sliding window formula
    const previousContribution =
      this.hitCountForLastWindow * (1 - percentIntoWindow);
    const currentContribution = this.hitCount;

    return Math.floor(previousContribution + currentContribution);
  }

  /**
   * Get the current window's hit count (not sliding).
   */
  getCurrentWindowHitCount(): number {
    return this.hitCount;
  }

  /**
   * Get the previous window's hit count.
   */
  getPreviousWindowHitCount(): number {
    return this.hitCountForLastWindow;
  }

  /**
   * Get when the current window ends.
   */
  getWindowEndAt(): number {
    return this.windowEndAt;
  }

  /**
   * Get the interval in seconds.
   */
  getInterval(): number {
    return this.intervalInSeconds;
  }

  /**
   * Calculate time needed for N tokens to become available.
   */
  calculateTimeForTokens(maxSize: number, tokens: number, now: number = TimeUtil.now()): number {
    const currentCount = this.getHitCount(now);
    const available = Math.max(0, maxSize - currentCount);

    if (available >= tokens) {
      return 0; // Already available
    }

    // Need to wait - in sliding window, we need to wait until the window slides
    // enough that we have space
    const windowStartAt = this.windowEndAt - this.intervalInSeconds;

    // Simplified: wait for next window
    return this.windowEndAt - now;
  }

  /**
   * Convert to JSON for serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      hitCount: this.hitCount,
      hitCountForLastWindow: this.hitCountForLastWindow,
      windowEndAt: this.windowEndAt,
      intervalInSeconds: this.intervalInSeconds,
    };
  }

  /**
   * Create from JSON.
   */
  static fromJSON(data: {
    id: string;
    hitCount: number;
    hitCountForLastWindow: number;
    windowEndAt: number;
    intervalInSeconds: number;
  }): SlidingWindow {
    return new SlidingWindow(
      data.id,
      data.intervalInSeconds,
      data.hitCount,
      data.hitCountForLastWindow,
      data.windowEndAt
    );
  }
}
