import { Rate } from '../Rate';
import { InvalidIntervalError } from '../../errors/InvalidIntervalError';
import { TimeUtil } from '../../util/TimeUtil';

describe('Rate', () => {
  describe('constructor', () => {
    it('should create a rate with valid parameters', () => {
      const rate = new Rate(60, 10);
      expect(rate.getInterval()).toBe(60);
      expect(rate.getAmount()).toBe(10);
    });

    it('should throw error for interval less than 1', () => {
      expect(() => new Rate(0, 10)).toThrow(InvalidIntervalError);
      expect(() => new Rate(-1, 10)).toThrow(InvalidIntervalError);
      expect(() => new Rate(0.5, 10)).toThrow(InvalidIntervalError);
    });

    it('should throw error for amount less than 1', () => {
      expect(() => new Rate(60, 0)).toThrow(InvalidIntervalError);
      expect(() => new Rate(60, -1)).toThrow(InvalidIntervalError);
      expect(() => new Rate(60, 0.5)).toThrow(InvalidIntervalError);
    });

    it('should accept minimum valid values', () => {
      const rate = new Rate(1, 1);
      expect(rate.getInterval()).toBe(1);
      expect(rate.getAmount()).toBe(1);
    });
  });

  describe('static factory methods', () => {
    it('should create rates with correct intervals and amounts', () => {
      const testCases = [
        { method: () => Rate.perSecond(5), expectedInterval: 1, expectedAmount: 5 },
        { method: () => Rate.perMinute(100), expectedInterval: 60, expectedAmount: 100 },
        { method: () => Rate.perHour(1000), expectedInterval: 3600, expectedAmount: 1000 },
        { method: () => Rate.perDay(10000), expectedInterval: 86400, expectedAmount: 10000 },
        { method: () => Rate.perWeek(50000), expectedInterval: 604800, expectedAmount: 50000 },
        { method: () => Rate.perMonth(100000), expectedInterval: 2592000, expectedAmount: 100000 },
        { method: () => Rate.perYear(1000000), expectedInterval: 31536000, expectedAmount: 1000000 },
      ];

      testCases.forEach(({ method, expectedInterval, expectedAmount }) => {
        const rate = method();
        expect(rate.getInterval()).toBe(expectedInterval);
        expect(rate.getAmount()).toBe(expectedAmount);
      });
    });
  });

  describe('fromString', () => {
    it('should parse valid rate strings', () => {
      const rate1 = Rate.fromString('60 seconds-100');
      expect(rate1.getInterval()).toBe(60);
      expect(rate1.getAmount()).toBe(100);

      const rate2 = Rate.fromString('1 hour-1000');
      expect(rate2.getInterval()).toBe(3600);
      expect(rate2.getAmount()).toBe(1000);
    });

    it('should handle whitespace in rate strings', () => {
      const rate = Rate.fromString('  1 minute  -  50  ');
      expect(rate.getInterval()).toBe(60);
      expect(rate.getAmount()).toBe(50);
    });

    it('should throw error for invalid format', () => {
      expect(() => Rate.fromString('invalid')).toThrow('Invalid rate format');
      expect(() => Rate.fromString('60')).toThrow('Invalid rate format');
      expect(() => Rate.fromString('60-100-200')).toThrow('Invalid rate format');
    });

    it('should throw error for invalid amount', () => {
      expect(() => Rate.fromString('60 seconds-abc')).toThrow('Invalid amount in rate string');
      expect(() => Rate.fromString('60 seconds-')).toThrow('Invalid amount in rate string');
    });

    it('should throw error for invalid duration', () => {
      expect(() => Rate.fromString('invalid duration-100')).toThrow();
    });
  });

  describe('calculateTimeForTokens', () => {
    it('should calculate time for single token', () => {
      const rate = new Rate(60, 10); // 10 tokens per 60 seconds
      const time = rate.calculateTimeForTokens(1);
      expect(time).toBe(6); // 60 / 10 = 6 seconds per token
    });

    it('should calculate time for multiple tokens', () => {
      const rate = new Rate(60, 10); // 10 tokens per 60 seconds
      const time = rate.calculateTimeForTokens(5);
      expect(time).toBe(30); // 5 tokens * 6 seconds = 30 seconds
    });

    it('should round up to nearest second', () => {
      const rate = new Rate(10, 3); // 3 tokens per 10 seconds
      const time = rate.calculateTimeForTokens(1);
      expect(time).toBe(4); // ceil(10 / 3) = 4
    });

    it('should handle exact multiples', () => {
      const rate = new Rate(100, 5); // 5 tokens per 100 seconds
      const time = rate.calculateTimeForTokens(2);
      expect(time).toBe(40); // 2 * 20 = 40
    });
  });

  describe('calculateNextTokenAvailability', () => {
    it('should calculate next token availability from now', () => {
      const rate = Rate.perSecond(2); // 2 tokens per second, so 0.5 seconds per token
      const nextAvailable = rate.calculateNextTokenAvailability();
      const expectedTime = Date.now() + 500; // 0.5 seconds from now

      expect(nextAvailable.getTime()).toBeGreaterThanOrEqual(expectedTime - 10);
      expect(nextAvailable.getTime()).toBeLessThanOrEqual(expectedTime + 10);
    });

    it('should calculate next token availability from specific time', () => {
      const rate = Rate.perSecond(4); // 4 tokens per second, so 0.25 seconds per token
      const now = 1000; // 1000 seconds since epoch
      const nextAvailable = rate.calculateNextTokenAvailability(now);

      expect(nextAvailable.getTime()).toBe(1000250); // (1000 + 0.25) * 1000
    });

    it('should handle slow rates', () => {
      const rate = Rate.perMinute(1); // 1 token per minute
      const now = 1000;
      const nextAvailable = rate.calculateNextTokenAvailability(now);

      expect(nextAvailable.getTime()).toBe(1060000); // (1000 + 60) * 1000
    });
  });

  describe('calculateNewTokensDuringInterval', () => {
    it('should calculate tokens for exact interval', () => {
      const rate = new Rate(60, 10); // 10 tokens per 60 seconds
      const tokens = rate.calculateNewTokensDuringInterval(60);
      expect(tokens).toBe(10);
    });

    it('should calculate tokens for partial interval', () => {
      const rate = new Rate(60, 10); // 10 tokens per 60 seconds
      const tokens = rate.calculateNewTokensDuringInterval(30);
      expect(tokens).toBe(5); // Half the interval = half the tokens
    });

    it('should calculate tokens for multiple intervals', () => {
      const rate = new Rate(60, 10);
      const tokens = rate.calculateNewTokensDuringInterval(180);
      expect(tokens).toBe(30); // 3 intervals * 10 tokens
    });

    it('should floor fractional tokens', () => {
      const rate = new Rate(10, 3); // 3 tokens per 10 seconds
      const tokens = rate.calculateNewTokensDuringInterval(5);
      expect(tokens).toBe(1); // floor(5 * 3 / 10) = floor(1.5) = 1
    });

    it('should return 0 for very short durations', () => {
      const rate = new Rate(60, 10);
      const tokens = rate.calculateNewTokensDuringInterval(1);
      expect(tokens).toBe(0); // floor(1 * 10 / 60) = 0
    });
  });

  describe('getRefillInterval', () => {
    it('should calculate refill interval (time per token)', () => {
      const rate = new Rate(60, 10); // 10 tokens per 60 seconds
      expect(rate.getRefillInterval()).toBe(6); // 60 / 10 = 6 seconds per token
    });

    it('should handle fast rates', () => {
      const rate = Rate.perSecond(100); // 100 tokens per second
      expect(rate.getRefillInterval()).toBe(0.01); // 1 / 100 = 0.01 seconds per token
    });

    it('should handle slow rates', () => {
      const rate = Rate.perHour(1); // 1 token per hour
      expect(rate.getRefillInterval()).toBe(3600); // 3600 / 1 = 3600 seconds per token
    });

    it('should handle 1:1 rate', () => {
      const rate = new Rate(1, 1);
      expect(rate.getRefillInterval()).toBe(1);
    });
  });
});
