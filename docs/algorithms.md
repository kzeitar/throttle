# Algorithm Guide

Choosing the right rate limiting algorithm is crucial for your application's behavior. This guide will help you make the right choice.

## Choosing an Algorithm

**Not sure which algorithm to use?** Follow this guide:

### Use Token Bucket (Recommended) if:
- ✅ You want to allow occasional bursts of traffic
- ✅ You need steady-state rate limiting with some flexibility
- ✅ Most common API rate limiting scenarios
- **Example**: API allows 100 requests/minute with bursts up to 100

### Use Fixed Window if:
- ✅ You need simple, predictable quotas
- ✅ You want the most efficient implementation
- ✅ Boundary bursts are acceptable
- **Example**: Daily API quota of 10,000 requests

### Use Sliding Window if:
- ✅ You need smooth rate limiting without boundary issues
- ✅ Precision is more important than performance
- ✅ You want to prevent "double-dipping" at window edges
- **Example**: Strict 1000 requests/hour with no window edge exploitation

### Use No Limit if:
- ✅ Testing or development environments
- ✅ Feature flag to disable rate limiting
- ✅ Placeholder for future rate limiting

## Algorithm Comparison

| Algorithm | Pros | Cons | Best For |
|-----------|------|------|----------|
| **Token Bucket** | • Allows bursts<br>• Smooth refills<br>• Most flexible | • Slightly more complex state | API rate limiting, microservices |
| **Fixed Window** | • Simple<br>• Efficient<br>• Predictable | • Burst at boundaries<br>• Can do 2× limit at edges | Daily/hourly quotas, analytics |
| **Sliding Window** | • Smooth boundaries<br>• No burst issues<br>• Precise | • More computation | High-security APIs, payment processing |
| **No Limit** | • Pass-through<br>• Zero overhead | • No limiting | Testing, feature flags |

## Performance

All algorithms are highly efficient:

- **Token Bucket**: O(1) time, O(1) space per limiter
- **Fixed Window**: O(1) time, O(1) space per limiter
- **Sliding Window**: O(1) time, O(1) space per limiter
- All algorithms use minimal memory (~100 bytes per active limiter)

## Detailed Algorithm Behavior

### Token Bucket

**How it works:**
1. Starts with a full bucket of tokens (limit)
2. Tokens are consumed by requests
3. Tokens refill at a steady rate (rate.amount per rate.interval)
4. Bucket capacity is capped at limit

**Characteristics:**
- Allows bursts up to the bucket size
- Tokens accumulate during idle periods
- Smooth steady-state limiting
- Most versatile algorithm

**Example:**
```typescript
{
  policy: 'token_bucket',
  id: 'api',
  limit: 100,              // Max bucket size
  rate: {
    interval: '1 minute',  // Refill every minute
    amount: 50             // Add 50 tokens per minute
  }
}
```
This allows bursts of 100 requests, then steady 50/minute.

### Fixed Window

**How it works:**
1. Time is divided into fixed windows (e.g., 1:00-1:59, 2:00-2:59)
2. Each window has a counter starting at 0
3. Counter increments with each request
4. Counter resets when window ends

**Characteristics:**
- Simple to understand and implement
- Predictable window boundaries
- Can allow 2× limit at window boundaries (e.g., 100 at 1:59, 100 at 2:00)
- Most efficient algorithm

**Example:**
```typescript
{
  policy: 'fixed_window',
  id: 'api',
  limit: 1000,
  interval: '1 hour'
}
```
Allows 1000 requests per hour window.

### Sliding Window

**How it works:**
1. Maintains counts for current and previous window
2. Calculates weighted average based on time in current window
3. Smoothly transitions between windows

**Characteristics:**
- No boundary burst issues
- More precise rate limiting
- Slightly more computation than fixed window
- Ideal for strict enforcement

**Example:**
```typescript
{
  policy: 'sliding_window',
  id: 'api',
  limit: 1000,
  interval: '1 hour'
}
```
Allows exactly 1000 requests per rolling hour.

### No Limit

**How it works:**
1. Always accepts all requests
2. No state tracking
3. Pass-through implementation

**Characteristics:**
- Zero overhead
- Useful for testing and feature flags
- Can be swapped with real limiters without code changes

**Example:**
```typescript
import { NoLimiter } from '@zeitar/throttle';

const limiter = new NoLimiter();
const result = await limiter.consume(); // Always accepted
```

## Visual Comparison

### Token Bucket
```
Time:    0s  10s  20s  30s  40s  50s  60s
Tokens: 100  90   80   85   90   95  100
         |   -10  -10   +5   +5   +5   +5
```
Allows bursts, refills gradually.

### Fixed Window
```
Window 1 (0-60s):  0 → 50 requests ✓
Window 2 (60-120s): 0 → 50 requests ✓
Boundary: Request at 59s ✓, Request at 60s ✓ (potential 2× burst)
```

### Sliding Window
```
Current: 30s into window
Previous window: 80 requests
Current window: 40 requests
Effective count: 80 * 0.5 + 40 = 80 requests
```

## Thread Safety

All algorithms use locking (via `LockInterface`) to ensure thread-safe operations:

- **Single instance**: Default `NoLock` is sufficient
- **Distributed systems**: Implement distributed lock (e.g., Redis)

See [Custom Storage](./custom-storage.md) for distributed locking implementation.

## Related Guides

- [Getting Started](./getting-started.md) - Quick start examples
- [Framework Integration](./framework-integration.md) - Express/Fastify integration
- [Advanced Usage](./advanced-usage.md) - Compound limiters and reservation pattern
