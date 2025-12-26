# Custom Storage & Distributed Locking

Learn how to implement custom storage backends and distributed locking for production deployments.

## Storage Interface

Implement the `StorageInterface` to create custom storage backends for Redis, databases, or other persistence layers.

### Interface Definition

```typescript
interface StorageInterface {
  save(state: LimiterStateInterface): Promise<void>;
  fetch(id: string): Promise<LimiterStateInterface | null>;
  delete(id: string): Promise<void>;
}
```

## Redis Storage Implementation

### Basic Redis Storage

```typescript
import { StorageInterface, LimiterStateInterface } from '@zeitar/throttle';
import Redis from 'ioredis';

export class RedisStorage implements StorageInterface {
  constructor(private redis: Redis) {}

  async save(state: LimiterStateInterface): Promise<void> {
    const id = state.getId();
    const ttl = state.getExpirationTime();
    const data = JSON.stringify(state.toJSON());

    if (ttl > 0) {
      await this.redis.setex(id, ttl, data);
    } else {
      await this.redis.set(id, data);
    }
  }

  async fetch(id: string): Promise<LimiterStateInterface | null> {
    const data = await this.redis.get(id);
    if (!data) return null;

    const json = JSON.parse(data);

    // Deserialize based on state type
    // You'll need to import the appropriate state classes
    return this.deserializeState(json);
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(id);
  }

  private deserializeState(json: any): LimiterStateInterface {
    // Import state classes
    const {
      TokenBucketState,
      FixedWindowState,
      SlidingWindowState
    } = require('@zeitar/throttle');

    switch (json.type) {
      case 'token_bucket':
        return TokenBucketState.fromJSON(json);
      case 'fixed_window':
        return FixedWindowState.fromJSON(json);
      case 'sliding_window':
        return SlidingWindowState.fromJSON(json);
      default:
        throw new Error(`Unknown state type: ${json.type}`);
    }
  }
}
```

### Usage with Redis Storage

```typescript
import { RateLimiterFactory } from '@zeitar/throttle';
import { RedisStorage } from './redis-storage';
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

const storage = new RedisStorage(redis);

const factory = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'api',
  limit: 100,
  rate: { interval: '1 minute', amount: 100 }
}, storage);

const limiter = factory.create('user-123');
const result = await limiter.consume();
```

### Redis Storage with Compression

For high-throughput applications, compress state data:

```typescript
import { StorageInterface, LimiterStateInterface } from '@zeitar/throttle';
import Redis from 'ioredis';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export class CompressedRedisStorage implements StorageInterface {
  constructor(private redis: Redis) {}

  async save(state: LimiterStateInterface): Promise<void> {
    const id = state.getId();
    const ttl = state.getExpirationTime();
    const data = JSON.stringify(state.toJSON());
    const compressed = await gzipAsync(data);

    if (ttl > 0) {
      await this.redis.setex(id, ttl, compressed);
    } else {
      await this.redis.set(id, compressed);
    }
  }

  async fetch(id: string): Promise<LimiterStateInterface | null> {
    const compressed = await this.redis.getBuffer(id);
    if (!compressed) return null;

    const data = await gunzipAsync(compressed);
    const json = JSON.parse(data.toString());

    return this.deserializeState(json);
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(id);
  }

  private deserializeState(json: any): LimiterStateInterface {
    // Same as above
  }
}
```

## Database Storage Implementation

### PostgreSQL Storage

```typescript
import { StorageInterface, LimiterStateInterface } from '@zeitar/throttle';
import { Pool } from 'pg';

export class PostgresStorage implements StorageInterface {
  constructor(private pool: Pool) {
    this.initTable();
  }

  private async initTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limiter_states (
        id VARCHAR(255) PRIMARY KEY,
        data JSONB NOT NULL,
        expires_at TIMESTAMP
      )
    `);

    // Create index for expiration cleanup
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_expires_at
      ON rate_limiter_states(expires_at)
    `);
  }

  async save(state: LimiterStateInterface): Promise<void> {
    const id = state.getId();
    const data = state.toJSON();
    const ttl = state.getExpirationTime();
    const expiresAt = ttl > 0
      ? new Date(Date.now() + ttl * 1000)
      : null;

    await this.pool.query(
      `INSERT INTO rate_limiter_states (id, data, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id)
       DO UPDATE SET data = $2, expires_at = $3`,
      [id, JSON.stringify(data), expiresAt]
    );
  }

  async fetch(id: string): Promise<LimiterStateInterface | null> {
    const result = await this.pool.query(
      `SELECT data FROM rate_limiter_states
       WHERE id = $1
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const json = JSON.parse(result.rows[0].data);
    return this.deserializeState(json);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM rate_limiter_states WHERE id = $1',
      [id]
    );
  }

  async cleanup(): Promise<void> {
    // Remove expired entries
    await this.pool.query(
      'DELETE FROM rate_limiter_states WHERE expires_at < NOW()'
    );
  }

  private deserializeState(json: any): LimiterStateInterface {
    // Same as Redis example
  }
}
```

## Distributed Locking

For distributed systems (multiple servers), implement `LockInterface` to prevent race conditions.

### Lock Interface Definition

```typescript
interface LockInterface {
  acquire(key: string, ttl?: number): Promise<boolean>;
  release(key: string): Promise<void>;
  withLock<T>(key: string, callback: () => Promise<T>, ttl?: number): Promise<T>;
}
```

### Redis Lock Implementation

```typescript
import { LockInterface } from '@zeitar/throttle';
import Redis from 'ioredis';

