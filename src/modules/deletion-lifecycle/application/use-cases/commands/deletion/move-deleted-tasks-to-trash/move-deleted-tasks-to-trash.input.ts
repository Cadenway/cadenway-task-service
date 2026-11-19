import type { DeletedTarget } from '../../../../models/deletion/deleted-target.model.js';

/**
 * Interface MoveDeletedTasksToTrashInput
 *
 * @description
 * The deleted list or space whose tasks the deletion job moves to the trash. There is no actor:
 * each entry carries the actor of the deletion, which the tasks module reads on the list.
 */
export interface MoveDeletedTasksToTrashInput {
  // #region Properties
  /** The organization of the job, in lower case, the one of its organization context. */
  readonly organizationId: string;

  /** The deleted list or space, its id in lower case. */
  readonly target: DeletedTarget;

  /**
   * Aborted when the attempt can no longer succeed (expired, or abandoned at shutdown): the use
   * case starts no batch after it, and rejects with its reason.
   */
  readonly signal?: AbortSignal;
  // #endregion
}
