import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';

/**
 * Interface TrashEntryDraft
 *
 * @description
 * A new trash entry, before PostgreSQL gives it its id: a task and its subtasks at every level,
 * deleted together (`TrashEntry` of `openapi/internal/task-service.yaml`).
 */
export interface TrashEntryDraft {
  // #region Properties
  /** The organization of the transaction. */
  readonly organizationId: string;

  /** The task at the root of the entry. */
  readonly rootTaskId: string;

  /** The list of the root, which every task of the entry keeps and the entry comes back to. */
  readonly listId: string;

  /** The key of the parent of the root as it read when it was deleted, `null` for none. */
  readonly parentKey: string | null;

  /** The root and the tasks deleted with it, 1 at least. */
  readonly taskCount: number;

  /** When the entry was made, the transaction instant. */
  readonly trashedAt: Date;

  /** Who deleted the task, or the list or space it was in. */
  readonly trashedBy: TaskActor;
  // #endregion
}
