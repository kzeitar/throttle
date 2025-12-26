# Advanced Usage

Advanced patterns and features for sophisticated rate limiting scenarios.

## Reservation Pattern

The reservation pattern allows you to reserve tokens in advance and wait for them to become available, rather than immediately rejecting requests.

### Basic Reservation

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';
import { MaxWaitDurationExceededError } from '@zeitar/throttle';

const factory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'api',
  limit: 100,
  rate: { interval: '1 minute', amount: 100 }
}, new InMemoryStorage());

const limiter = factory.create('user-123');

// Reserve 10 tokens, wait up to 5 seconds
try {
  const reservation = await limiter.reserve(10, 5);

  // Wait until tokens are available
  await reservation.wait();

  // Tokens are now reserved, proceed with operation
  console.log('Tokens acquired, processing request...');
  await processRequest();

} catch (e) {
  if (e instanceof MaxWaitDurationExceededError) {
    console.log('Would need to wait too long, rejecting request');
  }
}
```

### Canceling Reservations

If you decide not to use reserved tokens, you should cancel the reservation to return tokens to the bucket:

```typescript
const reservation = await limiter.reserve(10, 5);

try {
  // Check if we actually need to proceed
  if (!shouldProceed()) {
    // Cancel reservation to return tokens
    await reservation.cancel();
    return;
  }

  await reservation.wait();
  await processRequest();
} catch (error) {
  // Cancel on error to return tokens
  await reservation.cancel();
  throw error;
}
```

### Reservation with Immediate Check

Check if tokens are immediately available without waiting:

```typescript
const reservation = await limiter.reserve(10, 0);

if (reservation.getDelay() === 0) {
  // Tokens available immediately
  await processRequest();
} else {
  // Would need to wait
  await reservation.cancel();
  throw new Error('Not enough tokens available');
}
```

### Queue Management with Reservations

Use reservations to implement request queuing:

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const factory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'api',
  limit: 10,
  rate: { interval: '1 second', amount: 10 }
}, new InMemoryStorage());

async function queuedRequest(userId: string, task: () => Promise<any>) {
  const limiter = factory.create(userId);

  // Reserve tokens, willing to wait up to 30 seconds
  const reservation = await limiter.reserve(1, 30);

  try {
    const delay = reservation.getDelay();
    if (delay > 0) {
      console.log(`Queued: will execute in ${delay}s`);
    }

    // Wait for tokens
    await reservation.wait();

    // Execute task
    return await task();
  } catch (error) {
    await reservation.cancel();
    throw error;
  }
}

// Usage
await queuedRequest('user-123', async () => {
  return await fetchUserData();
});
```

## Compound Limiters

Combine multiple limiters to enforce multiple constraints simultaneously.

### Basic Compound Limiter

```typescript
import { CompoundRateLimiterFactory, RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const storage = new InMemoryStorage();

// Limit: 10 requests per second
const perSecondFactory = new RateLimiterFactory({
  policy: 'fixed_window',
  id: 'per-second',
  limit: 10,
  interval: '1 second'
}, storage);

// Limit: 100 requests per minute
const perMinuteFactory = new RateLimiterFactory({
  policy: 'fixed_window',
  id: 'per-minute',
  limit: 100,
  interval: '1 minute'
}, storage);

// Compound limiter enforces BOTH limits
const compound = new CompoundRateLimiterFactory([
  perSecondFactory,
  perMinuteFactory
]);

const limiter = compound.create('user-123');

// This request must pass BOTH limiters
const result = await limiter.consume();
if (!result.isAccepted()) {
  console.log(`Rate limited. Retry after: ${result.getRetryAfter()}s`);
}
```

### Multi-Dimensional Rate Limiting

Enforce multiple dimensions of rate limiting:

```typescript
import { CompoundRateLimiterFactory, RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const storage = new InMemoryStorage();

// Short-term burst protection
const burstFactory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'burst',
  limit: 10,
  rate: { interval: '1 second', amount: 10 }
}, storage);

// Medium-term rate limiting
const minuteFactory = new RateLimiterFactory({
  policy: 'sliding_window',
  id: 'minute',
  limit: 100,
  interval: '1 minute'
}, storage);

// Long-term quota
const dailyFactory = new RateLimiterFactory({
  policy: 'fixed_window',
  id: 'daily',
  limit: 10000,
  interval: '1 day'
}, storage);

const compound = new CompoundRateLimiterFactory([
  burstFactory,
  minuteFactory,
  dailyFactory
]);

// All three limits must pass
const limiter = compound.create('user-123');
const result = await limiter.consume();
```

### Compound Limiter Behavior

The compound limiter returns the **most restrictive** result:

