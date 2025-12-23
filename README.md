# @zeitar/throttle

A production-ready TypeScript rate limiting library with support for multiple algorithms.

## Features

- 🚀 **Multiple Algorithms**: Token Bucket, Fixed Window, Sliding Window, and No-Limit policies
- 📦 **TypeScript Native**: Full type safety with strict typing
- 🔒 **Production Ready**: Thread-safe with optional distributed locking support
- 🧩 **Composable**: Combine multiple limiters with CompoundLimiter
- 💾 **Pluggable Storage**: In-memory storage included, easily extend for Redis, etc.
- ⚡ **High Performance**: Efficient algorithms with minimal overhead
- 🎯 **Zero Dependencies**: Core library has no external dependencies

## Installation

```bash
npm install @zeitar/throttle
```

## Quick Start

### Token Bucket (Recommended)

Best for most use cases - allows bursts while maintaining steady throughput:

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const factory = new RateLimiterFactory(
  {
    policy: 'token_bucket',
    id: 'api',
    limit: 100,              // Burst size
    rate: {
      interval: '1 hour',    // Refill interval
      amount: 100            // Tokens per interval
    }
  },
  new InMemoryStorage()
);

const limiter = factory.create('user-123');

// Try to consume tokens
const result = await limiter.consume(5);
if (result.isAccepted()) {
  console.log(`Accepted! ${result.getRemainingTokens()} tokens remaining`);
} else {
  console.log(`Rate limited. Retry after: ${result.getRetryAfter()}`);
}
```

### Fixed Window

Simple and efficient, good for strict quotas:

```typescript
const factory = new RateLimiterFactory(
  {
    policy: 'fixed_window',
    id: 'api',
    limit: 1000,
    interval: '1 hour'
  },
  new InMemoryStorage()
);
```

### Sliding Window

Smooths out bursts at window boundaries:

```typescript
const factory = new RateLimiterFactory(
  {
    policy: 'sliding_window',
    id: 'api',
    limit: 1000,
    interval: '1 hour'
  },
  new InMemoryStorage()
);
```

## Advanced Usage

### Reservation Pattern

Reserve tokens in advance and wait for availability:

```typescript
// Reserve 10 tokens, wait up to 5 seconds
try {
  const reservation = await limiter.reserve(10, 5);

  // Wait until tokens are available
  await reservation.wait();

  // Proceed with operation
  console.log('Tokens acquired!');
} catch (e) {
  if (e instanceof MaxWaitDurationExceededError) {
    console.log('Would need to wait too long');
  }
}
```

### Compound Limiters

Enforce multiple rate limits simultaneously:

```typescript
import { CompoundRateLimiterFactory } from '@zeitar/throttle';

const perSecondFactory = new RateLimiterFactory({
  policy: 'fixed_window',
  id: 'per-second',
  limit: 10,
  interval: '1 second'
}, storage);

const perMinuteFactory = new RateLimiterFactory({
  policy: 'fixed_window',
  id: 'per-minute',
  limit: 100,
  interval: '1 minute'
}, storage);

const compound = new CompoundRateLimiterFactory([
  perSecondFactory,
  perMinuteFactory
]);

const limiter = compound.create('user-123');
// This limiter enforces BOTH 10/second AND 100/minute
```

### Custom Storage

Implement the `StorageInterface` for Redis, database, etc.:

```typescript
import { StorageInterface, LimiterStateInterface } from '@zeitar/throttle';

class RedisStorage implements StorageInterface {
  async save(state: LimiterStateInterface): Promise<void> {
    const ttl = state.getExpirationTime();
    const data = JSON.stringify(state.toJSON());
    await redis.setex(state.getId(), ttl, data);
  }

  async fetch(id: string): Promise<LimiterStateInterface | null> {
    const data = await redis.get(id);
    if (!data) return null;

    // Deserialize based on your state type
    return YourStateClass.fromJSON(JSON.parse(data));
  }

  async delete(id: string): Promise<void> {
    await redis.del(id);
  }
}
```

### Distributed Locking

For distributed systems, implement `LockInterface`:

```typescript
import { LockInterface } from '@zeitar/throttle';

class RedisLock implements LockInterface {
  async acquire(key: string, ttl = 10): Promise<boolean> {
    return await redis.set(key, '1', 'EX', ttl, 'NX');
  }

  async release(key: string): Promise<void> {
    await redis.del(key);
  }

