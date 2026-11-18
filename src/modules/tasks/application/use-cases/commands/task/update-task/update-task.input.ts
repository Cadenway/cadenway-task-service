import type { TaskChange } from '../../../../models/task/task-change.model.js';

/**
 * Interface UpdateTaskInput
 *
 * @description
 * A patch of a task, as the API layer validated it: the members the request names, `null` where
 * the contract allows it. The assignees, the labels and the checklist are not patched here.
 */
export interface UpdateTaskInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;

  /** The versions `If-Match` accepts, `null` when absent or `*`. */
  readonly expectedVersions: readonly number[] | null;

  /** The patch. */
  readonly patch: TaskChange;
  // #endregion
}
