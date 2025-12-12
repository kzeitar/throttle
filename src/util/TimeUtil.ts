/**
 * Utility functions for time calculations.
 */
export class TimeUtil {
  /**
   * Convert a duration string to seconds.
   *
   * Supports formats like:
   * - "1 second", "2 seconds", "1s"
   * - "1 minute", "2 minutes", "1m"
   * - "1 hour", "2 hours", "1h"
   * - "1 day", "2 days", "1d"
   * - "1 week", "2 weeks", "1w"
   * - "1 month", "2 months" (assumes 30 days)
   * - "1 year", "2 years" (assumes 365 days)
   *
   * @param duration - Duration string to parse
   * @returns Duration in seconds
   * @throws {Error} If the duration format is invalid
   */
  static durationToSeconds(duration: string): number {
    const trimmed = duration.trim().toLowerCase();
    const match = trimmed.match(/^(\d+)\s*(.+)$/);

    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const [, amountStr, unit] = match;
    const amount = parseInt(amountStr, 10);

    if (isNaN(amount) || amount < 0) {
      throw new Error(`Invalid amount in duration: ${duration}`);
    }

    // Map unit to seconds
    const unitMap: Record<string, number> = {
      s: 1,
      sec: 1,
      second: 1,
      seconds: 1,
      m: 60,
      min: 60,
      minute: 60,
      minutes: 60,
      h: 3600,
      hr: 3600,
      hour: 3600,
      hours: 3600,
      d: 86400,
      day: 86400,
      days: 86400,
      w: 604800,
      week: 604800,
      weeks: 604800,
      month: 2592000, // 30 days
      months: 2592000,
      y: 31536000, // 365 days
      year: 31536000,
      years: 31536000,
    };

    const multiplier = unitMap[unit];
    if (multiplier === undefined) {
      throw new Error(`Unknown time unit: ${unit}`);
    }

    return amount * multiplier;
  }

  /**
   * Get the current time in seconds (with millisecond precision).
   */
  static now(): number {
    return Date.now() / 1000;
  }

  /**
   * Convert milliseconds to seconds.
   */
  static msToSeconds(ms: number): number {
    return ms / 1000;
  }

  /**
   * Convert seconds to milliseconds.
   */
  static secondsToMs(seconds: number): number {
    return seconds * 1000;
  }
}
