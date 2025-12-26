import { Window } from '../Window';

describe('Window', () => {
  describe('constructor', () => {
    it('should create a window with default values', () => {
      const window = new Window('test-window', 60, 100);

      expect(window.getId()).toBe('test-window');
      expect(window.getInterval()).toBe(60);
      expect(window.getHitCount()).toBe(0);
    });

    it('should accept custom initial hit count', () => {
      const window = new Window('test', 60, 100, 50);

      expect(window.getHitCount()).toBe(50);
    });

    it('should accept custom timer', () => {
      const timer = 1000;
      const window = new Window('test', 60, 100, 0, timer);

      expect(window.getTimer()).toBe(timer);
    });
  });

  describe('add', () => {
    it('should add hits to the same window', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 0, now);

      window.add(5, now + 10);
      expect(window.getHitCount()).toBe(5);

      window.add(3, now + 20);
      expect(window.getHitCount()).toBe(8);
    });

    it('should reset hits when moving to a new window', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 50, now);

      // Move to new window (60+ seconds later)
      window.add(10, now + 70);
      expect(window.getHitCount()).toBe(10);
    });

    it('should align timer to window boundary on reset', () => {
      const now = 1000;
      const intervalInSeconds = 60;
      const window = new Window('test', intervalInSeconds, 100, 0, now);

      // Move to new window
      const newTime = now + 125; // 2+ windows later
      window.add(5, newTime);

      // Timer should be aligned to window boundary
      const expectedTimer = Math.floor(newTime / intervalInSeconds) * intervalInSeconds;
      expect(window.getTimer()).toBe(expectedTimer);
    });

    it('should use current time when not provided', () => {
      const window = new Window('test', 60, 100);

      window.add(5);
      expect(window.getHitCount()).toBe(5);
    });

    it('should handle exact window boundary', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 10, now);

      // Exactly at window boundary
      window.add(5, now + 60);
      expect(window.getHitCount()).toBe(5); // Should reset
    });
  });

  describe('getAvailableTokens', () => {
    it('should return max tokens for empty window', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 0, now);

      expect(window.getAvailableTokens(now)).toBe(100);
    });

    it('should return remaining tokens in current window', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 30, now);

      expect(window.getAvailableTokens(now + 10)).toBe(70); // 100 - 30
    });

    it('should return max tokens in new window', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 90, now);

      // Move to new window
      expect(window.getAvailableTokens(now + 70)).toBe(100);
    });

    it('should return 0 when window is full', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 100, now);

      expect(window.getAvailableTokens(now + 10)).toBe(0);
    });

    it('should not return negative tokens', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 150, now); // Over limit

      expect(window.getAvailableTokens(now + 10)).toBe(0);
    });

    it('should use current time when not provided', () => {
      const window = new Window('test', 60, 100, 50);

      const available = window.getAvailableTokens();
      expect(available).toBeGreaterThanOrEqual(0);
      expect(available).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateTimeForTokens', () => {
    it('should return 0 when tokens are already available', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 20, now);

      // Need 50 tokens, have 80 available
      expect(window.calculateTimeForTokens(50, now)).toBe(0);
    });

    it('should calculate wait time for next window', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 90, now);

      // Need 50 tokens, only have 10 available, need to wait for next window
      const waitTime = window.calculateTimeForTokens(50, now + 10);
      expect(waitTime).toBe(50); // 60 - 10 seconds remaining in window
    });

    it('should handle exact window end', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 100, now);

      // At window end, new window starts
      expect(window.calculateTimeForTokens(50, now + 60)).toBe(0);
    });

    it('should use current time when not provided', () => {
      const window = new Window('test', 60, 100, 100);

      const waitTime = window.calculateTimeForTokens(50);
      expect(waitTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getExpirationTime', () => {
    it('should calculate expiration as timer plus interval', () => {
      const now = 1000;
      const window = new Window('test', 60, 100, 0, now);

      expect(window.getExpirationTime()).toBe(1060); // ceil(1000 + 60)
    });

    it('should round up expiration time', () => {
      const now = 1000.5;
      const window = new Window('test', 60, 100, 0, now);

      expect(window.getExpirationTime()).toBe(1061); // ceil(1000.5 + 60)
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should serialize to JSON', () => {
      const window = new Window('test', 60, 100, 50, 1000);

      const json = window.toJSON();
      expect(json).toEqual({
        id: 'test',
        hitCount: 50,
        intervalInSeconds: 60,
        maxSize: 100,
        timer: 1000,
      });
    });

    it('should deserialize from JSON', () => {
      const json = {
        id: 'test-window',
        hitCount: 75,
        intervalInSeconds: 120,
        maxSize: 200,
        timer: 2000,
      };

      const window = Window.fromJSON(json);

      expect(window.getId()).toBe('test-window');
      expect(window.getHitCount()).toBe(75);
      expect(window.getInterval()).toBe(120);
      expect(window.getTimer()).toBe(2000);
    });

    it('should round-trip serialize/deserialize', () => {
      const window = new Window('round-trip', 300, 1000, 500, 5000);

      const json = window.toJSON();
      const restored = Window.fromJSON(json as any);

      expect(restored.getId()).toBe(window.getId());
      expect(restored.getHitCount()).toBe(window.getHitCount());
      expect(restored.getInterval()).toBe(window.getInterval());
      expect(restored.getTimer()).toBe(window.getTimer());
    });
  });

  describe('edge cases', () => {
    it('should handle interval of 1 second', () => {
      const now = 1000;
      const window = new Window('test', 1, 10, 0, now);

      window.add(5, now);
      expect(window.getAvailableTokens(now)).toBe(5);

      // Next second is new window
      expect(window.getAvailableTokens(now + 1)).toBe(10);
    });

    it('should handle max size of 1', () => {
      const now = 1000;
      const window = new Window('test', 60, 1, 0, now);

      window.add(1, now);
      expect(window.getAvailableTokens(now)).toBe(0);
    });

    it('should handle very large intervals', () => {
      const now = 1000;
      const window = new Window('test', 86400, 10000, 5000, now); // 1 day interval

      expect(window.getAvailableTokens(now + 1000)).toBe(5000);
      expect(window.getAvailableTokens(now + 86400)).toBe(10000); // New window
    });
  });
});
