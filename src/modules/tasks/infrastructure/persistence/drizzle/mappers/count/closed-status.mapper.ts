import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { CLOSED_STATUS_KEYS } from '../../../../../domain/value-objects/task/status-category.value-object.js';
import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import { tasks } from '../../schemas/task/task.schema.js';

/**
 * Function closedStatuses
 *
 * @description
 * The list of the closed status keys (`CLOSED_STATUS_KEYS`) as SQL literals. The keys are
 * constants of the domain, never input.
 *
 * @returns {SQL} The comma-separated literals.
 */
function closedStatuses(): SQL {
  return sql.raw(CLOSED_STATUS_KEYS.map((key: string): string => `'${key}'`).join(', '));
}

/**
 * Function isClosed
 *
 * @description
 * The condition that a task is closed (`done` or `cancelled`).
 *
 * @returns {SQL} The condition.
 */
export function isClosed(): SQL {
  return sql`${tasks.status} in (${closedStatuses()})`;
}

/**
 * Function isNotClosed
 *
 * @description
 * The condition that a task is not closed (the categories `open` and `active`).
 *
 * @returns {SQL} The condition.
 */
export function isNotClosed(): SQL {
  return sql`${tasks.status} not in (${closedStatuses()})`;
}

/**
 * Function hasStatus
 *
 * @description
 * The condition that a task holds one status key. The key is typed, a constant of the domain and
 * never input, so it can be written as a literal.
 *
 * @param {StatusKey} status - The status key.
 * @returns {SQL} The condition.
 */
export function hasStatus(status: StatusKey): SQL {
  return sql`${tasks.status} = ${sql.raw(`'${status}'`)}`;
}

/**
 * Function isLateOn
 *
 * @description
 * The condition that a task is late on the date of the caller: not closed and due strictly before
 * `today`. It is `isLate` of the lateness policy of the domain
 * (`openapi/internal/task-service.yaml:3339-3341`) in SQL; a task without a due date is never late,
 * since the comparison with `null` is not true.
 *
 * @param {string} today - The date of the caller, `YYYY-MM-DD`.
 * @returns {SQL} The condition.
 */
export function isLateOn(today: string): SQL {
  return sql`${isNotClosed()} and ${tasks.dueDate} < ${today}::date`;
}
