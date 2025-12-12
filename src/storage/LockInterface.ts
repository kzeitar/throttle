/**
 * Interface for distributed locking mechanism.
 *
 * Used to ensure atomic operations on rate limiter state in distributed environments.
 */
export interface LockInterface {
  /**
   * Acquire a lock for the given resource.
   *
   * @param key - The resource identifier to lock
   * @param ttl - Time-to-live for the lock in seconds (optional)
   * @returns True if lock was acquired, false otherwise
   */
  acquire(key: string, ttl?: number): Promise<boolean>;

  /**
   * Release a lock for the given resource.
   *
   * @param key - The resource identifier to unlock
   */
  release(key: string): Promise<void>;

  /**
   * Execute a callback while holding a lock.
   *
   * Automatically acquires and releases the lock.
   *
   * @param key - The resource identifier to lock
   * @param callback - Function to execute while holding the lock
   * @param ttl - Time-to-live for the lock in seconds (optional)
   * @returns The result of the callback
   */
  withLock<T>(
    key: string,
    callback: () => Promise<T>,
    ttl?: number
  ): Promise<T>;
}

/**
 * Simple no-op lock implementation for single-instance applications.
 */
export class NoLock implements LockInterface {
  async acquire(): Promise<boolean> {
    return true;
  }

  async release(): Promise<void> {
    // No-op
  }

  async withLock<T>(
    _key: string,
    callback: () => Promise<T>
  ): Promise<T> {
    return callback();
  }
}
