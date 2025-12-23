/**
 * Basic usage examples for @zeitar/throttle
 *
 * Run with: npx ts-node examples/basic-usage.ts
 */

import {
  RateLimiterFactory,
  InMemoryStorage,
  CompoundRateLimiterFactory,
  Rate,
  RateLimitExceededException,
} from '../src';

async function tokenBucketExample() {
  console.log('\n=== Token Bucket Example ===');

  const storage = new InMemoryStorage();
  const factory = new RateLimiterFactory(
    {
      policy: 'token_bucket',
      id: 'api',
      limit: 10,              // Burst capacity
      rate: {
        interval: '1 minute',
        amount: 10            // Refill 10 tokens per minute
      }
    },
    storage
  );

  const limiter = factory.create('user-123');

  // Consume tokens
  for (let i = 1; i <= 12; i++) {
    const result = await limiter.consume(1);
    console.log(
      `Request ${i}: ${result.isAccepted() ? 'ACCEPTED' : 'REJECTED'} ` +
      `(${result.getRemainingTokens()} tokens remaining)`
    );
  }
}

async function fixedWindowExample() {
  console.log('\n=== Fixed Window Example ===');

  const storage = new InMemoryStorage();
  const factory = new RateLimiterFactory(
    {
      policy: 'fixed_window',
      id: 'api',
      limit: 5,
      interval: '10 seconds'
    },
    storage
  );

  const limiter = factory.create('user-456');

  // Try 7 requests (should reject last 2)
  for (let i = 1; i <= 7; i++) {
    const result = await limiter.consume(1);
    console.log(
      `Request ${i}: ${result.isAccepted() ? 'ACCEPTED' : 'REJECTED'}`
    );

    if (!result.isAccepted()) {
      console.log(`  Retry after: ${result.getRetryAfter()}`);
    }
  }
}

async function slidingWindowExample() {
  console.log('\n=== Sliding Window Example ===');

  const storage = new InMemoryStorage();
  const factory = new RateLimiterFactory(
    {
      policy: 'sliding_window',
      id: 'api',
      limit: 5,
      interval: '10 seconds'
    },
    storage
  );

  const limiter = factory.create('user-789');

  for (let i = 1; i <= 7; i++) {
    const result = await limiter.consume(1);
    console.log(
      `Request ${i}: ${result.isAccepted() ? 'ACCEPTED' : 'REJECTED'} ` +
      `(${result.getRemainingTokens()} tokens remaining)`
    );
  }
}

async function reservationExample() {
  console.log('\n=== Reservation Pattern Example ===');

  const storage = new InMemoryStorage();
  const factory = new RateLimiterFactory(
    {
      policy: 'token_bucket',
      id: 'api',
      limit: 5,
      rate: {
        interval: '1 second',
        amount: 1
      }
    },
    storage
  );

  const limiter = factory.create('user-reservation');

  // Reserve 3 tokens
  console.log('Reserving 3 tokens...');
  const reservation = await limiter.reserve(3);
  console.log(`Reserved! Wait duration: ${reservation.getWaitDuration()}ms`);

  await reservation.wait();
  console.log('Tokens acquired, proceeding with operation');
}

async function compoundLimiterExample() {
  console.log('\n=== Compound Limiter Example ===');

  const storage = new InMemoryStorage();

  // Limit: 5 per second AND 20 per minute
  const perSecondFactory = new RateLimiterFactory({
    policy: 'fixed_window',
    id: 'per-second',
    limit: 5,
    interval: '1 second'
  }, storage);

  const perMinuteFactory = new RateLimiterFactory({
    policy: 'fixed_window',
    id: 'per-minute',
    limit: 20,
    interval: '1 minute'
  }, storage);

  const compound = new CompoundRateLimiterFactory([
    perSecondFactory,
    perMinuteFactory
  ]);

  const limiter = compound.create('user-compound');

  // Try 8 requests quickly (should hit per-second limit)
  for (let i = 1; i <= 8; i++) {
    const result = await limiter.consume(1);
    console.log(
      `Request ${i}: ${result.isAccepted() ? 'ACCEPTED' : 'REJECTED'} ` +
      `(${result.getRemainingTokens()} tokens remaining)`
    );
  }
}

async function exceptionHandlingExample() {
  console.log('\n=== Exception Handling Example ===');

  const storage = new InMemoryStorage();
  const factory = new RateLimiterFactory(
    {
      policy: 'token_bucket',
      id: 'api',
      limit: 2,
      rate: {
        interval: '1 minute',
        amount: 2
      }
    },
    storage
  );

  const limiter = factory.create('user-exception');

  try {
    // Use all tokens
    await limiter.consume(2);
    console.log('First request: ACCEPTED');

    // This should fail
    const result = await limiter.consume(1);
    result.ensureAccepted(); // This will throw
  } catch (e) {
    if (e instanceof RateLimitExceededException) {
      console.log(`Rate limit exceeded!`);
      console.log(`  Retry after: ${e.getRetryAfter()}`);
      console.log(`  Remaining tokens: ${e.getRemainingTokens()}`);
      console.log(`  Limit: ${e.getLimit()}`);
    }
  }
}

async function rateHelperExample() {
  console.log('\n=== Rate Helper Example ===');

  const rates = [
    Rate.perSecond(10),
    Rate.perMinute(100),
    Rate.perHour(1000),
    Rate.perDay(10000),
    Rate.fromString('2 hours-500'),
  ];

  rates.forEach((rate, i) => {
    console.log(
      `Rate ${i + 1}: ${rate.getAmount()} tokens per ${rate.getInterval()} seconds`
    );
  });
}

// Run all examples
async function main() {
  console.log('🚀 @zeitar/throttle - Examples');
  console.log('================================');

  try {
    await tokenBucketExample();
    await fixedWindowExample();
    await slidingWindowExample();
    await reservationExample();
    await compoundLimiterExample();
    await exceptionHandlingExample();
    await rateHelperExample();

    console.log('\n✅ All examples completed!');
  } catch (error) {
    console.error('❌ Error running examples:', error);
    process.exit(1);
  }
}

main();
