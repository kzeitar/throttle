import { InMemoryStorage } from '../InMemoryStorage';
import { TokenBucket } from '../../policy/TokenBucket';
import { Rate } from '../../policy/Rate';

describe('InMemoryStorage', () => {
  let storage: InMemoryStorage;
  let bucket: TokenBucket;

  beforeEach(() => {
    storage = new InMemoryStorage();
    bucket = new TokenBucket('test-bucket', 10, Rate.perSecond(1));
  });

  describe('save and fetch', () => {
    it('should save and fetch a state object', async () => {
      await storage.save(bucket);
      const fetched = await storage.fetch('test-bucket');

      expect(fetched).toBe(bucket);
      expect(fetched?.getId()).toBe('test-bucket');
    });

    it('should return null for non-existent id', async () => {
      const fetched = await storage.fetch('non-existent');
      expect(fetched).toBeNull();
    });

    it('should overwrite existing state with same id', async () => {
      const bucket1 = new TokenBucket('test-id', 10, Rate.perSecond(1), 5);
      const bucket2 = new TokenBucket('test-id', 20, Rate.perSecond(2), 10);

      await storage.save(bucket1);
      await storage.save(bucket2);

      const fetched = await storage.fetch('test-id');
      expect(fetched).toBe(bucket2);
      expect((fetched as TokenBucket).getBurstSize()).toBe(20);
    });

    it('should handle multiple different states', async () => {
      const bucket1 = new TokenBucket('bucket-1', 10, Rate.perSecond(1));
      const bucket2 = new TokenBucket('bucket-2', 20, Rate.perSecond(2));
      const bucket3 = new TokenBucket('bucket-3', 30, Rate.perSecond(3));

      await storage.save(bucket1);
      await storage.save(bucket2);
      await storage.save(bucket3);

      expect(await storage.fetch('bucket-1')).toBe(bucket1);
      expect(await storage.fetch('bucket-2')).toBe(bucket2);
      expect(await storage.fetch('bucket-3')).toBe(bucket3);
    });
  });

  describe('delete', () => {
    it('should delete a state object', async () => {
      await storage.save(bucket);
      await storage.delete('test-bucket');

      const fetched = await storage.fetch('test-bucket');
      expect(fetched).toBeNull();
    });

    it('should not throw when deleting non-existent id', async () => {
      await expect(storage.delete('non-existent')).resolves.not.toThrow();
    });

    it('should only delete the specified id', async () => {
      const bucket1 = new TokenBucket('bucket-1', 10, Rate.perSecond(1));
      const bucket2 = new TokenBucket('bucket-2', 20, Rate.perSecond(2));

      await storage.save(bucket1);
      await storage.save(bucket2);
      await storage.delete('bucket-1');

      expect(await storage.fetch('bucket-1')).toBeNull();
      expect(await storage.fetch('bucket-2')).toBe(bucket2);
    });
  });

  describe('expiration', () => {
    it('should return null for expired entries', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      // Create a bucket that will expire in 10 seconds
      const expirableBucket = new TokenBucket('expirable', 10, Rate.perSecond(1), 0, now / 1000);
      await storage.save(expirableBucket);

      // Should exist before expiration
      expect(await storage.fetch('expirable')).toBe(expirableBucket);

      // Advance time past expiration (bucket expires after it can fully refill)
      const expirationMs = expirableBucket.getExpirationTime() * 1000;
      jest.setSystemTime(expirationMs + 1000);

      // Should return null after expiration
      expect(await storage.fetch('expirable')).toBeNull();

      jest.useRealTimers();
    });

    it('should automatically clean up expired entries on fetch', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      const expirableBucket = new TokenBucket('expirable', 10, Rate.perSecond(1), 0, now / 1000);
      await storage.save(expirableBucket);

      expect(storage.size()).toBe(1);

      // Advance time past expiration
      const expirationMs = expirableBucket.getExpirationTime() * 1000;
      jest.setSystemTime(expirationMs + 1000);

      // Fetch should clean up the expired entry
      await storage.fetch('expirable');
      expect(storage.size()).toBe(0);

      jest.useRealTimers();
    });

    it('should handle entries with no expiration (null)', async () => {
      // Create a mock state with no expiration
      const noExpirationState = {
        getId: () => 'no-expiration',
        getExpirationTime: () => null,
      };

      await storage.save(noExpirationState);

      // Should always be fetchable
      expect(await storage.fetch('no-expiration')).toBe(noExpirationState);
    });
  });

  describe('clear', () => {
    it('should clear all stored states', async () => {
      const bucket1 = new TokenBucket('bucket-1', 10, Rate.perSecond(1));
      const bucket2 = new TokenBucket('bucket-2', 20, Rate.perSecond(2));

      await storage.save(bucket1);
      await storage.save(bucket2);

      storage.clear();

      expect(await storage.fetch('bucket-1')).toBeNull();
      expect(await storage.fetch('bucket-2')).toBeNull();
      expect(storage.size()).toBe(0);
    });

    it('should handle clearing empty storage', () => {
      expect(() => storage.clear()).not.toThrow();
      expect(storage.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return 0 for empty storage', () => {
      expect(storage.size()).toBe(0);
    });

    it('should return correct size after adding entries', async () => {
      expect(storage.size()).toBe(0);

      await storage.save(new TokenBucket('bucket-1', 10, Rate.perSecond(1)));
      expect(storage.size()).toBe(1);

      await storage.save(new TokenBucket('bucket-2', 20, Rate.perSecond(2)));
      expect(storage.size()).toBe(2);

      await storage.save(new TokenBucket('bucket-3', 30, Rate.perSecond(3)));
      expect(storage.size()).toBe(3);
    });

    it('should return correct size after deleting entries', async () => {
      await storage.save(new TokenBucket('bucket-1', 10, Rate.perSecond(1)));
      await storage.save(new TokenBucket('bucket-2', 20, Rate.perSecond(2)));
      expect(storage.size()).toBe(2);

      await storage.delete('bucket-1');
      expect(storage.size()).toBe(1);

      await storage.delete('bucket-2');
      expect(storage.size()).toBe(0);
    });

    it('should not change size when saving same id', async () => {
      await storage.save(new TokenBucket('bucket-1', 10, Rate.perSecond(1)));
      expect(storage.size()).toBe(1);

      await storage.save(new TokenBucket('bucket-1', 20, Rate.perSecond(2)));
      expect(storage.size()).toBe(1);
    });
  });
});