export class RedisLock implements LockInterface {
  constructor(private redis: Redis) {}

  async acquire(key: string, ttl = 10): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const result = await this.redis.set(lockKey, '1', 'EX', ttl, 'NX');
    return result === 'OK';
  }

  async release(key: string): Promise<void> {
    const lockKey = `lock:${key}`;
    await this.redis.del(lockKey);
  }

  async withLock<T>(
    key: string,
    callback: () => Promise<T>,
    ttl = 10
  ): Promise<T> {
    const acquired = await this.acquire(key, ttl);
    if (!acquired) {
      throw new Error(`Could not acquire lock for key: ${key}`);
    }

    try {
      return await callback();
    } finally {
      await this.release(key);
    }
  }
}
```

### Robust Redis Lock with Redlock

For production distributed systems, use the Redlock algorithm:

```typescript
import { LockInterface } from '@zeitar/throttle';
import Redlock from 'redlock';
import Redis from 'ioredis';

export class RedlockLock implements LockInterface {
  private redlock: Redlock;

  constructor(redisClients: Redis[]) {
    this.redlock = new Redlock(redisClients, {
      driftFactor: 0.01,
      retryCount: 3,
      retryDelay: 200,
      retryJitter: 200
    });
  }

  async acquire(key: string, ttl = 10): Promise<boolean> {
    try {
      const lockKey = `lock:${key}`;
      await this.redlock.acquire([lockKey], ttl * 1000);
      return true;
    } catch (error) {
      return false;
    }
  }

  async release(key: string): Promise<void> {
    // Redlock handles this in withLock
  }

  async withLock<T>(
    key: string,
    callback: () => Promise<T>,
    ttl = 10
  ): Promise<T> {
    const lockKey = `lock:${key}`;
    const lock = await this.redlock.acquire([lockKey], ttl * 1000);

    try {
      return await callback();
    } finally {
      await lock.release();
    }
  }
}
```

### Usage with Distributed Lock

```typescript
import { RateLimiterFactory } from '@zeitar/throttle';
import { RedisStorage } from './redis-storage';
import { RedisLock } from './redis-lock';
import Redis from 'ioredis';

const redis = new Redis();

const factory = new RateLimiterFactory(
  {
    policy: 'token_bucket',
    id: 'api',
    limit: 100,
    rate: { interval: '1 minute', amount: 100 }
  },
  new RedisStorage(redis),
  new RedisLock(redis)  // ← Add distributed locking
);

const limiter = factory.create('user-123');
const result = await limiter.consume();
```

## DynamoDB Storage Implementation

```typescript
import { StorageInterface, LimiterStateInterface } from '@zeitar/throttle';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export class DynamoDBStorage implements StorageInterface {
  constructor(
    private client: DynamoDBClient,
    private tableName: string
  ) {}

  async save(state: LimiterStateInterface): Promise<void> {
    const id = state.getId();
    const data = state.toJSON();
    const ttl = state.getExpirationTime();
    const expiresAt = ttl > 0 ? Math.floor(Date.now() / 1000) + ttl : 0;

    const item = marshall({
      id,
      data: JSON.stringify(data),
      expiresAt: expiresAt || null
    });

    await this.client.send(new PutItemCommand({
      TableName: this.tableName,
      Item: item
    }));
  }

  async fetch(id: string): Promise<LimiterStateInterface | null> {
    const result = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ id })
    }));

    if (!result.Item) return null;

    const item = unmarshall(result.Item);

    // Check if expired
    if (item.expiresAt && item.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }

    const json = JSON.parse(item.data);
    return this.deserializeState(json);
  }

  async delete(id: string): Promise<void> {
    await this.client.send(new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ id })
    }));
  }

  private deserializeState(json: any): LimiterStateInterface {
    // Same as Redis example
  }
}
```

## Best Practices

### 1. Connection Pooling

Always use connection pooling for database/Redis clients:

```typescript
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false
});
```

### 2. Error Handling

Implement graceful degradation when storage fails:

```typescript
export class ResilientRedisStorage implements StorageInterface {
  constructor(private redis: Redis, private fallback: InMemoryStorage) {}

  async save(state: LimiterStateInterface): Promise<void> {
    try {
      await this.saveToRedis(state);
    } catch (error) {
      console.error('Redis save failed, using fallback:', error);
      await this.fallback.save(state);
    }
  }

  async fetch(id: string): Promise<LimiterStateInterface | null> {
    try {
      return await this.fetchFromRedis(id);
    } catch (error) {
      console.error('Redis fetch failed, using fallback:', error);
      return await this.fallback.fetch(id);
    }
  }

  // Implementation...
}
```

### 3. TTL Management

Always set appropriate TTLs to prevent storage bloat:

```typescript
// Token bucket: TTL = time to refill from 0 to limit
// Fixed window: TTL = window duration
// Sliding window: TTL = 2 × window duration
```

### 4. Key Namespacing

Use prefixes to organize keys:

```typescript
class RedisStorage implements StorageInterface {
  constructor(
    private redis: Redis,
    private prefix = 'rate_limiter:'
  ) {}

  async save(state: LimiterStateInterface): Promise<void> {
    const key = `${this.prefix}${state.getId()}`;
    // Save with prefixed key...
  }
}
```

## Related Guides

- [Getting Started](./getting-started.md) - Basic usage
- [Framework Integration](./framework-integration.md) - Express/Fastify integration
- [Troubleshooting](./troubleshooting.md) - Common issues