  async withLock<T>(
    key: string,
    callback: () => Promise<T>,
    ttl = 10
  ): Promise<T> {
    const acquired = await this.acquire(key, ttl);
    if (!acquired) {
      throw new Error('Could not acquire lock');
    }

    try {
      return await callback();
    } finally {
      await this.release(key);
    }
  }
}

const factory = new RateLimiterFactory(config, storage, new RedisLock());
```

## API Reference

### Configuration Types

#### TokenBucketConfig
```typescript
{
  policy: 'token_bucket',
  id: string,              // Identifier prefix
  limit: number,           // Burst size (max tokens)
  rate: {
    interval: string,      // e.g., '1 hour', '60 seconds'
    amount: number         // Tokens added per interval
  }
}
```

#### FixedWindowConfig
```typescript
{
  policy: 'fixed_window',
  id: string,
  limit: number,           // Max requests per window
  interval: string         // Window size
}
```

#### SlidingWindowConfig
```typescript
{
  policy: 'sliding_window',
  id: string,
  limit: number,
  interval: string
}
```

### Duration Formats

All interval strings support:
- `"1 second"`, `"2 seconds"`, `"1s"`
- `"1 minute"`, `"2 minutes"`, `"1m"`
- `"1 hour"`, `"2 hours"`, `"1h"`
- `"1 day"`, `"2 days"`, `"1d"`
- `"1 week"`, `"2 weeks"`, `"1w"`
- `"1 month"`, `"2 months"` (30 days)
- `"1 year"`, `"2 years"` (365 days)

### Rate Helper Methods

```typescript
import { Rate } from '@zeitar/throttle';

Rate.perSecond(10);        // 10 tokens/second
Rate.perMinute(100);       // 100 tokens/minute
Rate.perHour(1000);        // 1000 tokens/hour
Rate.perDay(10000);        // 10000 tokens/day
Rate.fromString('1 hour-100'); // 100 tokens per hour
```

### Exception Handling

```typescript
import {
  RateLimitExceededError,
  MaxWaitDurationExceededError
} from '@zeitar/throttle';

try {
  const result = await limiter.consume(10);
  result.ensureAccepted(); // Throws if rate limited
} catch (e) {
  if (e instanceof RateLimitExceededError) {
    console.log(`Rate limited until ${e.getRetryAfter()}`);
    console.log(`Remaining: ${e.getRemainingTokens()}`);
  }
}
```

## Architecture

### Design Patterns

- **Strategy Pattern**: Different algorithms implement `LimiterInterface`
- **Factory Pattern**: `RateLimiterFactory` creates configured limiters
- **Composite Pattern**: `CompoundLimiter` combines multiple limiters
- **Dependency Injection**: Storage and locking are pluggable

### Thread Safety

All limiters use locking (via `LockInterface`) to ensure thread-safe operations. The default `NoLock` is suitable for single-instance apps. For distributed systems, implement a distributed lock (e.g., Redis).

## Algorithm Comparison

| Algorithm | Pros | Cons | Use Case |
|-----------|------|------|----------|
| **Token Bucket** | • Allows bursts<br>• Smooth refills<br>• Most flexible | • Slightly more complex | Most API rate limiting |
| **Fixed Window** | • Simple<br>• Efficient<br>• Predictable | • Burst at boundaries | Strict quotas |
| **Sliding Window** | • Smooth boundaries<br>• No burst issues | • More computation | High-precision limiting |
| **No Limit** | • Pass-through | • No limiting | Testing/feature flags |

## Performance

- **Token Bucket**: O(1) time, O(1) space per limiter
- **Fixed Window**: O(1) time, O(1) space per limiter
- **Sliding Window**: O(1) time, O(1) space per limiter
- All algorithms use minimal memory (~100 bytes per active limiter)

## Testing

```typescript
import { NoLimiter, InMemoryStorage } from '@zeitar/throttle';

// Use NoLimiter for tests that shouldn't be rate limited
const limiter = new NoLimiter();

// Or use InMemoryStorage which can be cleared between tests
const storage = new InMemoryStorage();
storage.clear();
```

## Migration from PHP

This library is a faithful TypeScript port of the PHP rate-limiter. Key differences:

- **Async/Await**: All methods return Promises (PHP version was synchronous)
- **Milliseconds**: JavaScript uses ms timestamps (PHP uses seconds with microseconds)
- **No OptionsResolver**: Uses TypeScript types for validation
- **JSON Serialization**: Uses JSON instead of PHP's serialize()

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Credits

Ported from the Symfony Rate Limiter component architecture.
