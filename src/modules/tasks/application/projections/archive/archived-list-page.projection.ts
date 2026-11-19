import type { ArchivePosition } from '../../models/archive/archive-position.model.js';
import type { ArchivedListView } from './archived-list.projection.js';

/**
 * Interface ArchivedListPage
 *
 * @description
 * One page of the archived lists an actor has a role on, the most recently archived first.
 */
export interface ArchivedListPage {
  // #region Properties
  /** The lists of the page. */
  readonly items: readonly ArchivedListView[];

  /** Where the next page starts, `null` on the last page. */
  readonly next: ArchivePosition | null;

  /** How many archived lists the actor has a role on, every page included. */
  readonly total: number;
  // #endregion
}
