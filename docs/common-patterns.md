# Common Patterns

Real-world rate limiting patterns and examples for production applications.

## Different Limits for User Tiers

Provide different rate limits based on subscription tier:

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

type UserTier = 'free' | 'pro' | 'enterprise';

const storage = new InMemoryStorage();

function getLimiterForUser(userId: string, tier: UserTier) {
  const configs = {
    free: { limit: 100, rate: { interval: '1 hour', amount: 100 } },
    pro: { limit: 1000, rate: { interval: '1 hour', amount: 1000 } },
    enterprise: { limit: 10000, rate: { interval: '1 hour', amount: 10000 } }
  };

  const factory = new RateLimiterFactory(
    { policy: 'token_bucket', id: `api-${tier}`, ...configs[tier] },
    storage
  );

  return factory.create(userId);
}

// Usage in Express
app.use(async (req, res, next) => {
  const tier = req.user.subscriptionTier;
  const limiter = getLimiterForUser(req.user.id, tier);
  const result = await limiter.consume();

  if (!result.isAccepted()) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      tier,
      upgradeUrl: tier === 'free' ? '/upgrade' : undefined
    });
  }

  next();
});
```

## Rate Limiting by API Endpoint

Different endpoints have different resource costs and should have different limits:

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const storage = new InMemoryStorage();

// Define limits for each endpoint type
const factories = {
  search: new RateLimiterFactory({
    policy: 'token_bucket',
    id: 'search',
    limit: 20,
    rate: { interval: '1 minute', amount: 20 }
  }, storage),

  upload: new RateLimiterFactory({
    policy: 'token_bucket',
    id: 'upload',
    limit: 5,
    rate: { interval: '1 hour', amount: 5 }
  }, storage),

  export: new RateLimiterFactory({
    policy: 'fixed_window',
    id: 'export',
    limit: 10,
    interval: '1 day'
  }, storage),

  general: new RateLimiterFactory({
    policy: 'token_bucket',
    id: 'general',
    limit: 100,
    rate: { interval: '1 minute', amount: 100 }
  }, storage)
};

// Apply to specific routes
app.post('/api/search', async (req, res) => {
  const limiter = factories.search.create(req.user.id);
  const result = await limiter.consume();

  if (!result.isAccepted()) {
    return res.status(429).json({ error: 'Search rate limit exceeded' });
  }

  // Handle search...
});

app.post('/api/upload', async (req, res) => {
  const limiter = factories.upload.create(req.user.id);
  const result = await limiter.consume();

  if (!result.isAccepted()) {
    return res.status(429).json({ error: 'Upload rate limit exceeded' });
  }

  // Handle upload...
});
```

## Global + Per-User Rate Limiting

Protect against both individual abuse and overall system load:

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const storage = new InMemoryStorage();

// Global limit: Protect overall system capacity
const globalFactory = new RateLimiterFactory({
  policy: 'fixed_window',
  id: 'global',
  limit: 10000,
  interval: '1 minute'
}, storage);

// Per-user limit: Prevent individual abuse
const perUserFactory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'per-user',
  limit: 100,
  rate: { interval: '1 minute', amount: 100 }
}, storage);

app.use(async (req, res, next) => {
  // Check global limit first (fail fast if system is overloaded)
  const globalLimit = await globalFactory.create('global').consume();
  if (!globalLimit.isAccepted()) {
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'System is currently experiencing high load'
    });
  }

  // Then check per-user limit
  const userLimit = await perUserFactory.create(req.user.id).consume();
  if (!userLimit.isAccepted()) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: userLimit.getRetryAfter()
    });
  }

  next();
});
```

## Cost-Based Rate Limiting

Different operations consume different amounts of tokens:

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const factory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'api',
  limit: 1000,
  rate: { interval: '1 hour', amount: 1000 }
}, new InMemoryStorage());

// Define costs for different operations
const operationCosts = {
  read: 1,
  write: 5,
  search: 10,
  export: 50,
  heavyComputation: 100
};

app.post('/api/search', async (req, res) => {
  const limiter = factory.create(req.user.id);
  const cost = operationCosts.search;
  const result = await limiter.consume(cost);

  if (!result.isAccepted()) {
    return res.status(429).json({
      error: 'Insufficient tokens',
      required: cost,
      available: result.getRemainingTokens()
    });
  }

  // Perform search...
});

app.post('/api/export', async (req, res) => {
  const limiter = factory.create(req.user.id);
  const cost = operationCosts.export;
  const result = await limiter.consume(cost);

  if (!result.isAccepted()) {
    return res.status(429).json({
      error: 'Insufficient tokens for export',
      required: cost,
      retryAfter: result.getRetryAfter()
    });
  }

  // Perform export...
});
```