```typescript
// Example: Two limiters
// Limiter A: 50 tokens remaining, accepted
// Limiter B: 10 tokens remaining, accepted
// Result: 10 tokens remaining, accepted (most restrictive)

// Example: One limiter rejects
// Limiter A: Accepted
// Limiter B: Rejected, retry after 30s
// Result: Rejected, retry after 30s

// Example: Multiple rejections
// Limiter A: Rejected, retry after 10s
// Limiter B: Rejected, retry after 30s
// Result: Rejected, retry after 30s (longest wait)
```

### Important: Compound Limiters Don't Support Reserve

```typescript
import { CompoundRateLimiterFactory } from '@zeitar/throttle';
import { ReserveNotSupportedError } from '@zeitar/throttle';

const compound = new CompoundRateLimiterFactory([
  perSecondFactory,
  perMinuteFactory
]);

const limiter = compound.create('user-123');

try {
  // ❌ This will throw ReserveNotSupportedError
  await limiter.reserve(10);
} catch (e) {
  if (e instanceof ReserveNotSupportedError) {
    console.log('Compound limiters do not support reserve()');
  }
}

// ✅ Use consume() instead
const result = await limiter.consume(10);
```

**Why?** Coordinating reservations across multiple limiters is complex and could lead to inconsistent state.

## Programmatic Limiter Creation

Create limiters dynamically based on runtime conditions:

```typescript
import { RateLimiterFactory, InMemoryStorage, LimiterConfig } from '@zeitar/throttle';

class DynamicLimiterService {
  private storage = new InMemoryStorage();
  private factories = new Map<string, RateLimiterFactory>();

  getOrCreateFactory(configKey: string, config: LimiterConfig): RateLimiterFactory {
    if (!this.factories.has(configKey)) {
      const factory = new RateLimiterFactory(config, this.storage);
      this.factories.set(configKey, factory);
    }
    return this.factories.get(configKey)!;
  }

  getLimiterForEndpoint(endpoint: string, userId: string) {
    const config = this.getConfigForEndpoint(endpoint);
    const factory = this.getOrCreateFactory(`endpoint:${endpoint}`, config);
    return factory.create(userId);
  }

  private getConfigForEndpoint(endpoint: string): LimiterConfig {
    // Define configs per endpoint
    const configs: Record<string, LimiterConfig> = {
      '/api/search': {
        policy: 'token_bucket',
        id: 'search',
        limit: 20,
        rate: { interval: '1 minute', amount: 20 }
      },
      '/api/upload': {
        policy: 'fixed_window',
        id: 'upload',
        limit: 5,
        interval: '1 hour'
      }
    };

    return configs[endpoint] || {
      policy: 'token_bucket',
      id: 'default',
      limit: 100,
      rate: { interval: '1 minute', amount: 100 }
    };
  }
}

// Usage
const service = new DynamicLimiterService();

app.use(async (req, res, next) => {
  const limiter = service.getLimiterForEndpoint(req.path, req.user.id);
  const result = await limiter.consume();

  if (!result.isAccepted()) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  next();
});
```

## Resetting Limiters

Reset limiter state programmatically:

```typescript
const limiter = factory.create('user-123');

// Reset this specific limiter
await limiter.reset();

// User now has full token bucket again
const result = await limiter.consume(10);
console.log(result.isAccepted()); // true
```

### Bulk Reset

Reset multiple users at once (e.g., when upgrading subscription):

```typescript
async function resetUsersLimiters(userIds: string[], factory: RateLimiterFactory) {
  await Promise.all(
    userIds.map(userId => factory.create(userId).reset())
  );
}

// Reset all premium users at start of billing cycle
await resetUsersLimiters(premiumUserIds, factory);
```

## No Limit Policy

Use the `NoLimiter` for testing or to disable rate limiting:

```typescript
import { NoLimiter } from '@zeitar/throttle';

const limiter = new NoLimiter();

// Always accepts
const result = await limiter.consume(1000000);
console.log(result.isAccepted()); // true
console.log(result.getRemainingTokens()); // Infinity
```

### Conditional Rate Limiting

```typescript
import { NoLimiter, RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

function getLimiterForEnvironment(userId: string) {
  if (process.env.NODE_ENV === 'test') {
    return new NoLimiter();
  }

  const factory = new RateLimiterFactory({
    policy: 'token_bucket',
    id: 'api',
    limit: 100,
    rate: { interval: '1 minute', amount: 100 }
  }, new InMemoryStorage());

  return factory.create(userId);
}
```

## Related Guides

- [Getting Started](./getting-started.md) - Basic usage
- [Common Patterns](./common-patterns.md) - Real-world examples
- [Custom Storage](./custom-storage.md) - Redis integration
- [Troubleshooting](./troubleshooting.md) - Common issues
