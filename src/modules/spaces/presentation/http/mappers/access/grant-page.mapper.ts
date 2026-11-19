import type { GrantPage as GrantPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { GrantPage } from '../../../../application/projections/access/grant-page.projection.js';
import { toGrantsCursor } from './grant-cursor.mapper.js';
import { toGrant } from './grant.mapper.js';

/**
 * Function toGrantPage
 *
 * @description
 * Maps one page of the grants of a space or a list to the `GrantPage` of the contract, with the
 * cursor of the next page (`null` on the last one) and the total.
 *
 * @param {GrantPage} page - The page.
 * @param {'space-grants' | 'list-grants'} collection - The grants of a space or of a list.
 * @param {string} resourceId - The space or the list of the path, which the cursor names.
 * @returns {GrantPageBody} The page of the contract.
 */
export function toGrantPage(
  page: GrantPage,
  collection: 'space-grants' | 'list-grants',
  resourceId: string,
): GrantPageBody {
  return {
    items: page.items.map(toGrant),
    nextCursor: toGrantsCursor(page.next, collection, resourceId),
    total: page.total,
  };
}
