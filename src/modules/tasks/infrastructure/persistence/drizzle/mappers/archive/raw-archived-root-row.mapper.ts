import type { RawTaskPageRow } from '../query/raw-task-page-row.mapper.js';

/**
 * Interface RawArchivedRootRow
 *
 * @description
 * A row of a page of the roots of the archives as the database returns it: the columns of a
 * summary under the names of a page of tasks (`taskPageColumns`), the instants as ISO 8601 text,
 * and the archive of the root.
 */
export interface RawArchivedRootRow extends Omit<RawTaskPageRow, 'sortValue'> {
  // #region Properties
  /** When the archive was made, as ISO 8601 text in UTC. */
  readonly archivedAt: string;

  /** The stored type of the actor who made it. */
  readonly archivedByType: string;

  /** The id of that actor. */
  readonly archivedById: string;
  // #endregion
}
