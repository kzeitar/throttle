# API Reference

Complete API documentation for @zeitar/throttle.

## Configuration Types

### TokenBucketConfig

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

**Example:**
```typescript
{
  policy: 'token_bucket',
  id: 'api',
  limit: 100,
  rate: {
    interval: '1 minute',
    amount: 50
  }
}
```
This allows bursts of 100 requests, then refills at 50 tokens/minute.

### FixedWindowConfig

```typescript
{
  policy: 'fixed_window',
  id: string,              // Identifier prefix
  limit: number,           // Max requests per window
  interval: string         // Window size
}
```

**Example:**
```typescript
{
  policy: 'fixed_window',
  id: 'api',
  limit: 1000,
  interval: '1 hour'
}
```

### SlidingWindowConfig

```typescript
{
  policy: 'sliding_window',
  id: string,              // Identifier prefix
  limit: number,           // Max requests per window
  interval: string         // Window size
}
```

**Example:**
```typescript
{
  policy: 'sliding_window',
  id: 'api',
  limit: 1000,
  interval: '1 hour'
}
```

### NoLimitConfig

```typescript
{
  policy: 'no_limit',
  id: string               // Identifier prefix
}
```

## Duration Formats

All interval strings support the following formats:

| Format | Examples | Seconds |
|--------|----------|---------|
| Seconds | `"1 second"`, `"2 seconds"`, `"1s"` | 1 |
| Minutes | `"1 minute"`, `"2 minutes"`, `"1m"` | 60 |
| Hours | `"1 hour"`, `"2 hours"`, `"1h"` | 3600 |
| Days | `"1 day"`, `"2 days"`, `"1d"` | 86400 |
| Weeks | `"1 week"`, `"2 weeks"`, `"1w"` | 604800 |
| Months | `"1 month"`, `"2 months"` | 2592000 (30 days) |
| Years | `"1 year"`, `"2 years"` | 31536000 (365 days) |

## Classes

### RateLimiterFactory

Creates limiter instances with a specific configuration.

```typescript
class RateLimiterFactory {
  constructor(
    config: LimiterConfig,
    storage: StorageInterface,
    lock?: LockInterface
  );

  create(id: string): LimiterInterface;
}
```

**Parameters:**
- `config`: Rate limiter configuration (see Configuration Types)
- `storage`: Storage backend (e.g., `InMemoryStorage`, custom Redis storage)
- `lock`: Optional locking mechanism (default: `NoLock`)

**Example:**
```typescript
const factory = new RateLimiterFactory(
  {
    policy: 'token_bucket',
    id: 'api',
    limit: 100,
    rate: { interval: '1 minute', amount: 100 }
  },
  new InMemoryStorage()
);

const limiter = factory.create('user-123');
```

### CompoundRateLimiterFactory

Combines multiple rate limiter factories.

```typescript
class CompoundRateLimiterFactory {
  constructor(factories: RateLimiterFactory[]);

  create(id: string): CompoundLimiter;
}
```

**Example:**
```typescript
const compound = new CompoundRateLimiterFactory([
  perSecondFactory,
  perMinuteFactory
]);

const limiter = compound.create('user-123');
```

### InMemoryStorage

Built-in in-memory storage implementation.

```typescript
class InMemoryStorage implements StorageInterface {
  constructor();

  save(state: LimiterStateInterface): Promise<void>;
  fetch(id: string): Promise<LimiterStateInterface | null>;
  delete(id: string): Promise<void>;
  clear(): void;  // Clear all stored states
}
```

**Example:**
```typescript
const storage = new InMemoryStorage();

// Clear between tests
storage.clear();
```

### NoLimiter

Pass-through limiter that always accepts.

```typescript
class NoLimiter implements LimiterInterface {
  consume(tokens?: number): Promise<RateLimit>;
  reserve(tokens?: number, maxTime?: number | null): Promise<Reservation>;
  reset(): Promise<void>;
}
```

**Example:**
```typescript
const limiter = new NoLimiter();
const result = await limiter.consume(1000000);
console.log(result.isAccepted()); // true
```

## Interfaces

### LimiterInterface

Main interface implemented by all rate limiters.

```typescript
interface LimiterInterface {
  consume(tokens?: number): Promise<RateLimit>;
  reserve(tokens?: number, maxTime?: number | null): Promise<Reservation>;
  reset(): Promise<void>;
}
```

**Methods:**

#### consume(tokens?: number): Promise<RateLimit>

Attempts to consume tokens immediately.

**Parameters:**
- `tokens` (optional): Number of tokens to consume (default: 1)

**Returns:** `RateLimit` object with result

**Example:**
```typescript
const result = await limiter.consume(5);
if (result.isAccepted()) {
  console.log(`Accepted! ${result.getRemainingTokens()} remaining`);
} else {
  console.log(`Rejected. Retry after ${result.getRetryAfter()}s`);
}
```

#### reserve(tokens?: number, maxTime?: number | null): Promise<Reservation>

Reserves tokens, potentially waiting for them to become available.

**Parameters:**
- `tokens` (optional): Number of tokens to reserve (default: 1)
- `maxTime` (optional): Maximum seconds to wait (default: null = unlimited)

**Returns:** `Reservation` object

**Throws:** `MaxWaitDurationExceededError` if wait time exceeds `maxTime`

