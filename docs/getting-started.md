# Getting Started

This guide will help you get up and running with @zeitar/throttle in minutes.

## Installation

```bash
npm install @zeitar/throttle
```

## Basic Usage

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

## Duration Formats

All interval strings support:
- `"1 second"`, `"2 seconds"`, `"1s"`
- `"1 minute"`, `"2 minutes"`, `"1m"`
- `"1 hour"`, `"2 hours"`, `"1h"`
- `"1 day"`, `"2 days"`, `"1d"`
- `"1 week"`, `"2 weeks"`, `"1w"`
- `"1 month"`, `"2 months"` (30 days)
- `"1 year"`, `"2 years"` (365 days)

## Rate Helper Methods

```typescript
import { Rate } from '@zeitar/throttle';

Rate.perSecond(10);        // 10 tokens/second
Rate.perMinute(100);       // 100 tokens/minute
Rate.perHour(1000);        // 1000 tokens/hour
Rate.perDay(10000);        // 10000 tokens/day
Rate.fromString('1 hour-100'); // 100 tokens per hour
```

## Exception Handling

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

## Testing

```typescript
import { NoLimiter, InMemoryStorage } from '@zeitar/throttle';

// Use NoLimiter for tests that shouldn't be rate limited
const limiter = new NoLimiter();

// Or use InMemoryStorage which can be cleared between tests
const storage = new InMemoryStorage();
storage.clear();
```

## Next Steps

- **Framework Integration**: Learn how to integrate with [Express and Fastify](./framework-integration.md)
- **Algorithm Selection**: Understand [which algorithm to choose](./algorithms.md)
- **Common Patterns**: See [real-world examples](./common-patterns.md)
- **Advanced Usage**: Explore [reservation pattern and compound limiters](./advanced-usage.md)
