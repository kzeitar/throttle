import { NoLimiter } from '../NoLimiter';

describe('NoLimiter', () => {
  let limiter: NoLimiter;

  beforeEach(() => {
    limiter = new NoLimiter();
  });

  describe('reserve', () => {
    it('should always return an immediate reservation with maximum tokens', async () => {
      const reservation = await limiter.reserve(100);

      expect(reservation.getWaitDuration()).toBe(0);
      expect(reservation.getRateLimit().isAccepted()).toBe(true);
      expect(reservation.getRateLimit().getRemainingTokens()).toBe(Number.MAX_SAFE_INTEGER);
      expect(reservation.getRateLimit().getLimit()).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should ignore maxTime parameter', async () => {
      const reservation = await limiter.reserve(100, 0);

      expect(reservation.getRateLimit().isAccepted()).toBe(true);
    });
  });

  describe('consume', () => {
    it('should always accept consumption with maximum tokens', async () => {
      const rateLimit = await limiter.consume(100);

      expect(rateLimit.isAccepted()).toBe(true);
      expect(rateLimit.getRemainingTokens()).toBe(Number.MAX_SAFE_INTEGER);
      expect(rateLimit.getLimit()).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('reset', () => {
    it('should not affect future requests', async () => {
      const before = await limiter.consume(100);
      await limiter.reset();
      const after = await limiter.consume(100);

      expect(before.isAccepted()).toBe(true);
      expect(after.isAccepted()).toBe(true);
    });
  });
});
