# @zeitar/throttle

A production-ready TypeScript rate limiting library with support for multiple algorithms.

> Architecture inspired by [Symfony's Rate Limiter component](https://symfony.com/doc/current/rate_limiter.html), implemented natively in TypeScript with async/await patterns for Node.js.

[![npm version](https://img.shields.io/npm/v/@zeitar/throttle.svg)](https://www.npmjs.com/package/@zeitar/throttle)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 **Multiple Algorithms**: Token Bucket, Fixed Window, Sliding Window, and No-Limit policies
- 📦 **TypeScript Native**: Full type safety with strict typing
- 🔒 **Production Ready**: Thread-safe with optional distributed locking support
- 🧩 **Composable**: Combine multiple limiters with CompoundLimiter
- 💾 **Pluggable Storage**: In-memory storage included, easily extend for Redis, etc.
- ⚡ **High Performance**: Efficient algorithms with minimal overhead (O(1) time complexity)
- 🎯 **Zero Dependencies**: Core library has no external dependencies
- 🔌 **Framework Agnostic**: Works with Express, Fastify, or any Node.js framework

## Installation

```bash
npm install @zeitar/throttle
```

## Important: What This Library Does (and Doesn't Do)

**This library provides application-level rate limiting** - it's designed to manage legitimate traffic, enforce user quotas, and prevent abuse from authenticated users.

**This library is NOT designed to protect against DDoS attacks.** By the time a request reaches your Node.js application, you've already consumed server resources. For DDoS protection and traffic floods, use network-level solutions:

- **Edge protection**: Cloudflare, AWS Shield, Fastly
- **Reverse proxy**: NGINX rate limiting, Caddy rate limit module, Apache mod_ratelimit
- **Load balancer**: Most cloud load balancers have built-in rate limiting

**The right approach is layered security:**
1. Network/proxy level blocks massive attacks and traffic floods
2. This library handles per-user quotas, business logic, and authenticated rate limiting

See **[Rate Limiting vs DoS Protection](./docs/rate-limiting-vs-dos-protection.md)** for a detailed explanation and architecture guidance.

## Quick Start

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

// Create a rate limiter factory
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

// Create a limiter for a specific user
const limiter = factory.create('user-123');

// Try to consume tokens
const result = await limiter.consume(5);

if (result.isAccepted()) {
  console.log(`✓ Request accepted! ${result.getRemainingTokens()} tokens remaining`);
} else {
  console.log(`✗ Rate limited. Retry after ${result.getRetryAfter()} seconds`);
}
```

## Express Middleware Example

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';
import type { Request, Response, NextFunction } from 'express';

const factory = new RateLimiterFactory(
  {
    policy: 'token_bucket',
    id: 'api',
    limit: 100,
    rate: { interval: '1 minute', amount: 100 }
  },
  new InMemoryStorage()
);

app.use(async (req: Request, res: Response, next: NextFunction) => {
  const limiter = factory.create(req.ip);
  const result = await limiter.consume();

  res.setHeader('X-RateLimit-Remaining', result.getRemainingTokens().toString());

  if (!result.isAccepted()) {
    res.setHeader('Retry-After', result.getRetryAfter().toString());
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: result.getRetryAfter()
    });
  }

  next();
});
```

## Documentation

### Getting Started
- **[Getting Started Guide](./docs/getting-started.md)** - Installation, basic usage, and testing
- **[Rate Limiting vs DoS Protection](./docs/rate-limiting-vs-dos-protection.md)** - Understanding layered security (READ THIS FIRST)
- **[Choosing an Algorithm](./docs/algorithms.md)** - Algorithm comparison and selection guide
- **[Framework Integration](./docs/framework-integration.md)** - Express, Fastify, NestJS, Koa, Hono examples

### Core Concepts
- **[Common Patterns](./docs/common-patterns.md)** - User tiers, endpoint limits, global+per-user patterns
- **[Advanced Usage](./docs/advanced-usage.md)** - Reservation pattern, compound limiters, dynamic creation
- **[Custom Storage](./docs/custom-storage.md)** - Redis, PostgreSQL, DynamoDB implementations
- **[API Reference](./docs/api-reference.md)** - Complete API documentation

### Help & Troubleshooting
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions

## Algorithm Comparison

| Algorithm | Best For | Allows Bursts? | Precision |
|-----------|----------|----------------|-----------|
| **Token Bucket** ⭐ | Most APIs, microservices | ✅ Yes | Medium |
| **Fixed Window** | Daily quotas, analytics | ⚠️ At boundaries | Low |
| **Sliding Window** | High-security APIs, payments | ❌ No | High |
| **No Limit** | Testing, feature flags | ✅ Always | N/A |

**Not sure which to choose?** See the [Algorithm Guide](./docs/algorithms.md).

## Key Features

### Multiple Rate Limits (Compound Limiter)

```typescript
import { CompoundRateLimiterFactory } from '@zeitar/throttle';

// Enforce BOTH limits simultaneously
const compound = new CompoundRateLimiterFactory([
  perSecondFactory,  // 10/second
  perMinuteFactory   // 100/minute
]);

const limiter = compound.create('user-123');
```

### Reservation Pattern

```typescript
// Reserve tokens and wait for availability
const reservation = await limiter.reserve(10, 5); // Wait max 5 seconds
await reservation.wait();
// Tokens are now reserved, proceed with operation
```

### Distributed Systems

```typescript
// Use Redis for multi-server deployments
import { RedisStorage, RedisLock } from './your-impl';

const factory = new RateLimiterFactory(
  config,
  new RedisStorage(redisClient),
  new RedisLock(redisClient)
);
```

See [Custom Storage](./docs/custom-storage.md) for implementation.

## Performance

- **All algorithms**: O(1) time complexity
- **Memory usage**: ~100 bytes per active limiter
- **Throughput**: Designed for high-concurrency scenarios
- **Storage**: Pluggable backend (in-memory, Redis, database)

## Architecture

This library uses several design patterns for flexibility and maintainability:

- **Strategy Pattern**: Different algorithms implement `LimiterInterface`
- **Factory Pattern**: `RateLimiterFactory` creates configured limiters
- **Composite Pattern**: `CompoundLimiter` combines multiple limiters
- **Dependency Injection**: Storage and locking are pluggable

Inspired by [Symfony's Rate Limiter](https://github.com/symfony/rate-limiter) with full TypeScript support and async/await patterns.

## Testing

```typescript
import { NoLimiter, InMemoryStorage } from '@zeitar/throttle';

// Use NoLimiter for tests that shouldn't be rate limited
const limiter = new NoLimiter();

// Or clear InMemoryStorage between tests
const storage = new InMemoryStorage();
storage.clear();
```

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT © 2025 Khaled Zeitar

## Credits & Acknowledgments

- **Implementation**: © 2025 Khaled Zeitar - Original TypeScript implementation
- **Architectural inspiration**: [Symfony Rate Limiter](https://github.com/symfony/rate-limiter) by Fabien Potencier and contributors

While the code is written from scratch in TypeScript, the design patterns, API structure, and architectural decisions are influenced by Symfony's proven approach to rate limiting.
