import type { ActivityEntryView } from './activity-entry-view.projection.js';
import type { ActivityPosition } from '../../models/activity/activity-position.model.js';

/**
 * Interface ActivityPage
 *
 * @description
 * One page of an activity log, most recent first.
 */
export interface ActivityPage {
  // #region Properties
  /** The entries of the page. */
  readonly items: readonly ActivityEntryView[];

  /** Where the next page starts, `null` on the last page. */
  readonly next: ActivityPosition | null;

  /** How many entries match the filters. */
  readonly total: number;
  // #endregion
}
