import type { SpaceOverview } from '@cadenway/contracts/types/internal/task-service';

import type { SpaceOverviewView } from '../../../../application/projections/count/space-overview.projection.js';
import { toListSummary } from './list-summary.mapper.js';
import { toSpaceOverviewCursor } from './space-overview-cursor.mapper.js';

/**
 * Function toSpaceOverview
 *
 * @description
 * Maps the overview of a space to the `SpaceOverview` of the contract: the space, the number of its
 * lists and of its top-level tasks (whole space, on every page), one page of its lists in the order
 * of the sidebar with their counters, and the cursor of the next page, `null` on the last one.
 *
 * @param {SpaceOverviewView} view - The overview.
 * @returns {SpaceOverview} The overview of the contract.
 */
export function toSpaceOverview(view: SpaceOverviewView): SpaceOverview {
  return {
    spaceId: view.spaceId,
    listCount: view.listCount,
    taskCount: view.taskCount,
    items: view.items.map(toListSummary),
    nextCursor: toSpaceOverviewCursor(view.next, view.spaceId),
  };
}
