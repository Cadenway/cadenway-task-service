import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { spaces } from '../../schemas/space/space.schema.js';

/**
 * Function undeletedSpaceCondition
 *
 * @description
 * The ONE condition that leaves the tombstones of deleted spaces out ("A space the caller does not
 * see answers `404 space.not-found`, as an unknown or deleted one does" of
 * `openapi/public/spaces.yaml`): every reading, lock and collection of spaces applies it, through
 * `visibleSpaceCondition` and `visibleListCondition` or alone for a reading by id, except the
 * trash, the deletion machinery and the clean-up of a member who left, which read the tombstones
 * on purpose.
 *
 * @returns {SQL} The condition, over the columns of `spaces`.
 */
export function undeletedSpaceCondition(): SQL {
  return sql`${spaces.deletedAt} is null`;
}

/**
 * Function deletedSpaceCondition
 *
 * @description
 * The condition that keeps the tombstones of deleted spaces, for the deletion machinery only (the
 * erasure of a tombstone).
 *
 * @returns {SQL} The condition, over the columns of `spaces`.
 */
export function deletedSpaceCondition(): SQL {
  return sql`${spaces.deletedAt} is not null`;
}
