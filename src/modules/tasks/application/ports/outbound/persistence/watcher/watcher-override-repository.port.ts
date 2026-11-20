import type { WatcherOverride } from '../../../../../domain/value-objects/watcher/watcher-override.value-object.js';

/** Tenant-scoped watcher overrides bound to the task transaction. */
export interface WatcherOverrideRepository {
  // #region Methods
  /** Reads all explicit overrides of one task, bounded by the contract limit. */
  list(organizationId: string, taskId: string): Promise<readonly WatcherOverride[]>;

  /** Saves an explicit override under the owning task's held write lock. */
  set(organizationId: string, taskId: string, override: WatcherOverride): Promise<void>;

  /**
   * Locks task rows with an override for this account in ascending task id, starting
   * after the last id of the previous cleanup batch.
   */
  lockTaskIdsForMember(
    organizationId: string,
    userId: string,
    afterTaskId: string | null,
    limit: number,
  ): Promise<readonly string[]>;

  /** Deletes this account's overrides for tasks locked by the cleanup. */
  removeForMember(
    organizationId: string,
    userId: string,
    taskIds: readonly string[],
  ): Promise<number>;
  // #endregion
}