## IP + User Rate Limiting

Rate limit by both IP (for anonymous users) and user ID (for authenticated users):

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const storage = new InMemoryStorage();

// Generous limit for IPs (shared by multiple users)
const ipFactory = new RateLimiterFactory({
  policy: 'fixed_window',
  id: 'ip-limit',
  limit: 1000,
  interval: '1 hour'
}, storage);

// Strict limit per authenticated user
const userFactory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'user-limit',
  limit: 100,
  rate: { interval: '1 hour', amount: 100 }
}, storage);

app.use(async (req, res, next) => {
  // Always check IP limit
  const ipLimit = await ipFactory.create(req.ip).consume();
  if (!ipLimit.isAccepted()) {
    return res.status(429).json({
      error: 'IP rate limit exceeded',
      message: 'Too many requests from this IP address'
    });
  }

  // Check user limit if authenticated
  if (req.user) {
    const userLimit = await userFactory.create(req.user.id).consume();
    if (!userLimit.isAccepted()) {
      return res.status(429).json({
        error: 'User rate limit exceeded',
        retryAfter: userLimit.getRetryAfter()
      });
    }
  }

  next();
});
```

## Composite Key Pattern

Create complex rate limiting keys for multi-dimensional limits:

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const factory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'api',
  limit: 50,
  rate: { interval: '1 minute', amount: 50 }
}, new InMemoryStorage());

// Rate limit per user per endpoint
app.post('/api/:resource', async (req, res) => {
  const key = `${req.user.id}:${req.params.resource}`;
  const limiter = factory.create(key);
  const result = await limiter.consume();

  if (!result.isAccepted()) {
    return res.status(429).json({
      error: `Rate limit exceeded for ${req.params.resource}`,
      retryAfter: result.getRetryAfter()
    });
  }

  // Handle request...
});

// Rate limit per user per target resource
app.post('/api/share/:targetId', async (req, res) => {
  const key = `${req.user.id}:share:${req.params.targetId}`;
  const limiter = factory.create(key);
  const result = await limiter.consume();

  if (!result.isAccepted()) {
    return res.status(429).json({
      error: 'Too many share requests for this resource'
    });
  }

  // Handle sharing...
});
```

## Graceful Degradation

Degrade service gracefully when rate limited instead of hard rejections:

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const highPriorityFactory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'high-priority',
  limit: 100,
  rate: { interval: '1 minute', amount: 100 }
}, new InMemoryStorage());

const lowPriorityFactory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'low-priority',
  limit: 1000,
  rate: { interval: '1 minute', amount: 1000 }
}, new InMemoryStorage());

app.get('/api/search', async (req, res) => {
  const userId = req.user.id;

  // Try high priority (fast response)
  const highPriority = await highPriorityFactory.create(userId).consume();
  if (highPriority.isAccepted()) {
    const results = await performFullSearch(req.query);
    return res.json({ results, quality: 'high' });
  }

  // Fall back to low priority (cached/simplified results)
  const lowPriority = await lowPriorityFactory.create(userId).consume();
  if (lowPriority.isAccepted()) {
    const results = await performCachedSearch(req.query);
    return res.json({
      results,
      quality: 'cached',
      message: 'Showing cached results due to high load'
    });
  }

  // Finally reject
  return res.status(429).json({
    error: 'Rate limit exceeded',
    retryAfter: lowPriority.getRetryAfter()
  });
});
```

## Time-Based Dynamic Limits

Adjust limits based on time of day:

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

function getFactoryForCurrentTime(storage: InMemoryStorage) {
  const hour = new Date().getHours();

  // Peak hours (9 AM - 5 PM): Stricter limits
  if (hour >= 9 && hour < 17) {
    return new RateLimiterFactory({
      policy: 'token_bucket',
      id: 'peak',
      limit: 50,
      rate: { interval: '1 minute', amount: 50 }
    }, storage);
  }

  // Off-peak hours: More generous limits
  return new RateLimiterFactory({
    policy: 'token_bucket',
    id: 'off-peak',
    limit: 200,
    rate: { interval: '1 minute', amount: 200 }
  }, storage);
}

const storage = new InMemoryStorage();

app.use(async (req, res, next) => {
  const factory = getFactoryForCurrentTime(storage);
  const limiter = factory.create(req.user.id);
  const result = await limiter.consume();

  if (!result.isAccepted()) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      hint: 'Try during off-peak hours for higher limits'
    });
  }

  next();
});
```

## Related Guides

- [Getting Started](./getting-started.md) - Basic usage
- [Framework Integration](./framework-integration.md) - Express/Fastify integration
- [Advanced Usage](./advanced-usage.md) - Compound limiters and reservation pattern
- [Custom Storage](./custom-storage.md) - Distributed rate limiting
