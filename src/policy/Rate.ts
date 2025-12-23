import { InvalidIntervalError } from '../errors/InvalidIntervalError';
import { TimeUtil } from '../util/TimeUtil';

/**
 * Configuration object for token bucket refill rates.
 *
 * Defines how many tokens are added per time interval.
 */
export class Rate {
  private readonly intervalInSeconds: number;
  private readonly amount: number;

  constructor(intervalInSeconds: number, amount: number) {
    if (intervalInSeconds < 1) {
      throw new InvalidIntervalError(
        `Interval must be at least 1 second, got ${intervalInSeconds}`
      );
    }

    if (amount < 1) {
      throw new InvalidIntervalError(
        `Amount must be at least 1, got ${amount}`
      );
    }

    this.intervalInSeconds = intervalInSeconds;
    this.amount = amount;
  }

  /**
   * Get the interval in seconds.
   */
  getInterval(): number {
    return this.intervalInSeconds;
  }

  /**
   * Get the amount of tokens per interval.
   */
  getAmount(): number {
    return this.amount;
  }

  /**
   * Create a rate of N tokens per second.
   */
  static perSecond(amount: number): Rate {
    return new Rate(1, amount);
  }

  /**
   * Create a rate of N tokens per minute.
   */
  static perMinute(amount: number): Rate {
    return new Rate(60, amount);
  }

  /**
   * Create a rate of N tokens per hour.
   */
  static perHour(amount: number): Rate {
    return new Rate(3600, amount);
  }

  /**
   * Create a rate of N tokens per day.
   */
  static perDay(amount: number): Rate {
    return new Rate(86400, amount);
  }

  /**
   * Create a rate of N tokens per week.
   */
  static perWeek(amount: number): Rate {
    return new Rate(604800, amount);
  }

  /**
   * Create a rate of N tokens per month (30 days).
   */
  static perMonth(amount: number): Rate {
    return new Rate(2592000, amount);
  }

  /**
   * Create a rate of N tokens per year (365 days).
   */
  static perYear(amount: number): Rate {
    return new Rate(31536000, amount);
  }

  /**
   * Create a rate from a string like "1 hour-100" or "60 seconds-5".
   *
   * Format: "{interval}-{amount}" where interval is a duration string.
   */
  static fromString(rateString: string): Rate {
    const parts = rateString.split('-');
    if (parts.length !== 2) {
      throw new Error(
        `Invalid rate format: ${rateString}. Expected format: "interval-amount"`
      );
    }

    const [intervalStr, amountStr] = parts;
    const interval = TimeUtil.durationToSeconds(intervalStr.trim());
    const amount = parseInt(amountStr.trim(), 10);

    if (isNaN(amount)) {
      throw new Error(`Invalid amount in rate string: ${amountStr}`);
    }

    return new Rate(interval, amount);
  }

  /**
   * Calculate the time (in seconds) needed to accumulate N tokens.
   */
  calculateTimeForTokens(tokens: number): number {
    return Math.ceil((tokens * this.intervalInSeconds) / this.amount);
  }

  /**
   * Calculate when the next token will be available.
   */
  calculateNextTokenAvailability(now: number = TimeUtil.now()): Date {
    const secondsToWait = this.intervalInSeconds / this.amount;
    return new Date((now + secondsToWait) * 1000);
  }

  /**
   * Calculate how many new tokens are added during a given duration.
   */
  calculateNewTokensDuringInterval(durationInSeconds: number): number {
    return Math.floor((durationInSeconds * this.amount) / this.intervalInSeconds);
  }

  /**
   * Calculate the refill interval (time per token in seconds).
   */
  getRefillInterval(): number {
    return this.intervalInSeconds / this.amount;
  }
}
