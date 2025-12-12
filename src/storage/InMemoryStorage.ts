import type { LimiterStateInterface } from '../LimiterStateInterface';
import type { StorageInterface } from './StorageInterface';

interface StorageEntry {
  expiresAt: number | null;
  state: LimiterStateInterface;
}

/**
 * In-memory storage implementation for rate limiter state.
 *
 * This storage is non-persistent and will be lost when the process restarts.
 * Suitable for single-instance applications or testing.
 */
export class InMemoryStorage implements StorageInterface {
  private readonly storage = new Map<string, StorageEntry>();

  /**
   * Save a state object to memory.
   */
  async save(state: LimiterStateInterface): Promise<void> {
    const expirationTime = state.getExpirationTime();
    const expiresAt = expirationTime ? expirationTime * 1000 : null; // Convert to ms

    this.storage.set(state.getId(), {
      expiresAt,
      state,
    });
  }

  /**
   * Fetch a state object from memory.
   *
   * Automatically cleans up expired entries.
   */
  async fetch(id: string): Promise<LimiterStateInterface | null> {
    const entry = this.storage.get(id);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.storage.delete(id);
      return null;
    }

    return entry.state;
  }

  /**
   * Delete a state object from memory.
   */
  async delete(id: string): Promise<void> {
    this.storage.delete(id);
  }

  /**
   * Clear all stored state (useful for testing).
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Get the number of stored entries (useful for testing).
   */
  size(): number {
    return this.storage.size;
  }
}
