import type { LimiterStateInterface } from '../LimiterStateInterface';
import { Rate } from './Rate';
import { TimeUtil } from '../util/TimeUtil';

/**
 * Serializable state for TokenBucketLimiter.
 *
 * Tracks the number of available tokens and when they were last updated.
 */
export class TokenBucket implements LimiterStateInterface {
  private id: string;
  private tokens: number;
  private readonly burstSize: number;
  private timer: number;
  private readonly rate: Rate;

  constructor(
    id: string,
    burstSize: number,
    rate: Rate,
    tokens?: number,
    timer?: number
  ) {
    this.id = id;
    this.burstSize = burstSize;
    this.rate = rate;
    this.tokens = tokens ?? burstSize;
    this.timer = timer ?? TimeUtil.now();
  }

  getId(): string {
    return this.id;
  }

  /**
   * Get the expiration time in seconds since epoch.
   * Token bucket expires after enough time has passed to refill completely.
   */
  getExpirationTime(): number {
    const refillTime = this.rate.calculateTimeForTokens(this.burstSize);
    return Math.ceil(this.timer + refillTime);
  }

  /**
   * Get the available tokens at a given time, accounting for refills.
   */
  getAvailableTokens(now: number = TimeUtil.now()): number {
    const elapsed = now - this.timer;
    const newTokens = this.rate.calculateNewTokensDuringInterval(elapsed);
    return Math.min(this.burstSize, this.tokens + newTokens);
  }

  /**
   * Set the number of tokens.
   */
  setTokens(tokens: number): void {
    this.tokens = tokens;
  }

  /**
   * Get the timer (last update time).
   */
  getTimer(): number {
    return this.timer;
  }

  /**
   * Set the timer (last update time).
   */
  setTimer(timer: number): void {
    this.timer = timer;
  }

  /**
   * Get the burst size (maximum tokens).
   */
  getBurstSize(): number {
    return this.burstSize;
  }

  /**
   * Get the refill rate.
   */
  getRate(): Rate {
    return this.rate;
  }

  /**
   * Convert to JSON for serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      tokens: this.tokens,
      burstSize: this.burstSize,
      timer: this.timer,
      rate: {
        interval: this.rate.getInterval(),
        amount: this.rate.getAmount(),
      },
    };
  }

  /**
   * Create from JSON.
   */
  static fromJSON(data: {
    id: string;
    tokens: number;
    burstSize: number;
    timer: number;
    rate: { interval: number; amount: number };
  }): TokenBucket {
    const rate = new Rate(data.rate.interval, data.rate.amount);
    return new TokenBucket(
      data.id,
      data.burstSize,
      rate,
      data.tokens,
      data.timer
    );
  }
}
