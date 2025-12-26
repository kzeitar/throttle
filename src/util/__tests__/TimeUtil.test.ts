import { TimeUtil } from '../TimeUtil';

describe('TimeUtil', () => {
  describe('durationToSeconds', () => {
    it('should convert seconds correctly', () => {
      expect(TimeUtil.durationToSeconds('1 second')).toBe(1);
      expect(TimeUtil.durationToSeconds('2 seconds')).toBe(2);
      expect(TimeUtil.durationToSeconds('5 s')).toBe(5);
      expect(TimeUtil.durationToSeconds('10s')).toBe(10);
      expect(TimeUtil.durationToSeconds('3 sec')).toBe(3);
    });

    it('should convert minutes correctly', () => {
      expect(TimeUtil.durationToSeconds('1 minute')).toBe(60);
      expect(TimeUtil.durationToSeconds('2 minutes')).toBe(120);
      expect(TimeUtil.durationToSeconds('5 m')).toBe(300);
      expect(TimeUtil.durationToSeconds('10m')).toBe(600);
      expect(TimeUtil.durationToSeconds('3 min')).toBe(180);
    });

    it('should convert hours correctly', () => {
      expect(TimeUtil.durationToSeconds('1 hour')).toBe(3600);
      expect(TimeUtil.durationToSeconds('2 hours')).toBe(7200);
      expect(TimeUtil.durationToSeconds('5 h')).toBe(18000);
      expect(TimeUtil.durationToSeconds('10h')).toBe(36000);
      expect(TimeUtil.durationToSeconds('3 hr')).toBe(10800);
    });

    it('should convert days correctly', () => {
      expect(TimeUtil.durationToSeconds('1 day')).toBe(86400);
      expect(TimeUtil.durationToSeconds('2 days')).toBe(172800);
      expect(TimeUtil.durationToSeconds('7 d')).toBe(604800);
      expect(TimeUtil.durationToSeconds('10d')).toBe(864000);
    });

    it('should convert weeks correctly', () => {
      expect(TimeUtil.durationToSeconds('1 week')).toBe(604800);
      expect(TimeUtil.durationToSeconds('2 weeks')).toBe(1209600);
      expect(TimeUtil.durationToSeconds('3 w')).toBe(1814400);
      expect(TimeUtil.durationToSeconds('4w')).toBe(2419200);
    });

    it('should convert months correctly (30 days)', () => {
      expect(TimeUtil.durationToSeconds('1 month')).toBe(2592000);
      expect(TimeUtil.durationToSeconds('2 months')).toBe(5184000);
      expect(TimeUtil.durationToSeconds('3 month')).toBe(7776000);
    });

    it('should convert years correctly (365 days)', () => {
      expect(TimeUtil.durationToSeconds('1 year')).toBe(31536000);
      expect(TimeUtil.durationToSeconds('2 years')).toBe(63072000);
      expect(TimeUtil.durationToSeconds('1 y')).toBe(31536000);
      expect(TimeUtil.durationToSeconds('3y')).toBe(94608000);
    });

    it('should handle whitespace variations', () => {
      expect(TimeUtil.durationToSeconds('  5   seconds  ')).toBe(5);
      expect(TimeUtil.durationToSeconds('10m')).toBe(600);
      expect(TimeUtil.durationToSeconds('1    hour')).toBe(3600);
    });

    it('should be case insensitive', () => {
      expect(TimeUtil.durationToSeconds('5 SECONDS')).toBe(5);
      expect(TimeUtil.durationToSeconds('10 Minutes')).toBe(600);
      expect(TimeUtil.durationToSeconds('1 HOUR')).toBe(3600);
    });

    it('should throw error for invalid format', () => {
      expect(() => TimeUtil.durationToSeconds('invalid')).toThrow('Invalid duration format');
      expect(() => TimeUtil.durationToSeconds('abc seconds')).toThrow();
      expect(() => TimeUtil.durationToSeconds('')).toThrow();
    });

    it('should throw error for negative amounts', () => {
      expect(() => TimeUtil.durationToSeconds('-5 seconds')).toThrow('Invalid duration format');
    });

    it('should throw error for unknown units', () => {
      expect(() => TimeUtil.durationToSeconds('5 fortnights')).toThrow('Unknown time unit');
      expect(() => TimeUtil.durationToSeconds('10 xyz')).toThrow('Unknown time unit');
    });

    it('should handle zero values', () => {
      expect(TimeUtil.durationToSeconds('0 seconds')).toBe(0);
      expect(TimeUtil.durationToSeconds('0 minutes')).toBe(0);
    });
  });

  describe('now', () => {
    it('should return current time in seconds', () => {
      const before = Date.now() / 1000;
      const now = TimeUtil.now();
      const after = Date.now() / 1000;

      expect(now).toBeGreaterThanOrEqual(before);
      expect(now).toBeLessThanOrEqual(after);
    });

    it('should return a number', () => {
      expect(typeof TimeUtil.now()).toBe('number');
    });

    it('should have decimal precision (milliseconds)', () => {
      const now = TimeUtil.now();
      expect(now % 1).not.toBe(0);
    });
  });

  describe('msToSeconds', () => {
    it('should convert milliseconds to seconds', () => {
      expect(TimeUtil.msToSeconds(1000)).toBe(1);
      expect(TimeUtil.msToSeconds(5000)).toBe(5);
      expect(TimeUtil.msToSeconds(60000)).toBe(60);
    });

    it('should handle fractional seconds', () => {
      expect(TimeUtil.msToSeconds(500)).toBe(0.5);
      expect(TimeUtil.msToSeconds(1500)).toBe(1.5);
      expect(TimeUtil.msToSeconds(100)).toBe(0.1);
    });

    it('should handle zero', () => {
      expect(TimeUtil.msToSeconds(0)).toBe(0);
    });
  });

  describe('secondsToMs', () => {
    it('should convert seconds to milliseconds', () => {
      expect(TimeUtil.secondsToMs(1)).toBe(1000);
      expect(TimeUtil.secondsToMs(5)).toBe(5000);
      expect(TimeUtil.secondsToMs(60)).toBe(60000);
    });

    it('should handle fractional seconds', () => {
      expect(TimeUtil.secondsToMs(0.5)).toBe(500);
      expect(TimeUtil.secondsToMs(1.5)).toBe(1500);
      expect(TimeUtil.secondsToMs(0.1)).toBe(100);
    });

    it('should handle zero', () => {
      expect(TimeUtil.secondsToMs(0)).toBe(0);
    });
  });

  describe('round-trip conversions', () => {
    it('should convert back and forth without loss', () => {
      const ms = 5432;
      expect(TimeUtil.secondsToMs(TimeUtil.msToSeconds(ms))).toBe(ms);

      const seconds = 10.5;
      expect(TimeUtil.msToSeconds(TimeUtil.secondsToMs(seconds))).toBe(seconds);
    });
  });
});
