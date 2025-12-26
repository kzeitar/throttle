import { FixedWindowLimiter } from '../FixedWindowLimiter';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { MaxWaitDurationExceededError } from '../../errors/MaxWaitDurationExceededError';

describe('FixedWindowLimiter', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  describe('consume', () => {
    it('should accept requests within limit', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      const result = await limiter.consume(5);

      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(5);
      expect(result.getLimit()).toBe(10);
    });

    it('should reject requests when limit exceeded', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);
      const result = await limiter.consume(1);

      expect(result.isAccepted()).toBe(false);
      expect(result.getRemainingTokens()).toBe(0);
    });

    it('should track hits within window', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      const r1 = await limiter.consume(3);
      const r2 = await limiter.consume(2);
      const r3 = await limiter.consume(4);

      expect(r1.getRemainingTokens()).toBe(7);
      expect(r2.getRemainingTokens()).toBe(5);
      expect(r3.getRemainingTokens()).toBe(1);
    });

    it('should reset in new window', async () => {
      jest.useFakeTimers();
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);

      // Move to new window (60+ seconds later)
      jest.advanceTimersByTime(61000);

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(5);

      jest.useRealTimers();
    });

    it('should provide retry time when rate limited', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);
      const result = await limiter.consume(1);

      expect(result.isAccepted()).toBe(false);
      expect(result.getRetryAfter().getTime()).toBeGreaterThan(Date.now());
    });

    it('should align windows to interval boundaries', async () => {
      jest.useFakeTimers();
      const startTime = 1000000;
      jest.setSystemTime(startTime);

      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await limiter.consume(8);
      const r1 = await limiter.consume(1);
      expect(r1.getRemainingTokens()).toBe(1);

      // Move to next window (60+ seconds later)
      jest.setSystemTime(startTime + 61000);
      const r2 = await limiter.consume(5);
      expect(r2.getRemainingTokens()).toBe(5);

      jest.useRealTimers();
    });
  });

  describe('reserve', () => {
    it('should reserve tokens when available', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      const reservation = await limiter.reserve(5);

      expect(reservation.getWaitDuration()).toBe(0);
      expect(reservation.getRateLimit().isAccepted()).toBe(true);
      expect(reservation.getRateLimit().getRemainingTokens()).toBe(5);
    });

    it('should calculate wait time for next window', async () => {
      jest.useFakeTimers();
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);

      const reservation = await limiter.reserve(5);
      expect(reservation.getWaitDuration()).toBeGreaterThan(0);
      expect(reservation.getRateLimit().isAccepted()).toBe(true);

      jest.useRealTimers();
    });

    it('should throw error when exceeding maxTime', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);

      await expect(limiter.reserve(5, 1)).rejects.toThrow(MaxWaitDurationExceededError);
    });

    it('should throw error when requesting more than limit', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await expect(limiter.reserve(15)).rejects.toThrow(
        'Cannot reserve 15 tokens, limit is 10'
      );
    });

    it('should reserve immediately in new window', async () => {
      jest.useFakeTimers();
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);

      jest.advanceTimersByTime(61000);

      const reservation = await limiter.reserve(5);
      expect(reservation.getWaitDuration()).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('reset', () => {
    it('should reset the limiter state', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);
      await limiter.reset();

      const result = await limiter.consume(10);
      expect(result.isAccepted()).toBe(true);
    });

    it('should start fresh after reset', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      await limiter.consume(5);
      await limiter.reset();

      const result = await limiter.consume(1);
      expect(result.getRemainingTokens()).toBe(9);
    });
  });

  describe('multiple limiters', () => {
    it('should maintain separate state for different IDs', async () => {
      const limiter1 = new FixedWindowLimiter('user1', 10, 60, storage);
      const limiter2 = new FixedWindowLimiter('user2', 10, 60, storage);

      await limiter1.consume(8);
      await limiter2.consume(3);

      const r1 = await limiter1.consume(1);
      const r2 = await limiter2.consume(1);

      expect(r1.getRemainingTokens()).toBe(1);
      expect(r2.getRemainingTokens()).toBe(6);
    });
  });

  describe('window boundaries', () => {
    it('should allow bursts at window boundaries', async () => {
      jest.useFakeTimers();
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      // Consume all in current window
      await limiter.consume(10);

      // Still in same window - should be rejected
      const r1 = await limiter.consume(1);
      expect(r1.isAccepted()).toBe(false);

      // Move to next window (60+ seconds)
      jest.advanceTimersByTime(61000);
      const r2 = await limiter.consume(10);
      expect(r2.isAccepted()).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('edge cases', () => {
    it('should handle limit of 1', async () => {
      const limiter = new FixedWindowLimiter('test', 1, 60, storage);

      const r1 = await limiter.consume(1);
      const r2 = await limiter.consume(1);

      expect(r1.isAccepted()).toBe(true);
      expect(r2.isAccepted()).toBe(false);
    });

    it('should handle interval of 1 second', async () => {
      jest.useFakeTimers();
      const limiter = new FixedWindowLimiter('test', 10, 1, storage);

      await limiter.consume(10);
      jest.advanceTimersByTime(1000);

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);

      jest.useRealTimers();
    });

    it('should handle default parameters', async () => {
      const limiter = new FixedWindowLimiter('test', 10, 60, storage);

      const result = await limiter.consume(); // Default 1 token
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(9);
    });

    it('should handle very large intervals', async () => {
      const limiter = new FixedWindowLimiter('test', 1000, 86400, storage); // 1 day

      await limiter.consume(500);

      const result = await limiter.consume(400);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(100);
    });
  });
});
