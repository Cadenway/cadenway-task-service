import type { ListPosition } from '../../models/placement/list-position.model.js';
import type { ListSummaryView } from './list-summary.projection.js';

/**
 * Interface SpaceOverviewView
 *
 * @description
 * One page of the lists of a space with the counts of their top-level tasks, in the order of the
 * sidebar: by restoration from the archives, else creation, then id (`SpaceOverview` of the
 * contract).
 */
export interface SpaceOverviewView {
  // #region Properties
  /** The space. */
  readonly spaceId: string;

  /** How many lists the space has, whatever the page. */
  readonly listCount: number;

  /** How many top-level tasks the lists of the space hold, whatever the page. */
  readonly taskCount: number;

  /** The lists of the page. */
  readonly items: readonly ListSummaryView[];

  /** Where the next page starts, `null` on the last page. */
  readonly next: ListPosition | null;
  // #endregion
}
