import type { LimiterStateInterface } from '../LimiterStateInterface';
import { TimeUtil } from '../util/TimeUtil';

/**
 * Serializable state for FixedWindowLimiter.
 *
 * Tracks hit count within a fixed time window.
 */
export class Window implements LimiterStateInterface {
  private readonly id: string;
  private hitCount: number;
  private readonly intervalInSeconds: number;
  private readonly maxSize: number;
  private timer: number;

  constructor(
    id: string,
    intervalInSeconds: number,
    maxSize: number,
    hitCount?: number,
    timer?: number
  ) {
    this.id = id;
    this.intervalInSeconds = intervalInSeconds;
    this.maxSize = maxSize;
    this.hitCount = hitCount ?? 0;
    this.timer = timer ?? TimeUtil.now();
  }

  getId(): string {
    return this.id;
  }

  /**
   * Get the expiration time in seconds since epoch.
   */
  getExpirationTime(): number {
    return Math.ceil(this.timer + this.intervalInSeconds);
  }

  /**
   * Add hits to the window.
   */
  add(hits: number, now?: number): void {
    if (now === undefined) {
      now = TimeUtil.now();
    }

    // Check if we've moved to a new window
    if (now >= this.timer + this.intervalInSeconds) {
      // New window - reset
      this.hitCount = hits;
      this.timer = Math.floor(now / this.intervalInSeconds) * this.intervalInSeconds;
    } else {
      // Same window - increment
      this.hitCount += hits;
    }
  }

  /**
   * Get the current hit count.
   */
  getHitCount(): number {
    return this.hitCount;
  }

  /**
   * Get the window timer (start of current window).
   */
  getTimer(): number {
    return this.timer;
  }

  /**
   * Get the interval in seconds.
   */
  getInterval(): number {
    return this.intervalInSeconds;
  }

  /**
   * Get available tokens at a given time.
   */
  getAvailableTokens(now: number = TimeUtil.now()): number {
    // Check if we're in a new window
    if (now >= this.timer + this.intervalInSeconds) {
      return this.maxSize; // New window, all tokens available
    }

    return Math.max(0, this.maxSize - this.hitCount);
  }

  /**
   * Calculate time needed for N tokens to become available.
   */
  calculateTimeForTokens(tokens: number, now: number = TimeUtil.now()): number {
    const available = this.getAvailableTokens(now);

    if (available >= tokens) {
      return 0; // Already available
    }

    // Need to wait for next window
    const windowEnd = this.timer + this.intervalInSeconds;
    return windowEnd - now;
  }

  /**
   * Convert to JSON for serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      hitCount: this.hitCount,
      intervalInSeconds: this.intervalInSeconds,
      maxSize: this.maxSize,
      timer: this.timer,
    };
  }

  /**
   * Create from JSON.
   */
  static fromJSON(data: {
    id: string;
    hitCount: number;
    intervalInSeconds: number;
    maxSize: number;
    timer: number;
  }): Window {
    return new Window(
      data.id,
      data.intervalInSeconds,
      data.maxSize,
      data.hitCount,
      data.timer
    );
  }
}
