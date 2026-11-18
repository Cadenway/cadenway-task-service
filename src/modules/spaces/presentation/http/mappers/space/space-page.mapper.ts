import type { SpacePage as SpacePageBody } from '@cadenway/contracts/types/internal/task-service';

import type { SpacePage } from '../../../../application/projections/space/space-page.projection.js';
import { toSpacesCursor } from './space-cursor.mapper.js';
import { toSpace } from './space.mapper.js';

/**
 * Function toSpacePage
 *
 * @description
 * Maps one page of the spaces the actor sees to the `SpacePage` of the contract, with the cursor of
 * the next page, `null` on the last one.
 *
 * @param {SpacePage} page - The page.
 * @returns {SpacePageBody} The page of the contract.
 */
export function toSpacePage(page: SpacePage): SpacePageBody {
  return { items: page.items.map(toSpace), nextCursor: toSpacesCursor(page.next) };
}
