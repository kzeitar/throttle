import { CompoundRateLimiterFactory } from '../CompoundRateLimiterFactory';
import { RateLimiterFactory } from '../RateLimiterFactory';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { CompoundLimiter } from '../CompoundLimiter';

describe('CompoundRateLimiterFactory', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  describe('constructor', () => {
    it('should create factory with multiple factories', () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'test1', limit: 10, interval: '60 seconds' },
          storage
        ),
        new RateLimiterFactory(
          { policy: 'token_bucket', id: 'test2', limit: 5, rate: { interval: '1 second', amount: 1 } },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      expect(compound).toBeInstanceOf(CompoundRateLimiterFactory);
    });

    it('should throw error when no factories provided', () => {
      expect(() => new CompoundRateLimiterFactory([])).toThrow(
        'CompoundRateLimiterFactory requires at least one factory'
      );
    });

    it('should accept single factory', () => {
      const factory = new RateLimiterFactory(
        { policy: 'fixed_window', id: 'test', limit: 10, interval: '60 seconds' },
        storage
      );

      const compound = new CompoundRateLimiterFactory([factory]);
      expect(compound).toBeInstanceOf(CompoundRateLimiterFactory);
    });
  });

  describe('create', () => {
    it('should create CompoundLimiter', () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'test1', limit: 10, interval: '60 seconds' },
          storage
        ),
        new RateLimiterFactory(
          { policy: 'token_bucket', id: 'test2', limit: 5, rate: { interval: '1 second', amount: 1 } },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter = compound.create();

      expect(limiter).toBeInstanceOf(CompoundLimiter);
    });

    it('should pass key to all underlying factories', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'limit1', limit: 10, interval: '60 seconds' },
          storage
        ),
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'limit2', limit: 20, interval: '60 seconds' },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter1 = compound.create('user1');
      const limiter2 = compound.create('user2');

      // Consume from limiter1
      await limiter1.consume(5);

      // limiter2 should have full capacity
      const result = await limiter2.consume(1);
      expect(result.getRemainingTokens()).toBe(9);
    });

    it('should create independent limiters for different keys', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'token_bucket', id: 'api', limit: 5, rate: { interval: '1 second', amount: 1 } },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter1 = compound.create('user1');
      const limiter2 = compound.create('user2');

      await limiter1.consume(5);

      const r1 = await limiter1.consume(1);
      const r2 = await limiter2.consume(1);

      expect(r1.isAccepted()).toBe(false);
      expect(r2.isAccepted()).toBe(true);
    });

    it('should handle null key', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'test', limit: 10, interval: '60 seconds' },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter = compound.create(null);

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);
    });

    it('should handle undefined key', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'test', limit: 10, interval: '60 seconds' },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter = compound.create();

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);
    });
  });

  describe('compound behavior', () => {
    it('should enforce all rate limits', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'per-minute', limit: 100, interval: '60 seconds' },
          storage
        ),
        new RateLimiterFactory(
          { policy: 'token_bucket', id: 'per-second', limit: 5, rate: { interval: '1 second', amount: 5 } },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter = compound.create();

      // Should be limited by per-second limit
      for (let i = 0; i < 5; i++) {
        const result = await limiter.consume(1);
        expect(result.isAccepted()).toBe(true);
      }

      const result = await limiter.consume(1);
      expect(result.isAccepted()).toBe(false);
    });

    it('should return most restrictive result', async () => {
      const storage1 = new InMemoryStorage();
      const storage2 = new InMemoryStorage();

      const factories = [
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'limit1', limit: 10, interval: '60 seconds' },
          storage1
        ),
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'limit2', limit: 20, interval: '60 seconds' },
          storage2
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter = compound.create();

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(5); // Limited by first limiter (10 - 5 = 5)
    });

    it('should combine different policy types', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'token_bucket', id: 'burst', limit: 10, rate: { interval: '1 second', amount: 1 } },
          storage
        ),
        new RateLimiterFactory(
          { policy: 'sliding_window', id: 'smooth', limit: 50, interval: '60 seconds' },
          storage
        ),
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'window', limit: 100, interval: '3600 seconds' },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter = compound.create();

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);
    });
  });

  describe('multiple compound limiters', () => {
    it('should maintain separate state per key', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'limit1', limit: 10, interval: '60 seconds' },
          storage
        ),
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'limit2', limit: 5, interval: '60 seconds' },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter1 = compound.create('user1');
      const limiter2 = compound.create('user2');
      const limiter3 = compound.create('user3');

      // Exhaust user1's limits
      await limiter1.consume(5);

      // user2 and user3 should have full capacity
      const r2 = await limiter2.consume(1);
      const r3 = await limiter3.consume(1);

      expect(r2.isAccepted()).toBe(true);
      expect(r3.isAccepted()).toBe(true);
    });
  });

  describe('no limit policy in compound', () => {
    it('should work with no_limit policy', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'no_limit', id: 'unlimited' },
          storage
        ),
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'limited', limit: 10, interval: '60 seconds' },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter = compound.create();

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);
      expect(result.getRemainingTokens()).toBe(5); // Limited by fixed_window
    });
  });

  describe('factory reuse', () => {
    it('should allow creating multiple compound limiters from same factory instance', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'api', limit: 10, interval: '60 seconds' },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);

      const limiter1 = compound.create('user1');
      const limiter2 = compound.create('user2');
      const limiter3 = compound.create('user3');

      await limiter1.consume(10);
      await limiter2.consume(5);

      const r1 = await limiter1.consume(1);
      const r2 = await limiter2.consume(1);
      const r3 = await limiter3.consume(1);

      expect(r1.isAccepted()).toBe(false);
      expect(r2.isAccepted()).toBe(true);
      expect(r3.isAccepted()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle single factory', async () => {
      const factory = new RateLimiterFactory(
        { policy: 'fixed_window', id: 'test', limit: 10, interval: '60 seconds' },
        storage
      );

      const compound = new CompoundRateLimiterFactory([factory]);
      const limiter = compound.create();

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);
    });

    it('should handle many factories', async () => {
      const factories = Array(5).fill(null).map((_, i) =>
        new RateLimiterFactory(
          { policy: 'fixed_window', id: `limit${i}`, limit: 100, interval: '60 seconds' },
          storage
        )
      );

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter = compound.create();

      const result = await limiter.consume(10);
      expect(result.isAccepted()).toBe(true);
    });
  });

  describe('real-world scenarios', () => {
    it('should implement per-second and per-minute limits', async () => {
      const factories = [
        new RateLimiterFactory(
          { policy: 'token_bucket', id: 'per-second', limit: 10, rate: { interval: '1 second', amount: 10 } },
          storage
        ),
        new RateLimiterFactory(
          { policy: 'fixed_window', id: 'per-minute', limit: 100, interval: '60 seconds' },
          storage
        ),
      ];

      const compound = new CompoundRateLimiterFactory(factories);
      const limiter = compound.create('api-key-123');

      // Burst up to per-second limit
      for (let i = 0; i < 10; i++) {
        const result = await limiter.consume(1);
        expect(result.isAccepted()).toBe(true);
      }

      // Should be rate limited
      const result = await limiter.consume(1);
      expect(result.isAccepted()).toBe(false);
    });
  });
});
