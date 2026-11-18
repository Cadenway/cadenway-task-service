import type { PagePosition } from '../../../../models/page/page-position.model.js';

/**
 * Interface ListSubtasksInput
 *
 * @description
 * A page of the direct subtasks of a task.
 */
export interface ListSubtasksInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the parent. */
  readonly taskKey: string;

  /** The last subtask of the previous page, `null` for the first page. */
  readonly after: PagePosition | null;

  /** The size of the page, 1 to 100. */
  readonly limit: number;
  // #endregion
}
