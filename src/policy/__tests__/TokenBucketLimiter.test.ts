import { TokenBucketLimiter } from '../TokenBucketLimiter';
import { Rate } from '../Rate';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { MaxWaitDurationExceededError } from '../../errors/MaxWaitDurationExceededError';

describe('TokenBucketLimiter', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  describe('consume', () => {
    it('should accept requests when tokens are available', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      const result = await limiter.consume(5);

      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(5);
      expect(result.getLimit()).toBe(10);
    });

    it('should reject requests when tokens are exhausted', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      await limiter.consume(10);
      const result = await limiter.consume(1);

      expect(result.isAccepted()).toBe(false);
      expect(result.getRemainingTokens()).toBe(0);
    });

    it('should decrement tokens on each consumption', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      const r1 = await limiter.consume(3);
      const r2 = await limiter.consume(2);
      const r3 = await limiter.consume(4);

      expect(r1.getRemainingTokens()).toBe(7);
      expect(r2.getRemainingTokens()).toBe(5);
      expect(r3.getRemainingTokens()).toBe(1);
    });

    it('should refill tokens over time', async () => {
      jest.useFakeTimers();
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(2), storage);

      await limiter.consume(10);

      // Wait 3 seconds, should refill 6 tokens
      jest.advanceTimersByTime(3000);

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);

      jest.useRealTimers();
    });

    it('should cap refilled tokens at burst size', async () => {
      jest.useFakeTimers();
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      await limiter.consume(5);

      // Wait 100 seconds, should cap at 10 tokens
      jest.advanceTimersByTime(100000);

      const result = await limiter.consume(10);
      expect(result.isAccepted()).toBe(true);

      jest.useRealTimers();
    });

    it('should provide retry time when rate limited', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      await limiter.consume(10);
      const result = await limiter.consume(5);

      expect(result.isAccepted()).toBe(false);
      expect(result.getRetryAfter().getTime()).toBeGreaterThan(Date.now());
    });

    it('should handle fractional tokens consumption', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(2), storage);

      const r1 = await limiter.consume(1);
      const r2 = await limiter.consume(1);

      expect(r1.isAccepted()).toBe(true);
      expect(r2.isAccepted()).toBe(true);
    });
  });

  describe('reserve', () => {
    it('should reserve tokens when available', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      const reservation = await limiter.reserve(5);

      expect(reservation.getWaitDuration()).toBe(0);
      expect(reservation.getRateLimit().isAccepted()).toBe(true);
      expect(reservation.getRateLimit().getRemainingTokens()).toBe(5);
    });

    it('should calculate wait time when tokens not available', async () => {
      jest.useFakeTimers();
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      await limiter.consume(10);
      const reservation = await limiter.reserve(5);

      expect(reservation.getWaitDuration()).toBeGreaterThan(0);
      expect(reservation.getRateLimit().isAccepted()).toBe(true);

      jest.useRealTimers();
    });

    it('should throw error when exceeding maxTime', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      await limiter.consume(10);

      await expect(limiter.reserve(5, 1)).rejects.toThrow(MaxWaitDurationExceededError);
    });

    it('should throw error when requesting more than burst size', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      await expect(limiter.reserve(15)).rejects.toThrow(
        'Cannot reserve 15 tokens, burst size is 10'
      );
    });

    it('should wait for correct duration based on rate', async () => {
      jest.useFakeTimers();
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(2), storage);

      await limiter.consume(10);
      const reservation = await limiter.reserve(4);

      // Need 4 tokens at 2 per second = 2 seconds
      const waitDuration = reservation.getWaitDuration();
      expect(waitDuration).toBeGreaterThanOrEqual(1900);
      expect(waitDuration).toBeLessThanOrEqual(2100);

      jest.useRealTimers();
    });
  });

  describe('reset', () => {
    it('should reset the limiter state', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      await limiter.consume(10);
      await limiter.reset();

      const result = await limiter.consume(10);
      expect(result.isAccepted()).toBe(true);
    });

    it('should start fresh after reset', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      await limiter.consume(5);
      await limiter.reset();

      const result = await limiter.consume(1);
      expect(result.getRemainingTokens()).toBe(9);
    });
  });

  describe('multiple limiters', () => {
    it('should maintain separate state for different IDs', async () => {
      const limiter1 = new TokenBucketLimiter('user1', 10, Rate.perSecond(1), storage);
      const limiter2 = new TokenBucketLimiter('user2', 10, Rate.perSecond(1), storage);

      await limiter1.consume(8);
      await limiter2.consume(3);

      const r1 = await limiter1.consume(1);
      const r2 = await limiter2.consume(1);

      expect(r1.getRemainingTokens()).toBe(1);
      expect(r2.getRemainingTokens()).toBe(6);
    });
  });

  describe('concurrent requests', () => {
    it('should handle sequential requests correctly', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      const results = [];
      for (let i = 0; i < 15; i++) {
        results.push(await limiter.consume(1));
      }

      const accepted = results.filter(r => r.isAccepted());
      const rejected = results.filter(r => !r.isAccepted());

      expect(accepted.length).toBe(10);
      expect(rejected.length).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('should handle burst size of 1', async () => {
      const limiter = new TokenBucketLimiter('test', 1, Rate.perSecond(1), storage);

      const r1 = await limiter.consume(1);
      const r2 = await limiter.consume(1);

      expect(r1.isAccepted()).toBe(true);
      expect(r2.isAccepted()).toBe(false);
    });

    it('should handle very fast refill rates', async () => {
      jest.useFakeTimers();
      const limiter = new TokenBucketLimiter('test', 100, Rate.perSecond(1000), storage);

      await limiter.consume(100);

      jest.advanceTimersByTime(100); // 0.1 seconds

      const result = await limiter.consume(50);
      expect(result.isAccepted()).toBe(true);

      jest.useRealTimers();
    });

    it('should handle default parameters', async () => {
      const limiter = new TokenBucketLimiter('test', 10, Rate.perSecond(1), storage);

      const result = await limiter.consume(); // Default 1 token
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(9);
    });
  });
});
