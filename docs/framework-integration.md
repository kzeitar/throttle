# Framework Integration

Learn how to integrate @zeitar/throttle with popular Node.js frameworks.

## Express Middleware

### Basic Per-IP Rate Limiting

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

// Per-IP rate limiting middleware
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const limiter = factory.create(req.ip);
  const result = await limiter.consume();

  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', '100');
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

### Per-User Rate Limiting

```typescript
// Per-user rate limiting for authenticated routes
app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id || req.ip;
  const limiter = factory.create(userId);
  const result = await limiter.consume();

  if (!result.isAccepted()) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: result.getRetryAfter()
    });
  }

  next();
});
```

### Reusable Middleware Factory

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';
import type { Request, Response, NextFunction } from 'express';

function createRateLimitMiddleware(
  limit: number,
  interval: string,
  keyFn: (req: Request) => string = (req) => req.ip
) {
  const factory = new RateLimiterFactory(
    {
      policy: 'token_bucket',
      id: 'api',
      limit,
      rate: { interval, amount: limit }
    },
    new InMemoryStorage()
  );

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn(req);
    const limiter = factory.create(key);
    const result = await limiter.consume();

    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', result.getRemainingTokens().toString());

    if (!result.isAccepted()) {
      res.setHeader('Retry-After', result.getRetryAfter().toString());
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: result.getRetryAfter()
      });
    }

    next();
  };
}

// Usage:
app.use('/api/search', createRateLimitMiddleware(20, '1 minute'));
app.use('/api/upload', createRateLimitMiddleware(5, '1 hour', (req) => req.user.id));
```

## Fastify Plugin

### Basic Plugin

```typescript
import { FastifyPluginAsync } from 'fastify';
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  const factory = new RateLimiterFactory(
    {
      policy: 'token_bucket',
      id: 'api',
      limit: 100,
      rate: { interval: '1 minute', amount: 100 }
    },
    new InMemoryStorage()
  );

  fastify.addHook('preHandler', async (request, reply) => {
    const limiter = factory.create(request.ip);
    const result = await limiter.consume();

    reply.header('X-RateLimit-Limit', '100');
    reply.header('X-RateLimit-Remaining', result.getRemainingTokens().toString());

    if (!result.isAccepted()) {
      reply.status(429).send({
        error: 'Too many requests',
        retryAfter: result.getRetryAfter()
      });
    }
  });
};

fastify.register(rateLimitPlugin);
```

### Configurable Plugin

```typescript
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { RateLimiterFactory, InMemoryStorage, StorageInterface } from '@zeitar/throttle';

interface RateLimitOptions {
  limit: number;
  interval: string;
  storage?: StorageInterface;
  keyGenerator?: (request: any) => string;
}

const rateLimitPlugin: FastifyPluginAsync<RateLimitOptions> = async (fastify, options) => {
  const {
    limit,
    interval,
    storage = new InMemoryStorage(),
    keyGenerator = (request) => request.ip
  } = options;

  const factory = new RateLimiterFactory(
    {
      policy: 'token_bucket',
      id: 'api',
      limit,
      rate: { interval, amount: limit }
    },
    storage
  );

  fastify.addHook('preHandler', async (request, reply) => {
    const key = keyGenerator(request);
    const limiter = factory.create(key);
    const result = await limiter.consume();

    reply.header('X-RateLimit-Limit', limit.toString());
    reply.header('X-RateLimit-Remaining', result.getRemainingTokens().toString());

    if (!result.isAccepted()) {
      reply.header('Retry-After', result.getRetryAfter().toString());
      reply.status(429).send({
        error: 'Too many requests',
        retryAfter: result.getRetryAfter()
      });
    }
  });
};

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  fastify: '4.x'
});

