import { RateLimiterFactory } from '../RateLimiterFactory';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TokenBucketLimiter } from '../policy/TokenBucketLimiter';
import { FixedWindowLimiter } from '../policy/FixedWindowLimiter';
import { SlidingWindowLimiter } from '../policy/SlidingWindowLimiter';
import { NoLimiter } from '../policy/NoLimiter';
import { InvalidIntervalError } from '../errors/InvalidIntervalError';

describe('RateLimiterFactory', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  describe('constructor validation', () => {
    it('should throw error when id is missing', () => {
      const config = {
        policy: 'token_bucket',
        limit: 10,
        rate: { interval: '1 second', amount: 1 },
      } as any;

      expect(() => new RateLimiterFactory(config, storage)).toThrow(
        'Configuration must include an "id" field'
      );
    });

    it('should throw error when policy is missing', () => {
      const config = {
        id: 'test',
        limit: 10,
      } as any;

      expect(() => new RateLimiterFactory(config, storage)).toThrow(
        'Configuration must include a "policy" field'
      );
    });

    it('should throw error for unknown policy', () => {
      const config = {
        id: 'test',
        policy: 'unknown_policy',
        limit: 10,
      } as any;

      expect(() => new RateLimiterFactory(config, storage)).toThrow('Unknown policy');
    });
  });

  describe('token bucket policy', () => {
    it('should create TokenBucketLimiter', () => {
      const config = {
        policy: 'token_bucket' as const,
        id: 'test',
        limit: 10,
        rate: { interval: '1 second', amount: 1 },
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter = factory.create();

      expect(limiter).toBeInstanceOf(TokenBucketLimiter);
    });

    it('should validate required fields', () => {
      const config = {
        policy: 'token_bucket' as const,
        id: 'test',
      } as any;

      expect(() => new RateLimiterFactory(config, storage)).toThrow(
        'Token bucket requires a positive "limit"'
      );
    });

    it('should validate positive limit', () => {
      const config = {
        policy: 'token_bucket' as const,
        id: 'test',
        limit: 0,
        rate: { interval: '1 second', amount: 1 },
      };

      expect(() => new RateLimiterFactory(config, storage)).toThrow(
        'Token bucket requires a positive "limit"'
      );
    });

    it('should validate rate configuration', () => {
      const config = {
        policy: 'token_bucket' as const,
        id: 'test',
        limit: 10,
      } as any;

      expect(() => new RateLimiterFactory(config, storage)).toThrow(
        'Token bucket requires a "rate" object'
      );
    });

    it('should parse interval string correctly', () => {
      const config = {
        policy: 'token_bucket' as const,
        id: 'test',
        limit: 10,
        rate: { interval: '1 minute', amount: 100 },
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter = factory.create();

      expect(limiter).toBeInstanceOf(TokenBucketLimiter);
    });
  });

  describe('fixed window policy', () => {
    it('should create FixedWindowLimiter', () => {
      const config = {
        policy: 'fixed_window' as const,
        id: 'test',
        limit: 10,
        interval: '60 seconds',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter = factory.create();

      expect(limiter).toBeInstanceOf(FixedWindowLimiter);
    });

    it('should validate required fields', () => {
      const config = {
        policy: 'fixed_window' as const,
        id: 'test',
      } as any;

      expect(() => new RateLimiterFactory(config, storage)).toThrow(
        'fixed_window requires a positive "limit"'
      );
    });

    it('should validate interval field', () => {
      const config = {
        policy: 'fixed_window' as const,
        id: 'test',
        limit: 10,
      } as any;

      expect(() => new RateLimiterFactory(config, storage)).toThrow(
        'fixed_window requires an "interval"'
      );
    });

    it('should parse interval string correctly', () => {
      const config = {
        policy: 'fixed_window' as const,
        id: 'test',
        limit: 100,
        interval: '1 hour',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter = factory.create();

      expect(limiter).toBeInstanceOf(FixedWindowLimiter);
    });
  });

  describe('sliding window policy', () => {
    it('should create SlidingWindowLimiter', () => {
      const config = {
        policy: 'sliding_window' as const,
        id: 'test',
        limit: 10,
        interval: '60 seconds',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter = factory.create();

      expect(limiter).toBeInstanceOf(SlidingWindowLimiter);
    });

    it('should validate required fields', () => {
      const config = {
        policy: 'sliding_window' as const,
        id: 'test',
      } as any;

      expect(() => new RateLimiterFactory(config, storage)).toThrow(
        'sliding_window requires a positive "limit"'
      );
    });

    it('should validate interval field', () => {
      const config = {
        policy: 'sliding_window' as const,
        id: 'test',
        limit: 10,
      } as any;

      expect(() => new RateLimiterFactory(config, storage)).toThrow(
        'sliding_window requires an "interval"'
      );
    });

    it('should parse interval string correctly', () => {
      const config = {
        policy: 'sliding_window' as const,
        id: 'test',
        limit: 1000,
        interval: '1 day',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter = factory.create();

      expect(limiter).toBeInstanceOf(SlidingWindowLimiter);
    });
  });

  describe('no limit policy', () => {
    it('should create NoLimiter', () => {
      const config = {
        policy: 'no_limit' as const,
        id: 'test',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter = factory.create();

      expect(limiter).toBeInstanceOf(NoLimiter);
    });

    it('should not require additional fields', () => {
      const config = {
        policy: 'no_limit' as const,
        id: 'test',
      };

      expect(() => new RateLimiterFactory(config, storage)).not.toThrow();
    });
  });

  describe('create with key', () => {
    it('should append key to limiter id', async () => {
      const config = {
        policy: 'fixed_window' as const,
        id: 'api',
        limit: 10,
        interval: '60 seconds',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter1 = factory.create('user1');
      const limiter2 = factory.create('user2');

      // Consume from limiter1 shouldn't affect limiter2
      await limiter1.consume(10);
      const result1 = await limiter1.consume(1);
      const result2 = await limiter2.consume(1);

      expect(result1.isAccepted()).toBe(false);
      expect(result2.isAccepted()).toBe(true);
    });

    it('should use base id when key is null', async () => {
      const config = {
        policy: 'fixed_window' as const,
        id: 'test',
        limit: 10,
        interval: '60 seconds',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter1 = factory.create(null);
      const limiter2 = factory.create();

      // Should share the same state
      await limiter1.consume(5);
      const result = await limiter2.consume(1);

      expect(result.getRemainingTokens()).toBe(4);
    });

    it('should use base id when key is undefined', async () => {
      const config = {
        policy: 'fixed_window' as const,
        id: 'test',
        limit: 10,
        interval: '60 seconds',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter1 = factory.create(undefined);
      const limiter2 = factory.create();

      // Should share the same state
      await limiter1.consume(7);
      const result = await limiter2.consume(1);

      expect(result.getRemainingTokens()).toBe(2);
    });

    it('should handle empty string key', async () => {
      const config = {
        policy: 'fixed_window' as const,
        id: 'test',
        limit: 10,
        interval: '60 seconds',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter = factory.create('');

      const result = await limiter.consume(5);
      expect(result.isAccepted()).toBe(true);
    });
  });

  describe('multiple limiters from same factory', () => {
    it('should create independent limiters with different keys', async () => {
      const config = {
        policy: 'token_bucket' as const,
        id: 'api',
        limit: 5,
        rate: { interval: '1 second', amount: 1 },
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter1 = factory.create('user1');
      const limiter2 = factory.create('user2');
      const limiter3 = factory.create('user3');

      await limiter1.consume(5);
      await limiter2.consume(3);

      const r1 = await limiter1.consume(1);
      const r2 = await limiter2.consume(1);
      const r3 = await limiter3.consume(1);

      expect(r1.isAccepted()).toBe(false);
      expect(r2.isAccepted()).toBe(true);
      expect(r3.isAccepted()).toBe(true);
    });
  });

  describe('complex interval strings', () => {
    it('should handle various interval formats', () => {
      const configs = [
        { interval: '1 second' },
        { interval: '30 seconds' },
        { interval: '1 minute' },
        { interval: '5 minutes' },
        { interval: '1 hour' },
        { interval: '24 hours' },
        { interval: '1 day' },
        { interval: '1 week' },
      ];

      configs.forEach(({ interval }) => {
        const config = {
          policy: 'fixed_window' as const,
          id: 'test',
          limit: 10,
          interval,
        };

        const factory = new RateLimiterFactory(config, storage);
        const limiter = factory.create();

        expect(limiter).toBeInstanceOf(FixedWindowLimiter);
      });
    });
  });

  describe('storage and lock', () => {
    it('should use provided storage', async () => {
      const config = {
        policy: 'fixed_window' as const,
        id: 'test',
        limit: 10,
        interval: '60 seconds',
      };

      const factory = new RateLimiterFactory(config, storage);
      const limiter = factory.create();

      await limiter.consume(5);

      // Verify storage was used
      expect(storage.size()).toBeGreaterThan(0);
    });

    it('should pass lock to limiters', () => {
      const mockLock = {
        acquire: jest.fn(async () => true),
        release: jest.fn(async () => {}),
        withLock: jest.fn(async (id, fn) => fn()),
      };

      const config = {
        policy: 'token_bucket' as const,
        id: 'test',
        limit: 10,
        rate: { interval: '1 second', amount: 1 },
      };

      const factory = new RateLimiterFactory(config, storage, mockLock);
      const limiter = factory.create();

      expect(limiter).toBeInstanceOf(TokenBucketLimiter);
    });
  });
});
