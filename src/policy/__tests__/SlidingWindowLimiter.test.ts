import { SlidingWindowLimiter } from '../SlidingWindowLimiter';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { MaxWaitDurationExceededError } from '../../errors/MaxWaitDurationExceededError';

describe('SlidingWindowLimiter', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  describe('consume', () => {
    it('should accept requests within limit', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      const result = await limiter.consume(5);

      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(5);
      expect(result.getLimit()).toBe(10);
    });

    it('should reject requests when limit exceeded', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);
      const result = await limiter.consume(1);

      expect(result.isAccepted()).toBe(false);
      expect(result.getRemainingTokens()).toBe(0);
    });

    it('should track hits within window', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      const r1 = await limiter.consume(3);
      const r2 = await limiter.consume(2);
      const r3 = await limiter.consume(4);

      expect(r1.getRemainingTokens()).toBe(7);
      expect(r2.getRemainingTokens()).toBe(5);
      expect(r3.getRemainingTokens()).toBe(1);
    });

    it('should smooth requests across window boundaries', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      // Use up the limit
      await limiter.consume(10);

      // Should be rate limited now
      const result = await limiter.consume(1);
      expect(result.isAccepted()).toBe(false);
    });

    it('should provide retry time when rate limited', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);
      const result = await limiter.consume(1);

      expect(result.isAccepted()).toBe(false);
      expect(result.getRetryAfter().getTime()).toBeGreaterThan(Date.now());
    });

    it('should transition to new window correctly', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      // Use some tokens
      await limiter.consume(8);

      // Should still have tokens available
      const result = await limiter.consume(1);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(1);
    });

    it('should create fresh window when expired', async () => {
      jest.useFakeTimers();
      const now = 1000;
      jest.setSystemTime(now * 1000);

      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);

      // Move past expiration (window end + interval)
      jest.setSystemTime((now + 130) * 1000);

      const result = await limiter.consume(10);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('reserve', () => {
    it('should reserve tokens when available', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      const reservation = await limiter.reserve(5);

      expect(reservation.getWaitDuration()).toBe(0);
      expect(reservation.getRateLimit().isAccepted()).toBe(true);
      expect(reservation.getRateLimit().getRemainingTokens()).toBe(5);
    });

    it('should calculate wait time when tokens not available', async () => {
      jest.useFakeTimers();
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);

      const reservation = await limiter.reserve(5);
      expect(reservation.getWaitDuration()).toBeGreaterThan(0);
      expect(reservation.getRateLimit().isAccepted()).toBe(true);

      jest.useRealTimers();
    });

    it('should throw error when exceeding maxTime', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);

      await expect(limiter.reserve(5, 1)).rejects.toThrow(MaxWaitDurationExceededError);
    });

    it('should throw error when requesting more than limit', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      await expect(limiter.reserve(15)).rejects.toThrow(
        'Cannot reserve 15 tokens, limit is 10'
      );
    });
  });

  describe('reset', () => {
    it('should reset the limiter state', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      await limiter.consume(10);
      await limiter.reset();

      const result = await limiter.consume(10);
      expect(result.isAccepted()).toBe(true);
    });

    it('should start fresh after reset', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      await limiter.consume(5);
      await limiter.reset();

      const result = await limiter.consume(1);
      expect(result.getRemainingTokens()).toBe(9);
    });
  });

  describe('multiple limiters', () => {
    it('should maintain separate state for different IDs', async () => {
      const limiter1 = new SlidingWindowLimiter('user1', 10, 60, storage);
      const limiter2 = new SlidingWindowLimiter('user2', 10, 60, storage);

      await limiter1.consume(8);
      await limiter2.consume(3);

      const r1 = await limiter1.consume(1);
      const r2 = await limiter2.consume(1);

      expect(r1.getRemainingTokens()).toBe(1);
      expect(r2.getRemainingTokens()).toBe(6);
    });
  });

  describe('sliding window behavior', () => {
    it('should smoothly distribute capacity across windows', async () => {
      const limiter = new SlidingWindowLimiter('test', 100, 60, storage);

      // Fill partial window
      await limiter.consume(50);

      // Should still have capacity
      const result = await limiter.consume(20);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(30);
    });

    it('should prevent bursts at window boundaries', async () => {
      jest.useFakeTimers();
      const now = 1000;
      jest.setSystemTime(now * 1000);

      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      // Use 10 tokens
      await limiter.consume(10);

      // Just after window end (1 second into new window)
      jest.setSystemTime((now + 61) * 1000);

      // Previous: 10 * (1 - 1/60) ≈ 9.83, Current: 0
      // Available: ~0
      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('edge cases', () => {
    it('should handle limit of 1', async () => {
      const limiter = new SlidingWindowLimiter('test', 1, 60, storage);

      const r1 = await limiter.consume(1);
      const r2 = await limiter.consume(1);

      expect(r1.isAccepted()).toBe(true);
      expect(r2.isAccepted()).toBe(false);
    });

    it('should handle small intervals', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 1, storage);

      await limiter.consume(5);

      const result = await limiter.consume(3);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(2);
    });

    it('should handle default parameters', async () => {
      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      const result = await limiter.consume(); // Default 1 token
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(9);
    });

    it('should handle very large intervals', async () => {
      const limiter = new SlidingWindowLimiter('test', 1000, 86400, storage); // 1 day

      await limiter.consume(500);

      const result = await limiter.consume(400);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(100);
    });
  });

  describe('window state transitions', () => {
    it('should handle multiple window transitions', async () => {
      jest.useFakeTimers();
      const now = 1000;
      jest.setSystemTime(now * 1000);

      const limiter = new SlidingWindowLimiter('test', 10, 60, storage);

      await limiter.consume(5);

      // First transition
      jest.setSystemTime((now + 70) * 1000);
      await limiter.consume(3);

      // Second transition
      jest.setSystemTime((now + 140) * 1000);
      const result = await limiter.consume(2);

      expect(result.isAccepted()).toBe(true);

      jest.useRealTimers();
    });
  });
});