// Usage:
fastify.register(rateLimitPlugin, {
  limit: 100,
  interval: '1 minute',
  keyGenerator: (request) => request.user?.id || request.ip
});
```

## NestJS Interceptor

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private factory: RateLimiterFactory;

  constructor() {
    this.factory = new RateLimiterFactory(
      {
        policy: 'token_bucket',
        id: 'api',
        limit: 100,
        rate: { interval: '1 minute', amount: 100 }
      },
      new InMemoryStorage()
    );
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const limiter = this.factory.create(request.ip);
    const result = await limiter.consume();

    response.setHeader('X-RateLimit-Limit', '100');
    response.setHeader('X-RateLimit-Remaining', result.getRemainingTokens().toString());

    if (!result.isAccepted()) {
      response.setHeader('Retry-After', result.getRetryAfter().toString());
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too many requests',
          retryAfter: result.getRetryAfter()
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return next.handle();
  }
}

// Usage:
@UseInterceptors(RateLimitInterceptor)
@Controller('api')
export class ApiController {
  // Your routes...
}
```

## Koa Middleware

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';
import type { Context, Next } from 'koa';

const factory = new RateLimiterFactory(
  {
    policy: 'token_bucket',
    id: 'api',
    limit: 100,
    rate: { interval: '1 minute', amount: 100 }
  },
  new InMemoryStorage()
);

async function rateLimitMiddleware(ctx: Context, next: Next) {
  const limiter = factory.create(ctx.ip);
  const result = await limiter.consume();

  ctx.set('X-RateLimit-Limit', '100');
  ctx.set('X-RateLimit-Remaining', result.getRemainingTokens().toString());

  if (!result.isAccepted()) {
    ctx.set('Retry-After', result.getRetryAfter().toString());
    ctx.status = 429;
    ctx.body = {
      error: 'Too many requests',
      retryAfter: result.getRetryAfter()
    };
    return;
  }

  await next();
}

app.use(rateLimitMiddleware);
```

## Hono Middleware

```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';
import type { Context, Next } from 'hono';

const factory = new RateLimiterFactory(
  {
    policy: 'token_bucket',
    id: 'api',
    limit: 100,
    rate: { interval: '1 minute', amount: 100 }
  },
  new InMemoryStorage()
);

async function rateLimitMiddleware(c: Context, next: Next) {
  const limiter = factory.create(c.req.header('x-forwarded-for') || 'unknown');
  const result = await limiter.consume();

  c.header('X-RateLimit-Limit', '100');
  c.header('X-RateLimit-Remaining', result.getRemainingTokens().toString());

  if (!result.isAccepted()) {
    c.header('Retry-After', result.getRetryAfter().toString());
    return c.json({
      error: 'Too many requests',
      retryAfter: result.getRetryAfter()
    }, 429);
  }

  await next();
}

app.use(rateLimitMiddleware);
```

## Best Practices

### 1. Use Proper HTTP Headers

Always include standard rate limit headers:
- `X-RateLimit-Limit`: Total limit
- `X-RateLimit-Remaining`: Tokens remaining
- `Retry-After`: Seconds until retry (when rate limited)

### 2. Choose the Right Key

```typescript
// Per-IP (default)
const key = req.ip;

// Per-user (authenticated)
const key = req.user?.id || req.ip;

// Per-API-key
const key = req.headers['x-api-key'];

// Composite key
const key = `${req.user.id}:${req.route.path}`;
```

### 3. Handle Distributed Systems

For multi-server deployments, use Redis storage:

```typescript
import { RedisStorage } from './your-redis-storage';

const factory = new RateLimiterFactory(
  config,
  new RedisStorage(redisClient)
);
```

See [Custom Storage](./custom-storage.md) for implementation details.

### 4. Graceful Degradation

```typescript
app.use(async (req, res, next) => {
  try {
    const limiter = factory.create(req.ip);
    const result = await limiter.consume();

    if (!result.isAccepted()) {
      return res.status(429).json({ error: 'Too many requests' });
    }
  } catch (error) {
    // Log error but don't block requests if rate limiter fails
    console.error('Rate limiter error:', error);
  }

  next();
});
```

## Related Guides

- [Getting Started](./getting-started.md) - Basic usage
- [Common Patterns](./common-patterns.md) - Real-world examples
- [Custom Storage](./custom-storage.md) - Redis integration
