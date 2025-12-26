import { Reservation } from '../Reservation';
import { RateLimit } from '../RateLimit';

describe('Reservation', () => {
  let rateLimit: RateLimit;

  beforeEach(() => {
    const retryAfter = new Date(Date.now() + 5000);
    rateLimit = new RateLimit(5, retryAfter, true, 10);
  });

  describe('constructor', () => {
    it('should create a reservation with correct values', () => {
      const timeToAct = Date.now() + 1000;
      const reservation = new Reservation(timeToAct, rateLimit);

      expect(reservation.getTimeToAct()).toBe(timeToAct);
      expect(reservation.getRateLimit()).toBe(rateLimit);
    });

    it('should handle past time to act', () => {
      const timeToAct = Date.now() - 5000;
      const reservation = new Reservation(timeToAct, rateLimit);

      expect(reservation.getTimeToAct()).toBe(timeToAct);
    });
  });

  describe('getTimeToAct', () => {
    it('should return the time to act in milliseconds', () => {
      const timeToAct = Date.now() + 2000;
      const reservation = new Reservation(timeToAct, rateLimit);

      expect(reservation.getTimeToAct()).toBe(timeToAct);
    });
  });

  describe('getWaitDuration', () => {
    it('should return positive duration when time to act is in future', () => {
      const timeToAct = Date.now() + 5000;
      const reservation = new Reservation(timeToAct, rateLimit);

      const waitDuration = reservation.getWaitDuration();
      expect(waitDuration).toBeGreaterThan(4000);
      expect(waitDuration).toBeLessThan(6000);
    });

    it('should return 0 when time to act is in past', () => {
      const timeToAct = Date.now() - 1000;
      const reservation = new Reservation(timeToAct, rateLimit);

      expect(reservation.getWaitDuration()).toBe(0);
    });

    it('should return ~0 when time to act is now', () => {
      const timeToAct = Date.now();
      const reservation = new Reservation(timeToAct, rateLimit);

      const waitDuration = reservation.getWaitDuration();
      expect(waitDuration).toBeGreaterThanOrEqual(0);
      expect(waitDuration).toBeLessThan(100);
    });

    it('should decrease over time', async () => {
      const timeToAct = Date.now() + 1000;
      const reservation = new Reservation(timeToAct, rateLimit);

      const duration1 = reservation.getWaitDuration();
      await new Promise(resolve => setTimeout(resolve, 100));
      const duration2 = reservation.getWaitDuration();

      expect(duration2).toBeLessThan(duration1);
    });
  });

  describe('getRateLimit', () => {
    it('should return the associated RateLimit object', () => {
      const reservation = new Reservation(Date.now(), rateLimit);

      expect(reservation.getRateLimit()).toBe(rateLimit);
    });

    it('should allow accessing RateLimit properties', () => {
      const reservation = new Reservation(Date.now(), rateLimit);

      expect(reservation.getRateLimit().getRemainingTokens()).toBe(5);
      expect(reservation.getRateLimit().getLimit()).toBe(10);
      expect(reservation.getRateLimit().isAccepted()).toBe(true);
    });
  });

  describe('wait', () => {
    it('should resolve immediately when time to act is in past', async () => {
      const timeToAct = Date.now() - 1000;
      const reservation = new Reservation(timeToAct, rateLimit);

      const start = Date.now();
      await reservation.wait();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('should wait until time to act', async () => {
      const timeToAct = Date.now() + 100;
      const reservation = new Reservation(timeToAct, rateLimit);

      const start = Date.now();
      await reservation.wait();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });

    it('should work when time to act is now', async () => {
      const timeToAct = Date.now();
      const reservation = new Reservation(timeToAct, rateLimit);

      const start = Date.now();
      await reservation.wait();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('usage patterns', () => {
    it('should support check-then-wait pattern', async () => {
      const timeToAct = Date.now() + 50;
      const reservation = new Reservation(timeToAct, rateLimit);

      if (reservation.getWaitDuration() > 0) {
        await reservation.wait();
      }

      expect(Date.now()).toBeGreaterThanOrEqual(timeToAct - 10);
    });
  });
});
