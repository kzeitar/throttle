import { SlidingWindow } from '../SlidingWindow';

describe('SlidingWindow', () => {
  describe('constructor', () => {
    it('should create a sliding window with default values', () => {
      const window = new SlidingWindow('test', 60);

      expect(window.getId()).toBe('test');
      expect(window.getInterval()).toBe(60);
      expect(window.getCurrentWindowHitCount()).toBe(0);
      expect(window.getPreviousWindowHitCount()).toBe(0);
    });

    it('should accept custom hit counts', () => {
      const window = new SlidingWindow('test', 60, 10, 20);

      expect(window.getCurrentWindowHitCount()).toBe(10);
      expect(window.getPreviousWindowHitCount()).toBe(20);
    });

    it('should accept custom window end time', () => {
      const windowEndAt = 2000;
      const window = new SlidingWindow('test', 60, 0, 0, windowEndAt);

      expect(window.getWindowEndAt()).toBe(windowEndAt);
    });

    it('should calculate default window end time', () => {
      const beforeCreation = Date.now() / 1000;
      const window = new SlidingWindow('test', 60);
      const afterCreation = Date.now() / 1000;

      const windowEndAt = window.getWindowEndAt();
      expect(windowEndAt).toBeGreaterThanOrEqual(beforeCreation + 60);
      expect(windowEndAt).toBeLessThanOrEqual(afterCreation + 60);
    });
  });

  describe('add', () => {
    it('should add hits to current window', () => {
      const window = new SlidingWindow('test', 60, 0, 0);

      window.add(5);
      expect(window.getCurrentWindowHitCount()).toBe(5);

      window.add(3);
      expect(window.getCurrentWindowHitCount()).toBe(8);
    });

    it('should not affect previous window hits', () => {
      const window = new SlidingWindow('test', 60, 10, 20);

      window.add(5);
      expect(window.getCurrentWindowHitCount()).toBe(15);
      expect(window.getPreviousWindowHitCount()).toBe(20);
    });
  });

  describe('getHitCount (sliding calculation)', () => {
    it('should return current hits when at window start', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 10, 20, windowEndAt);

      // At window start (0% into window)
      const count = window.getHitCount(now);
      // (20 * (1 - 0)) + 10 = 20 + 10 = 30
      expect(count).toBe(30);
    });

    it('should calculate sliding count at 50% into window', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 10, 20, windowEndAt);

      // At 50% into window
      const count = window.getHitCount(now + 30);
      // (20 * (1 - 0.5)) + 10 = 10 + 10 = 20
      expect(count).toBe(20);
    });

    it('should return only current hits at window end', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 10, 20, windowEndAt);

      // At window end (100% into window)
      const count = window.getHitCount(now + 60);
      // Past window end, returns current hits
      expect(count).toBe(10);
    });

    it('should handle zero previous window hits', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 10, 0, windowEndAt);

      const count = window.getHitCount(now + 30);
      // (0 * 0.5) + 10 = 10
      expect(count).toBe(10);
    });

    it('should handle zero current window hits', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 0, 20, windowEndAt);

      const count = window.getHitCount(now + 30);
      // (20 * 0.5) + 0 = 10
      expect(count).toBe(10);
    });

    it('should floor the result', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 1, 10, windowEndAt);

      // At 25% into window
      const count = window.getHitCount(now + 15);
      // (10 * 0.75) + 1 = 7.5 + 1 = 8.5, floored to 8
      expect(count).toBe(8);
    });

    it('should use current time when not provided', () => {
      const window = new SlidingWindow('test', 60, 10, 20);

      const count = window.getHitCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isExpired', () => {
    it('should not be expired during current window', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 0, 0, windowEndAt);

      expect(window.isExpired(now + 30)).toBe(false);
      expect(window.isExpired(now + 59)).toBe(false);
    });

    it('should not be expired right after window end', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 0, 0, windowEndAt);

      expect(window.isExpired(now + 60)).toBe(false);
      expect(window.isExpired(now + 100)).toBe(false);
    });

    it('should be expired after window end plus interval', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 0, 0, windowEndAt);

      // Expired after windowEndAt + interval
      expect(window.isExpired(now + 120)).toBe(true);
      expect(window.isExpired(now + 130)).toBe(true);
    });

    it('should use current time when not provided', () => {
      const futureWindowEndAt = (Date.now() / 1000) + 1000;
      const window = new SlidingWindow('test', 60, 0, 0, futureWindowEndAt);

      expect(window.isExpired()).toBe(false);
    });
  });

  describe('createFromPreviousWindow', () => {
    it('should create new window with previous hits preserved', () => {
      const now = 1000;
      const oldWindow = new SlidingWindow('test', 60, 50, 30, now + 60);

      const newWindow = SlidingWindow.createFromPreviousWindow('test', 60, oldWindow, now + 70);

      expect(newWindow.getCurrentWindowHitCount()).toBe(0);
      expect(newWindow.getPreviousWindowHitCount()).toBe(50); // Old current becomes new previous
      expect(newWindow.getWindowEndAt()).toBe(now + 70 + 60);
    });

    it('should set correct window end time', () => {
      const now = 2000;
      const oldWindow = new SlidingWindow('test', 120, 25, 10, now);

      const newWindow = SlidingWindow.createFromPreviousWindow('test', 120, oldWindow, now);

      expect(newWindow.getWindowEndAt()).toBe(now + 120);
    });
  });

  describe('calculateTimeForTokens', () => {
    it('should return 0 when tokens are available', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 10, 0, windowEndAt);

      // maxSize 100, used 10, have 90 available, need 50
      expect(window.calculateTimeForTokens(100, 50, now + 30)).toBe(0);
    });

    it('should calculate wait time when tokens not available', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 90, 20, windowEndAt);

      // At 50% into window: (20 * 0.5) + 90 = 100 used
      // maxSize 100, all used, need to wait for window end
      const waitTime = window.calculateTimeForTokens(100, 10, now + 30);
      expect(waitTime).toBe(30); // 30 seconds until window ends
    });

    it('should handle exact availability', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 50, 0, windowEndAt);

      // maxSize 100, used 50, have exactly 50 available
      expect(window.calculateTimeForTokens(100, 50, now)).toBe(0);
    });

    it('should use current time when not provided', () => {
      const window = new SlidingWindow('test', 60, 90, 0);

      const waitTime = window.calculateTimeForTokens(100, 50);
      expect(waitTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getExpirationTime', () => {
    it('should calculate expiration as window end plus interval', () => {
      const windowEndAt = 1000;
      const window = new SlidingWindow('test', 60, 0, 0, windowEndAt);

      expect(window.getExpirationTime()).toBe(1060); // ceil(1000 + 60)
    });

    it('should round up expiration time', () => {
      const windowEndAt = 1000.5;
      const window = new SlidingWindow('test', 60, 0, 0, windowEndAt);

      expect(window.getExpirationTime()).toBe(1061); // ceil(1000.5 + 60)
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should serialize to JSON', () => {
      const window = new SlidingWindow('test', 60, 10, 20, 2000);

      const json = window.toJSON();
      expect(json).toEqual({
        id: 'test',
        hitCount: 10,
        hitCountForLastWindow: 20,
        windowEndAt: 2000,
        intervalInSeconds: 60,
      });
    });

    it('should deserialize from JSON', () => {
      const json = {
        id: 'test-window',
        hitCount: 15,
        hitCountForLastWindow: 25,
        windowEndAt: 3000,
        intervalInSeconds: 120,
      };

      const window = SlidingWindow.fromJSON(json);

      expect(window.getId()).toBe('test-window');
      expect(window.getCurrentWindowHitCount()).toBe(15);
      expect(window.getPreviousWindowHitCount()).toBe(25);
      expect(window.getWindowEndAt()).toBe(3000);
      expect(window.getInterval()).toBe(120);
    });

    it('should round-trip serialize/deserialize', () => {
      const window = new SlidingWindow('round-trip', 300, 100, 200, 5000);

      const json = window.toJSON();
      const restored = SlidingWindow.fromJSON(json as any);

      expect(restored.getId()).toBe(window.getId());
      expect(restored.getCurrentWindowHitCount()).toBe(window.getCurrentWindowHitCount());
      expect(restored.getPreviousWindowHitCount()).toBe(window.getPreviousWindowHitCount());
      expect(restored.getWindowEndAt()).toBe(window.getWindowEndAt());
      expect(restored.getInterval()).toBe(window.getInterval());
    });
  });

  describe('edge cases', () => {
    it('should handle interval of 1 second', () => {
      const now = 1000;
      const windowEndAt = now + 1;
      const window = new SlidingWindow('test', 1, 5, 10, windowEndAt);

      const count = window.getHitCount(now + 0.5);
      // (10 * 0.5) + 5 = 10
      expect(count).toBe(10);
    });

    it('should handle very large intervals', () => {
      const now = 1000;
      const window = new SlidingWindow('test', 86400, 100, 200, now + 86400);

      const count = window.getHitCount(now + 43200); // 50% into day
      // (200 * 0.5) + 100 = 200
      expect(count).toBe(200);
    });

    it('should handle time past window end', () => {
      const now = 1000;
      const windowEndAt = now + 60;
      const window = new SlidingWindow('test', 60, 50, 30, windowEndAt);

      // Past window end
      const count = window.getHitCount(now + 100);
      expect(count).toBe(50); // Just current window hits
    });
  });
});
