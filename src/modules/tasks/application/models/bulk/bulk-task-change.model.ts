import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { SpaceStatusUse } from '../../../domain/value-objects/task/space-status-use.value-object.js';
import type { TaskPatch } from '../../../domain/value-objects/task/task-patch.value-object.js';
import type { TaskUpdate } from '../../../domain/value-objects/task/task-update.value-object.js';

/** A validated change and the data needed to commit it and any successor. */
export interface BulkTaskChange {
  // #region Properties
  /** The task as it was locked. */
  readonly before: Task;

  /** The preview with the resulting task and changed fields. */
  readonly update: TaskUpdate;

  /** Eligible watchers held for any status and milestone facts. */
  readonly watcherIds: readonly string[];

  /** The patch and allowed statuses for an occurrence awaiting a key. */
  readonly occurrence?: { readonly patch: TaskPatch; readonly statuses: SpaceStatusUse };
  // #endregion
}
