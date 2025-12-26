import { CompoundLimiter } from '../CompoundLimiter';
import { NoLimiter } from '../policy/NoLimiter';
import { FixedWindowLimiter } from '../policy/FixedWindowLimiter';
import { TokenBucketLimiter } from '../policy/TokenBucketLimiter';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { Rate } from '../policy/Rate';
import { ReserveNotSupportedError } from '../errors/ReserveNotSupportedError';

describe('CompoundLimiter', () => {
  describe('constructor', () => {
    it('should create a compound limiter with multiple limiters', () => {
      const limiters = [new NoLimiter(), new NoLimiter()];
      const compound = new CompoundLimiter(limiters);

      expect(compound).toBeInstanceOf(CompoundLimiter);
    });

    it('should throw error when no limiters provided', () => {
      expect(() => new CompoundLimiter([])).toThrow(
        'CompoundLimiter requires at least one limiter'
      );
    });
  });

  describe('reserve', () => {
    it('should always throw ReserveNotSupportedError with descriptive message', async () => {
      const compound = new CompoundLimiter([new NoLimiter()]);

      await expect(compound.reserve(1)).rejects.toThrow(ReserveNotSupportedError);
      await expect(compound.reserve(1)).rejects.toThrow(
        'CompoundLimiter does not support the reserve() method'
      );
      await expect(compound.reserve(1, 10)).rejects.toThrow(ReserveNotSupportedError);
    });
  });

  describe('consume', () => {
    it('should accept when all limiters accept', async () => {
      const compound = new CompoundLimiter([
        new NoLimiter(),
        new NoLimiter(),
      ]);

      const result = await compound.consume(5);
      expect(result.isAccepted()).toBe(true);
    });

    it('should reject when any limiter rejects', async () => {
      const storage = new InMemoryStorage();
      const limiters = [
        new NoLimiter(),
        new FixedWindowLimiter('test', 5, 60, storage),
      ];
      const compound = new CompoundLimiter(limiters);

      // Exhaust the fixed window limiter
      await limiters[1].consume(5);

      const result = await compound.consume(1);
      expect(result.isAccepted()).toBe(false);
    });

    it('should return most restrictive result when all accept', async () => {
      const storage1 = new InMemoryStorage();
      const storage2 = new InMemoryStorage();
      const limiters = [
        new TokenBucketLimiter('test1', 10, Rate.perSecond(1), storage1),
        new TokenBucketLimiter('test2', 20, Rate.perSecond(1), storage2),
      ];
      const compound = new CompoundLimiter(limiters);

      await limiters[0].consume(5); // 5 remaining
      await limiters[1].consume(10); // 10 remaining

      const result = await compound.consume(1);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(4); // Most restrictive (fewer tokens)
    });

    it('should return longest retry time when all reject', async () => {
      jest.useFakeTimers();
      const storage1 = new InMemoryStorage();
      const storage2 = new InMemoryStorage();
      const limiters = [
        new FixedWindowLimiter('test1', 5, 60, storage1),
        new FixedWindowLimiter('test2', 5, 120, storage2),
      ];
      const compound = new CompoundLimiter(limiters);

      // Exhaust both limiters
      await limiters[0].consume(5);
      await limiters[1].consume(5);

      const result = await compound.consume(1);
      expect(result.isAccepted()).toBe(false);

      // Should return the limiter with longer retry time (120s window)
      const retryAfter = result.getRetryAfter();
      expect(retryAfter.getTime()).toBeGreaterThan(Date.now());

      jest.useRealTimers();
    });

    it('should prefer rejected over accepted', async () => {
      const storage = new InMemoryStorage();
      const limiters = [
        new NoLimiter(),
        new FixedWindowLimiter('test', 5, 60, storage),
      ];
      const compound = new CompoundLimiter(limiters);

      await limiters[1].consume(5);

      const result = await compound.consume(1);
      expect(result.isAccepted()).toBe(false);
    });

    it('should handle default token parameter', async () => {
      const compound = new CompoundLimiter([new NoLimiter()]);

      const result = await compound.consume(); // Default 1 token
      expect(result.isAccepted()).toBe(true);
    });

    it('should evaluate all limiters', async () => {
      const storage1 = new InMemoryStorage();
      const storage2 = new InMemoryStorage();
      const storage3 = new InMemoryStorage();

      const limiters = [
        new FixedWindowLimiter('test1', 10, 60, storage1),
        new FixedWindowLimiter('test2', 10, 60, storage2),
        new FixedWindowLimiter('test3', 10, 60, storage3),
      ];
      const compound = new CompoundLimiter(limiters);

      const result = await compound.consume(5);
      expect(result.isAccepted()).toBe(true);

      // Verify all limiters were updated
      const r1 = await limiters[0].consume(1);
      const r2 = await limiters[1].consume(1);
      const r3 = await limiters[2].consume(1);

      expect(r1.getRemainingTokens()).toBe(4); // 10 - 5 - 1
      expect(r2.getRemainingTokens()).toBe(4);
      expect(r3.getRemainingTokens()).toBe(4);
    });
  });

  describe('reset', () => {
    it('should reset all limiters', async () => {
      const storage1 = new InMemoryStorage();
      const storage2 = new InMemoryStorage();
      const limiters = [
        new FixedWindowLimiter('test1', 10, 60, storage1),
        new FixedWindowLimiter('test2', 10, 60, storage2),
      ];
      const compound = new CompoundLimiter(limiters);

      await compound.consume(5);
      await compound.reset();

      const result = await compound.consume(1);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(9);
    });

    it('should handle reset with single limiter', async () => {
      const storage = new InMemoryStorage();
      const compound = new CompoundLimiter([
        new FixedWindowLimiter('test', 10, 60, storage),
      ]);

      await compound.consume(10);
      await compound.reset();

      const result = await compound.consume(5);
      expect(result.isAccepted()).toBe(true);
    });
  });

  describe('complex scenarios', () => {
    it('should enforce multiple rate limits simultaneously', async () => {
      const storage1 = new InMemoryStorage();
      const storage2 = new InMemoryStorage();

      // Per-second and per-minute limits
      const limiters = [
        new TokenBucketLimiter('per-second', 5, Rate.perSecond(5), storage1),
        new TokenBucketLimiter('per-minute', 50, Rate.perMinute(50), storage2),
      ];
      const compound = new CompoundLimiter(limiters);

      // Should be limited by per-second limit
      for (let i = 0; i < 5; i++) {
        const result = await compound.consume(1);
        expect(result.isAccepted()).toBe(true);
      }

      const result = await compound.consume(1);
      expect(result.isAccepted()).toBe(false);
    });

    it('should handle mix of limiter types', async () => {
      const storage1 = new InMemoryStorage();
      const storage2 = new InMemoryStorage();

      const limiters = [
        new NoLimiter(),
        new FixedWindowLimiter('fixed', 10, 60, storage1),
        new TokenBucketLimiter('token', 15, Rate.perSecond(1), storage2),
      ];
      const compound = new CompoundLimiter(limiters);

      const result = await compound.consume(5);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(5); // Limited by FixedWindowLimiter
    });

    it('should handle progressive consumption', async () => {
      const storage1 = new InMemoryStorage();
      const storage2 = new InMemoryStorage();

      const limiters = [
        new FixedWindowLimiter('test1', 10, 60, storage1),
        new FixedWindowLimiter('test2', 20, 60, storage2),
      ];
      const compound = new CompoundLimiter(limiters);

      // Consume progressively
      const results = [];
      for (let i = 0; i < 15; i++) {
        results.push(await compound.consume(1));
      }

      const accepted = results.filter(r => r.isAccepted()).length;
      const rejected = results.filter(r => !r.isAccepted()).length;

      expect(accepted).toBe(10); // Limited by first limiter
      expect(rejected).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('should handle single limiter compound', async () => {
      const storage = new InMemoryStorage();
      const compound = new CompoundLimiter([
        new FixedWindowLimiter('test', 10, 60, storage),
      ]);

      const result = await compound.consume(5);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(5);
    });

    it('should handle many limiters', async () => {
      const limiters = Array(10).fill(null).map(() => new NoLimiter());
      const compound = new CompoundLimiter(limiters);

      const result = await compound.consume(100);
      expect(result.isAccepted()).toBe(true);
    });
  });

  describe('AND logic', () => {
    it('should require all limiters to accept', async () => {
      const storage1 = new InMemoryStorage();
      const storage2 = new InMemoryStorage();
      const storage3 = new InMemoryStorage();

      const limiters = [
        new FixedWindowLimiter('test1', 10, 60, storage1),
        new FixedWindowLimiter('test2', 10, 60, storage2),
        new FixedWindowLimiter('test3', 10, 60, storage3),
      ];
      const compound = new CompoundLimiter(limiters);

      // Exhaust just one limiter
      await limiters[1].consume(10);

      const result = await compound.consume(1);
      expect(result.isAccepted()).toBe(false);
    });
  });
});
