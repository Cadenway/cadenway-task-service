import type { AccessRequestPage as AccessRequestPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { AccessRequestPage } from '../../../../application/projections/access-request/access-request-page.projection.js';
import { toAccessRequestsCursor } from './access-request-cursor.mapper.js';
import { toAccessRequest } from './access-request.mapper.js';

/**
 * Function toAccessRequestPage
 *
 * @description
 * Maps one page of pending requests to the `AccessRequestPage` of the contract, with the cursor of
 * the next page for the same filters, `null` on the last one, and the total of every page.
 *
 * @param {AccessRequestPage} page - The page.
 * @param {string | null} spaceId - The `spaceId` filter, `null` for none.
 * @param {string | null} listId - The `listId` filter, `null` for none.
 * @returns {AccessRequestPageBody} The page of the contract.
 */
export function toAccessRequestPage(
  page: AccessRequestPage,
  spaceId: string | null,
  listId: string | null,
): AccessRequestPageBody {
  return {
    items: page.items.map(toAccessRequest),
    nextCursor: toAccessRequestsCursor(page.next, spaceId, listId),
    total: page.total,
  };
}
