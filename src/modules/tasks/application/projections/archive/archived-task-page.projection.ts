import type { ArchivePosition } from '../../models/archive/archive-position.model.js';
import type { ArchivedTaskView } from './archived-task.projection.js';

/**
 * Interface ArchivedTaskPage
 *
 * @description
 * One page of the archived tasks an actor sees, the most recently archived first.
 */
export interface ArchivedTaskPage {
  // #region Properties
  /** The roots of the archives of the page. */
  readonly items: readonly ArchivedTaskView[];

  /** Where the next page starts, `null` on the last page. */
  readonly next: ArchivePosition | null;

  /** How many archives the actor sees, every page included. */
  readonly total: number;
  // #endregion
}
