import { RateLimit } from '../RateLimit';
import { RateLimitExceededError } from '../errors/RateLimitExceededError';

describe('RateLimit', () => {
  describe('constructor', () => {
    it('should create a RateLimit instance with correct values', () => {
      const retryAfter = new Date(Date.now() + 5000);
      const rateLimit = new RateLimit(5, retryAfter, true, 10);

      expect(rateLimit.getRemainingTokens()).toBe(5);
      expect(rateLimit.getRetryAfter()).toBe(retryAfter);
      expect(rateLimit.isAccepted()).toBe(true);
      expect(rateLimit.getLimit()).toBe(10);
    });

    it('should handle zero remaining tokens', () => {
      const retryAfter = new Date();
      const rateLimit = new RateLimit(0, retryAfter, false, 10);

      expect(rateLimit.getRemainingTokens()).toBe(0);
      expect(rateLimit.isAccepted()).toBe(false);
    });
  });


  describe('ensureAccepted', () => {
    it('should return this when accepted', () => {
      const rateLimit = new RateLimit(5, new Date(), true, 10);

      expect(rateLimit.ensureAccepted()).toBe(rateLimit);
    });

    it('should throw RateLimitExceededError when rejected', () => {
      const retryAfter = new Date();
      const rateLimit = new RateLimit(0, retryAfter, false, 10);

      expect(() => rateLimit.ensureAccepted()).toThrow(RateLimitExceededError);
    });

    it('should throw error with correct RateLimit object', () => {
      const retryAfter = new Date();
      const rateLimit = new RateLimit(0, retryAfter, false, 10);

      try {
        rateLimit.ensureAccepted();
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimitExceededError);
        expect((e as RateLimitExceededError).getRateLimit()).toBe(rateLimit);
      }
    });

    it('should allow chaining on success', () => {
      const rateLimit = new RateLimit(5, new Date(), true, 10);

      expect(() => {
        rateLimit.ensureAccepted().ensureAccepted();
      }).not.toThrow();
    });
  });

  describe('getRetryAfter', () => {
    it('should return the retry date', () => {
      const retryAfter = new Date(Date.now() + 10000);
      const rateLimit = new RateLimit(0, retryAfter, false, 10);

      expect(rateLimit.getRetryAfter()).toBe(retryAfter);
    });
  });

  describe('getRemainingTokens', () => {
    it('should return correct remaining tokens including zero', () => {
      const rl1 = new RateLimit(7, new Date(), true, 10);
      const rl2 = new RateLimit(0, new Date(), false, 10);

      expect(rl1.getRemainingTokens()).toBe(7);
      expect(rl2.getRemainingTokens()).toBe(0);
    });
  });

  describe('getLimit', () => {
    it('should return the rate limit maximum', () => {
      const rateLimit = new RateLimit(5, new Date(), true, 10);
      expect(rateLimit.getLimit()).toBe(10);
    });
  });

  describe('wait', () => {
    it('should resolve immediately when retry time is in the past', async () => {
      const retryAfter = new Date(Date.now() - 1000);
      const rateLimit = new RateLimit(5, retryAfter, true, 10);

      const start = Date.now();
      await rateLimit.wait();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Should be nearly instant
    });

    it('should wait until retry time', async () => {
      const retryAfter = new Date(Date.now() + 100);
      const rateLimit = new RateLimit(0, retryAfter, false, 10);

      const start = Date.now();
      await rateLimit.wait();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });

    it('should work when retry time is now', async () => {
      const retryAfter = new Date();
      const rateLimit = new RateLimit(5, retryAfter, true, 10);

      const start = Date.now();
      await rateLimit.wait();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('usage patterns', () => {
    it('should support throw-on-reject pattern', () => {
      const accepted = new RateLimit(5, new Date(), true, 10);
      const rejected = new RateLimit(0, new Date(Date.now() + 1000), false, 10);

      expect(() => accepted.ensureAccepted()).not.toThrow();
      expect(() => rejected.ensureAccepted()).toThrow();
    });
  });
});
