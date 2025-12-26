# Troubleshooting

Common issues and solutions when using @zeitar/throttle.

## Rate Limiting Not Working in Distributed Systems

### Problem

Rate limits are not enforced correctly across multiple servers. Each server seems to have its own independent limits.

### Cause

Using `InMemoryStorage` in a distributed environment means each server maintains its own state, leading to ineffective rate limiting.

### Solution

Use distributed storage (Redis) and implement distributed locking:

```typescript
import { RateLimiterFactory } from '@zeitar/throttle';
import { RedisStorage } from './your-redis-storage';
import { RedisLock } from './your-redis-lock';
import Redis from 'ioredis';

const redis = new Redis({
  host: 'your-redis-host',
  port: 6379
});

const factory = new RateLimiterFactory(
  config,
  new RedisStorage(redis),
  new RedisLock(redis)  // ← Add distributed locking
);
```

See [Custom Storage](./custom-storage.md) for implementation details.

## CompoundLimiter Throws "Reserve Not Supported"

### Problem

Calling `reserve()` on a CompoundLimiter throws `ReserveNotSupportedError`.

```typescript
const compound = new CompoundRateLimiterFactory([
  perSecondFactory,
  perMinuteFactory
]);

const limiter = compound.create('user-123');
await limiter.reserve(10); // ❌ Throws error
```

### Cause

CompoundLimiter doesn't support `reserve()` due to the complexity of coordinating reservations across multiple limiters.

### Solution

Use `consume()` instead:

```typescript
// ❌ Don't do this
const reservation = await compoundLimiter.reserve(10);

// ✅ Do this instead
const result = await compoundLimiter.consume(10);
if (!result.isAccepted()) {
  // Handle rate limit
  return res.status(429).json({
    error: 'Rate limit exceeded',
    retryAfter: result.getRetryAfter()
  });
}
```

## Memory Usage Grows Over Time

### Problem

InMemoryStorage memory usage grows indefinitely as new limiters are created for different user IDs.

### Cause

1. States are not automatically cleaned up when they expire
2. Too many unique limiter keys being created

### Solution 1: Automatic Expiration

States automatically expire based on their TTL. For InMemoryStorage, expired states are cleaned up on next access.

### Solution 2: Periodic Cleanup

Implement manual cleanup for InMemoryStorage:

```typescript
const storage = new InMemoryStorage();

// Clear all states periodically (development only)
setInterval(() => {
  storage.clear();
}, 3600000); // Every hour
```

### Solution 3: Use Persistent Storage with TTL

Use Redis or database storage that handles TTL automatically:

```typescript
// Redis automatically removes expired keys
const storage = new RedisStorage(redisClient);
```

### Solution 4: Limit Unique Keys

Avoid creating unlimited unique keys:

```typescript
// ❌ Bad: Unlimited unique keys
const limiter = factory.create(`${userId}:${timestamp}:${randomId}`);

// ✅ Good: Limited unique keys
const limiter = factory.create(userId);
```

## Rate Limits Reset Unexpectedly

### Problem

Limiter state is lost when the application restarts.

### Cause

Using `InMemoryStorage` which is volatile - all state is lost on restart.

### Solution

Use persistent storage for production:

```typescript
// Development: In-memory (lost on restart)
const devStorage = new InMemoryStorage();

// Production: Persistent storage
const prodStorage = new RedisStorage(redisClient);

const storage = process.env.NODE_ENV === 'production'
  ? prodStorage
  : devStorage;
```

## Rate Limiting Too Strict or Too Lenient

### Problem

The rate limiter is either rejecting too many requests or allowing too many.

### Diagnosis

1. Check which algorithm you're using
2. Verify your configuration matches your expectations
3. Test with known request patterns

### Solution 1: Wrong Algorithm

```typescript
// Fixed Window can allow 2× limit at boundaries
// Use Sliding Window or Token Bucket instead
{
  policy: 'sliding_window',  // ← More precise
  id: 'api',
  limit: 100,
  interval: '1 minute'
}
```

### Solution 2: Wrong Configuration

```typescript
// ❌ This allows 100 bursts, but only refills 10/minute
{
  policy: 'token_bucket',
  id: 'api',
  limit: 100,
  rate: { interval: '1 minute', amount: 10 }
}

// ✅ This allows 100 bursts, refills 100/minute
{
  policy: 'token_bucket',
  id: 'api',
  limit: 100,
  rate: { interval: '1 minute', amount: 100 }
}
```

### Solution 3: Token Bucket Burst Behavior

Token Bucket allows bursts. If you don't want bursts, use Fixed Window:

```typescript
// Allows bursts
{ policy: 'token_bucket', limit: 100, rate: { interval: '1 minute', amount: 100 } }

// No bursts
{ policy: 'fixed_window', limit: 100, interval: '1 minute' }
```

## High Latency When Using Rate Limiter