**Example:**
```typescript
const reservation = await limiter.reserve(10, 5);
await reservation.wait();
// Tokens are now reserved
```

#### reset(): Promise<void>

Resets the limiter state.

**Example:**
```typescript
await limiter.reset();
```

### RateLimit

Result object from `consume()` operations.

```typescript
interface RateLimit {
  isAccepted(): boolean;
  getRemainingTokens(): number;
  getRetryAfter(): number;
  getResetTime(): Date;
  ensureAccepted(): void;  // Throws if not accepted
}
```

**Methods:**

#### isAccepted(): boolean

Returns `true` if the request was accepted.

#### getRemainingTokens(): number

Returns the number of tokens remaining after this operation.

#### getRetryAfter(): number

Returns seconds until the next token becomes available (0 if accepted).

#### getResetTime(): Date

Returns when the limiter will next refill/reset.

#### ensureAccepted(): void

Throws `RateLimitExceededError` if the request was not accepted.

**Example:**
```typescript
try {
  result.ensureAccepted();
  // Proceed with operation
} catch (e) {
  if (e instanceof RateLimitExceededError) {
    console.log('Rate limited');
  }
}
```

### Reservation

Reservation object from `reserve()` operations.

```typescript
interface Reservation {
  wait(): Promise<void>;
  cancel(): Promise<void>;
  getDelay(): number;
}
```

**Methods:**

#### wait(): Promise<void>

Waits until reserved tokens are available.

#### cancel(): Promise<void>

Cancels the reservation and returns tokens.

#### getDelay(): number

Returns seconds until tokens will be available.

## Utility Classes

### Rate

Helper class for creating rate configurations.

```typescript
class Rate {
  static perSecond(amount: number): { interval: string; amount: number };
  static perMinute(amount: number): { interval: string; amount: number };
  static perHour(amount: number): { interval: string; amount: number };
  static perDay(amount: number): { interval: string; amount: number };
  static fromString(str: string): { interval: string; amount: number };
}
```

**Examples:**
```typescript
Rate.perSecond(10);        // { interval: '1 second', amount: 10 }
Rate.perMinute(100);       // { interval: '1 minute', amount: 100 }
Rate.perHour(1000);        // { interval: '1 hour', amount: 1000 }
Rate.perDay(10000);        // { interval: '1 day', amount: 10000 }
Rate.fromString('1 hour-100'); // { interval: '1 hour', amount: 100 }
```

## Exceptions

### RateLimitExceededError

Thrown when `ensureAccepted()` is called on a rejected `RateLimit`.

```typescript
class RateLimitExceededError extends Error {
  constructor(rateLimit: RateLimit);

  getRateLimit(): RateLimit;
  getRetryAfter(): number;
  getRemainingTokens(): number;
}
```

**Example:**
```typescript
try {
  result.ensureAccepted();
} catch (e) {
  if (e instanceof RateLimitExceededError) {
    console.log(`Retry after: ${e.getRetryAfter()}s`);
    console.log(`Remaining: ${e.getRemainingTokens()}`);
  }
}
```

### MaxWaitDurationExceededError

Thrown when `reserve()` is called with a `maxTime` that would be exceeded.

```typescript
class MaxWaitDurationExceededError extends Error {
  constructor(requiredWaitTime: number, maxWaitTime: number);

  getRequiredWaitTime(): number;
  getMaxWaitTime(): number;
}
```

**Example:**
```typescript
try {
  const reservation = await limiter.reserve(10, 5);
} catch (e) {
  if (e instanceof MaxWaitDurationExceededError) {
    console.log(`Would need ${e.getRequiredWaitTime()}s`);
    console.log(`Max allowed: ${e.getMaxWaitTime()}s`);
  }
}
```

### ReserveNotSupportedError

Thrown when `reserve()` is called on a `CompoundLimiter`.

```typescript
class ReserveNotSupportedError extends Error {
  constructor(message: string);
}
```

**Example:**
```typescript
try {
  await compoundLimiter.reserve(10);
} catch (e) {
  if (e instanceof ReserveNotSupportedError) {
    console.log('Use consume() instead');
  }
}
```

## Storage Interface

Custom storage backends must implement:

```typescript
interface StorageInterface {
  save(state: LimiterStateInterface): Promise<void>;
  fetch(id: string): Promise<LimiterStateInterface | null>;
  delete(id: string): Promise<void>;
}
```

See [Custom Storage](./custom-storage.md) for implementation details.

## Lock Interface

Custom locking mechanisms must implement:

```typescript
interface LockInterface {
  acquire(key: string, ttl?: number): Promise<boolean>;
  release(key: string): Promise<void>;
  withLock<T>(key: string, callback: () => Promise<T>, ttl?: number): Promise<T>;
}
```

See [Custom Storage](./custom-storage.md) for implementation details.

## Type Exports

All types are exported for TypeScript users:

```typescript
import type {
  LimiterInterface,
  RateLimit,
  Reservation,
  StorageInterface,
  LockInterface,
  LimiterStateInterface,
  LimiterConfig,
  TokenBucketConfig,
  FixedWindowConfig,
  SlidingWindowConfig,
  NoLimitConfig
} from '@zeitar/throttle';
```

## Related Guides

- [Getting Started](./getting-started.md) - Quick start guide
- [Algorithms](./algorithms.md) - Algorithm selection guide
- [Custom Storage](./custom-storage.md) - Implementing custom storage
