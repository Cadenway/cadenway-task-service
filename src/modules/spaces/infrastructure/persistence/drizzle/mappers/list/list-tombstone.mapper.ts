import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { taskLists } from '../../schemas/list/task-list.schema.js';

/**
 * Function undeletedListCondition
 *
 * @description
 * The ONE condition that leaves the tombstones of deleted lists out ("A list the caller does not
 * see answers `404 list.not-found`, as an unknown or deleted one does" of
 * `openapi/public/lists.yaml`): every reading, lock and collection of lists applies it, through
 * `visibleListCondition` or alone for a reading by id, and so do the grants of lists that show a
 * space (`viewerListSpaces`, `viewerGrants`); the trash, the deletion machinery and the clean-up of
 * a member who left read the tombstones on purpose.
 *
 * @returns {SQL} The condition, over the columns of `lists`.
 */
export function undeletedListCondition(): SQL {
  return sql`${taskLists.deletedAt} is null`;
}

/**
 * Function deletedListCondition
 *
 * @description
 * The condition that keeps the tombstones of deleted lists, for the deletion machinery only
 * (`ListDeletedSpaceLists`, the erasure of a tombstone).
 *
 * @returns {SQL} The condition, over the columns of `lists`.
 */
export function deletedListCondition(): SQL {
  return sql`${taskLists.deletedAt} is not null`;
}