### Problem

Adding rate limiting introduces noticeable latency to requests.

### Cause

1. Slow storage operations (network latency to Redis/database)
2. Lock contention in distributed systems
3. Inefficient lock implementation

### Solution 1: Optimize Storage

Use connection pooling and enable pipelining:

```typescript
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  lazyConnect: false
});
```

### Solution 2: Reduce Lock TTL

For high-throughput scenarios, reduce lock TTL:

```typescript
class FastRedisLock implements LockInterface {
  async acquire(key: string, ttl = 1): Promise<boolean> {  // ← Reduced from 10s
    const lockKey = `lock:${key}`;
    const result = await this.redis.set(lockKey, '1', 'EX', ttl, 'NX');
    return result === 'OK';
  }
}
```

### Solution 3: Cache Limiter Instances

```typescript
class LimiterCache {
  private cache = new Map<string, LimiterInterface>();

  get(userId: string, factory: RateLimiterFactory): LimiterInterface {
    if (!this.cache.has(userId)) {
      this.cache.set(userId, factory.create(userId));
    }
    return this.cache.get(userId)!;
  }
}

const cache = new LimiterCache();
const limiter = cache.get(req.user.id, factory);
```

## TypeScript Type Errors

### Problem

TypeScript complains about discriminated union types:

```typescript
const config = {
  policy: 'token_bucket',
  // ... rest of config
};
// Error: Type 'string' is not assignable to type '"token_bucket"'
```

### Solution

Use `as const` or explicit typing:

```typescript
// Option 1: as const
const config = {
  policy: 'token_bucket' as const,
  id: 'api',
  limit: 100,
  rate: { interval: '1 minute', amount: 100 }
};

// Option 2: Explicit type
import type { TokenBucketConfig } from '@zeitar/throttle';

const config: TokenBucketConfig = {
  policy: 'token_bucket',
  id: 'api',
  limit: 100,
  rate: { interval: '1 minute', amount: 100 }
};
```

## Redis Connection Errors

### Problem

Redis connection errors like `ECONNREFUSED` or `Connection timeout`.

### Solution 1: Check Redis Availability

```bash
# Test Redis connection
redis-cli ping
# Should return: PONG
```

### Solution 2: Configure Error Handling

```typescript
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});
```

### Solution 3: Fallback Storage

```typescript
class ResilientStorage implements StorageInterface {
  constructor(
    private primary: RedisStorage,
    private fallback: InMemoryStorage
  ) {}

  async save(state: LimiterStateInterface): Promise<void> {
    try {
      await this.primary.save(state);
    } catch (error) {
      console.error('Primary storage failed, using fallback');
      await this.fallback.save(state);
    }
  }

  // Similar for fetch() and delete()
}
```

## Rate Limiter Not Resetting as Expected

### Problem

After calling `reset()`, the limiter still rejects requests.

### Possible Causes

1. Multiple limiter instances for the same key
2. Storage not persisting the reset
3. Using the wrong limiter instance

### Solution 1: Use Same Factory

```typescript
// ❌ Creating multiple factories
const factory1 = new RateLimiterFactory(config, storage);
const factory2 = new RateLimiterFactory(config, storage);

const limiter1 = factory1.create('user-123');
await limiter1.reset();

const limiter2 = factory2.create('user-123');
await limiter2.consume(); // Still rate limited!

// ✅ Use same factory instance
const factory = new RateLimiterFactory(config, storage);
const limiter = factory.create('user-123');
await limiter.reset();
await limiter.consume(); // Works as expected
```

### Solution 2: Verify Storage

```typescript
// After reset, verify state was saved
await limiter.reset();

const state = await storage.fetch('some-id');
console.log(state); // Should show reset state
```

## Different Results in Tests vs Production

### Problem

Rate limiting works differently in tests compared to production.

### Cause

Using different storage backends or configurations.

### Solution

Use environment-specific configuration:

```typescript
function createStorage() {
  if (process.env.NODE_ENV === 'test') {
    return new InMemoryStorage();
  }

  if (process.env.NODE_ENV === 'production') {
    return new RedisStorage(createRedisClient());
  }

  return new InMemoryStorage();
}

// Clear storage between tests
let storage: InMemoryStorage;

beforeEach(() => {
  storage = new InMemoryStorage();
});

afterEach(() => {
  storage.clear();
});
```

## Need More Help?

If you're experiencing issues not covered here:

1. Check the [GitHub Issues](https://github.com/zeitar/throttle/issues)
2. Review the [API Reference](./api-reference.md)
3. See [Common Patterns](./common-patterns.md) for examples
4. Open a new issue with a minimal reproduction

## Related Guides

- [Getting Started](./getting-started.md) - Basic usage
- [Custom Storage](./custom-storage.md) - Storage implementation
- [API Reference](./api-reference.md) - Complete API docs
