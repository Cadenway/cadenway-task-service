import type { ArchivePosition } from '../../../../models/archive/archive-position.model.js';

/**
 * Interface ListArchivedTasksInput
 *
 * @description
 * A page of the archived tasks the actor sees.
 */
export interface ListArchivedTasksInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The last root of the previous page, `null` for the first page. */
  readonly after: ArchivePosition | null;

  /** The size of the page, 1 to 100. */
  readonly limit: number;
  // #endregion
}
