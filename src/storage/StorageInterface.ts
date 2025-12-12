import type { LimiterStateInterface } from '../LimiterStateInterface';

/**
 * Interface for persisting rate limiter state.
 *
 * Implementations can use in-memory storage, Redis, file system, or any other
 * persistence mechanism.
 */
export interface StorageInterface {
  /**
   * Save a state object.
   *
   * @param state - The state object to save
   */
  save(state: LimiterStateInterface): Promise<void>;

  /**
   * Fetch a state object by ID.
   *
   * @param id - The unique identifier for the state
   * @returns The state object, or null if not found or expired
   */
  fetch(id: string): Promise<LimiterStateInterface | null>;

  /**
   * Delete a state object by ID.
   *
   * @param id - The unique identifier for the state
   */
  delete(id: string): Promise<void>;
}
