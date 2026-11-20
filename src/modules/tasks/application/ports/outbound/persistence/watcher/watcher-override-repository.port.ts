import type { WatcherOverride } from '../../../../../domain/value-objects/watcher/watcher-override.value-object.js';

/** Tenant-scoped watcher overrides bound to the task transaction. */
export interface WatcherOverrideRepository {
  // #region Methods
  /** Reads all explicit overrides of one task, bounded by the contract limit. */
  list(organizationId: string, taskId: string): Promise<readonly WatcherOverride[]>;
  // #endregion
}
