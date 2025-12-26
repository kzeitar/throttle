import { TokenBucket } from '../TokenBucket';
import { Rate } from '../Rate';

describe('TokenBucket', () => {
  describe('constructor', () => {
    it('should create a bucket with default values', () => {
      const rate = Rate.perSecond(1);
      const bucket = new TokenBucket('test-bucket', 10, rate);

      expect(bucket.getId()).toBe('test-bucket');
      expect(bucket.getBurstSize()).toBe(10);
      expect(bucket.getRate()).toBe(rate);
    });

    it('should initialize with full tokens by default', () => {
      const rate = Rate.perSecond(1);
      const bucket = new TokenBucket('test', 10, rate);

      const now = Date.now() / 1000;
      expect(bucket.getAvailableTokens(now)).toBe(10);
    });

    it('should accept custom initial tokens', () => {
      const rate = Rate.perSecond(1);
      const bucket = new TokenBucket('test', 10, rate, 5);

      const now = Date.now() / 1000;
      expect(bucket.getAvailableTokens(now)).toBe(5);
    });

    it('should accept custom timer', () => {
      const rate = Rate.perSecond(1);
      const timer = 1000;
      const bucket = new TokenBucket('test', 10, rate, 5, timer);

      expect(bucket.getTimer()).toBe(timer);
    });
  });

  describe('getAvailableTokens', () => {
    it('should return initial tokens when no time has passed', () => {
      const rate = Rate.perSecond(1);
      const now = 1000;
      const bucket = new TokenBucket('test', 10, rate, 5, now);

      expect(bucket.getAvailableTokens(now)).toBe(5);
    });

    it('should add tokens based on elapsed time', () => {
      const rate = Rate.perSecond(1); // 1 token per second
      const now = 1000;
      const bucket = new TokenBucket('test', 10, rate, 5, now);

      // After 3 seconds, should have 5 + 3 = 8 tokens
      expect(bucket.getAvailableTokens(now + 3)).toBe(8);
    });

    it('should cap tokens at burst size', () => {
      const rate = Rate.perSecond(1);
      const now = 1000;
      const bucket = new TokenBucket('test', 10, rate, 5, now);

      // After 100 seconds, should cap at 10 (burst size)
      expect(bucket.getAvailableTokens(now + 100)).toBe(10);
    });

    it('should handle fractional refills correctly', () => {
      const rate = Rate.perSecond(2); // 2 tokens per second
      const now = 1000;
      const bucket = new TokenBucket('test', 10, rate, 0, now);

      // After 2.5 seconds, should have floor(2.5 * 2) = 5 tokens
      expect(bucket.getAvailableTokens(now + 2.5)).toBe(5);
    });

    it('should use current time when not provided', () => {
      const rate = Rate.perSecond(1);
      const bucket = new TokenBucket('test', 10, rate, 10);

      const tokens = bucket.getAvailableTokens();
      expect(tokens).toBeGreaterThanOrEqual(0);
      expect(tokens).toBeLessThanOrEqual(10);
    });
  });

  describe('setTokens and setTimer', () => {
    it('should update tokens', () => {
      const rate = Rate.perSecond(1);
      const bucket = new TokenBucket('test', 10, rate, 5);

      bucket.setTokens(3);
      const now = Date.now() / 1000;
      expect(bucket.getAvailableTokens(now)).toBe(3);
    });

    it('should update timer', () => {
      const rate = Rate.perSecond(1);
      const bucket = new TokenBucket('test', 10, rate, 5, 1000);

      bucket.setTimer(2000);
      expect(bucket.getTimer()).toBe(2000);
    });
  });

  describe('getExpirationTime', () => {
    it('should calculate expiration based on refill time', () => {
      const rate = Rate.perSecond(1); // 1 token per second
      const now = 1000;
      const bucket = new TokenBucket('test', 10, rate, 0, now);

      // With 0 tokens and burst size 10, needs 10 seconds to refill
      // Expiration = ceil(1000 + 10) = 1010
      expect(bucket.getExpirationTime()).toBe(1010);
    });

    it('should handle partial buckets', () => {
      const rate = Rate.perSecond(2); // 2 tokens per second
      const now = 1000;
      const bucket = new TokenBucket('test', 10, rate, 5, now);

      // With 5 tokens, needs 5 more tokens = 2.5 seconds
      // Rate.calculateTimeForTokens(10) = ceil(10 * 1 / 2) = 5
      // Expiration = ceil(1000 + 5) = 1005
      expect(bucket.getExpirationTime()).toBe(1005);
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should serialize to JSON', () => {
      const rate = Rate.perSecond(2);
      const bucket = new TokenBucket('test', 10, rate, 5, 1000);

      const json = bucket.toJSON();
      expect(json).toEqual({
        id: 'test',
        tokens: 5,
        burstSize: 10,
        timer: 1000,
        rate: {
          interval: 1,
          amount: 2,
        },
      });
    });

    it('should deserialize from JSON', () => {
      const json = {
        id: 'test-bucket',
        tokens: 7,
        burstSize: 15,
        timer: 2000,
        rate: {
          interval: 60,
          amount: 10,
        },
      };

      const bucket = TokenBucket.fromJSON(json);

      expect(bucket.getId()).toBe('test-bucket');
      expect(bucket.getBurstSize()).toBe(15);
      expect(bucket.getTimer()).toBe(2000);
      expect(bucket.getRate().getInterval()).toBe(60);
      expect(bucket.getRate().getAmount()).toBe(10);
      expect(bucket.getAvailableTokens(2000)).toBe(7);
    });

    it('should round-trip serialize/deserialize', () => {
      const rate = Rate.perHour(100);
      const bucket = new TokenBucket('round-trip', 50, rate, 25, 5000);

      const json = bucket.toJSON();
      const restored = TokenBucket.fromJSON(json as any);

      expect(restored.getId()).toBe(bucket.getId());
      expect(restored.getBurstSize()).toBe(bucket.getBurstSize());
      expect(restored.getTimer()).toBe(bucket.getTimer());
      expect(restored.getAvailableTokens(5000)).toBe(bucket.getAvailableTokens(5000));
    });
  });

  describe('edge cases', () => {
    it('should handle zero tokens', () => {
      const rate = Rate.perSecond(1);
      const bucket = new TokenBucket('test', 10, rate, 0);

      const now = Date.now() / 1000;
      expect(bucket.getAvailableTokens(now)).toBe(0);
    });

    it('should handle burst size of 1', () => {
      const rate = Rate.perSecond(1);
      const bucket = new TokenBucket('test', 1, rate, 1);

      const now = Date.now() / 1000;
      expect(bucket.getAvailableTokens(now)).toBe(1);
    });

    it('should handle very fast refill rates', () => {
      const rate = Rate.perSecond(1000);
      const now = 1000;
      const bucket = new TokenBucket('test', 100, rate, 0, now);

      // After 0.1 seconds, should have 100 tokens (rate is 1000/s)
      expect(bucket.getAvailableTokens(now + 0.1)).toBe(100);
    });
  });
});
